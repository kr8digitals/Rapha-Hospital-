-- ============================================================================
-- Chi-Tom Rapha Hospital & Maternity — Supabase schema
-- Run this ENTIRE file in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (The SQL editor runs as supabase_admin, which is exactly what these
--  SECURITY DEFINER functions need to own.)
-- ============================================================================

-- 1) Server-only secrets -----------------------------------------------------
create table if not exists public._rapha_secrets (
  k text primary key,
  v text not null
);
alter table public._rapha_secrets enable row level security;

-- DB_SECRET — keep this value secret; the Vercel env var DB_SECRET must match it.
insert into public._rapha_secrets (k, v) values ('db_secret', '97a484b674822283dca2945cf96787df81f4cde59336818f')
on conflict (k) do update set v = excluded.v;

-- 2) Content store (single row) ----------------------------------------------
create table if not exists public.site_content (
  id integer primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  posts jsonb not null default '[]'::jsonb,
  announcements jsonb not null default '[]'::jsonb,
  testimonials jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_content force row level security;

-- Nobody can touch the table directly — not even the table owner — unless a
-- rapha_* function has authorised the transaction via app.rapha.authorized.
drop policy if exists "definer_only" on public.site_content;
create policy "definer_only" on public.site_content
  for all
  using (coalesce(current_setting('app.rapha.authorized', true), '') = 'true')
  with check (coalesce(current_setting('app.rapha.authorized', true), '') = 'true');

-- 3) Secret check (raises unless p_secret matches _rapha_secrets) -------------
create or replace function public.rapha_check_secret(p_secret text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_secret is distinct from (select v from public._rapha_secrets where k = 'db_secret') then
    raise exception 'unauthorized';
  end if;
  perform set_config('app.rapha.authorized', 'true', true);
end;
$$;

-- 4) API functions (called from api/index.js) ---------------------------------
create or replace function public.rapha_public_content(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r public.site_content%rowtype;
begin
  perform public.rapha_check_secret(p_secret);
  select * into r from public.site_content where id = 1;
  return jsonb_build_object(
    'settings', r.settings,
    'posts', (select coalesce(jsonb_agg(v), '[]'::jsonb)
               from jsonb_array_elements(r.posts) v
              where v->>'status' <> 'draft'),
    'announcements', r.announcements,
    'testimonials', (select coalesce(jsonb_agg(v), '[]'::jsonb)
                      from jsonb_array_elements(r.testimonials) v
                     where v->>'status' = 'publish')
  );
end;
$$;

create or replace function public.rapha_admin_content(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r public.site_content%rowtype;
begin
  perform public.rapha_check_secret(p_secret);
  select * into r from public.site_content where id = 1;
  return jsonb_build_object(
    'settings', r.settings,
    'posts', r.posts,
    'announcements', r.announcements,
    'testimonials', r.testimonials
  );
end;
$$;

create or replace function public.rapha_add_testimonial(p_secret text, p_item jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rapha_check_secret(p_secret);
  update public.site_content
     set testimonials = testimonials || jsonb_build_array(p_item),
         updated_at = now()
   where id = 1;
end;
$$;

create or replace function public.rapha_save_content(p_secret text, p_patch jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rapha_check_secret(p_secret);
  update public.site_content set
    settings = case when jsonb_exists(p_patch, 'settings') then p_patch->'settings' else settings end,
    posts = case when jsonb_exists(p_patch, 'posts') then p_patch->'posts' else posts end,
    announcements = case when jsonb_exists(p_patch, 'announcements') then p_patch->'announcements' else announcements end,
    testimonials = case when jsonb_exists(p_patch, 'testimonials') then p_patch->'testimonials' else testimonials end,
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.rapha_replace_content(p_secret text, p_content jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rapha_check_secret(p_secret);
  update public.site_content set
    settings = coalesce(p_content->'settings', '{}'::jsonb),
    posts = coalesce(p_content->'posts', '[]'::jsonb),
    announcements = coalesce(p_content->'announcements', '[]'::jsonb),
    testimonials = coalesce(p_content->'testimonials', '[]'::jsonb),
    updated_at = now()
  where id = 1;
end;
$$;

grant execute on function
  public.rapha_check_secret(text),
  public.rapha_public_content(text),
  public.rapha_admin_content(text),
  public.rapha_add_testimonial(text, jsonb),
  public.rapha_save_content(text, jsonb),
  public.rapha_replace_content(text, jsonb)
to anon, authenticated, service_role;

-- 5) Seed content (original articles, announcements and settings) -------------
insert into public.site_content (id, settings, posts, announcements, testimonials)
values (1, {"siteName":"Chi-Tom Rapha Hospital & Maternity","tagline":"We Care, God Heals.","heroTitle":"We Care, God Heals","heroLead":"At Chi-Tom Rapha Hospital & Maternity, we provide accessible and affordable healthcare with a humane approach\u2014serving individuals, mothers, children and families with professional medical care, compassion and dignity.","phone":"+234 706 958 8315","phoneTel":"+2347069588315","phone2":"+234 812 559 0397","phone2Tel":"+2348125590397","email":"contact@chitomraphahospital.com","address":"1 ChiTom Rapha Hospital Avenue, Okpoduma Nwofe Izzi LGA, 480102 Abakaliki, Nigeria.","addressShort":"1 Chitom Rapha Hospital Avenue, Okpoduma Agbaja","hours":"24/7 Medical Services","whatsapp":"2347069588315"}, [{"id":"p1","slug":"antenatal-first-visit","title":"Your First Antenatal Visit: What to Expect and How to Prepare","category":"Maternity","icon":"venus","image":"assets/nurse.jpg","date":"2026-09-21","status":"publish","excerpt":"Booking your first antenatal visit is one of the most important decisions of pregnancy. Here is what happens at that first appointment, what to bring, and the questions worth asking.","body":"Pregnancy changes everything \u2014 and the first antenatal visit is where your care plan begins. It is not just a formality: it is the appointment where your baseline is set, early risks are screened for, and you get a clear picture of how your pregnancy is progressing.\n\n## Why booking early matters\n\nThe earlier you book, the more time there is to act. Early antenatal care allows your clinician to confirm the dates of your pregnancy, establish your blood pressure and blood type, check for conditions like anaemia, and start screening for infections that are treatable but only when caught in time. It also gives you a team who knows you \u2014 your history, your medicines, your concerns \u2014 from the very beginning.\n\n## What happens at your first visit\n\nExpect a conversation first. Your clinician will ask about your medical history, any current medications, your family history, and how the pregnancy has been going so far. After that, the visit typically includes:\n\n- A physical examination, including blood pressure measurement\n- Basic blood and urine tests \u2014 commonly blood group, haemoglobin (to screen for anaemia), and screening for infections such as syphilis and HIV\n- Confirmation of how far along the pregnancy is, sometimes with an ultrasound\n- A review of your nutrition, activity and any symptoms like vomiting or bleeding\n- A plan for the visits ahead, including when to return and what to watch for in between\n\nNo question is too small. This is the appointment to ask the things you have been quietly wondering about.\n\n## What to bring\n\n- Your identification\n- Any previous medical records or previous antenatal cards\n- A list of medicines, vitamins or herbal products you currently take\n- Your insurance card or NHIS card, if you have one\n- A written list of your questions \u2014 it is easy to forget them in the room\n\n## Red flags between visits\n\n> Seek medical attention promptly if you notice vaginal bleeding, a severe headache that does not settle, blurred vision, sudden swelling of the face or hands, a high fever, or \u2014 later in pregnancy \u2014 a noticeable reduction in your baby''s movements. Do not wait for your next scheduled appointment.\n\nAt Chi-Tom Rapha Hospital & Maternity, our antenatal clinic is there for you at every stage \u2014 from your first booking to the day of delivery and beyond. We are open 24 hours a day, so if anything feels wrong, call +234 706 958 8315 and we will help."},{"id":"p2","slug":"emergency-warning-signs","title":"When to Go to the Emergency Room: Warning Signs You Should Never Ignore","category":"Emergency Care","icon":"siren","image":"assets/nurse-team.jpg","date":"2026-09-18","status":"publish","excerpt":"In an emergency, the fastest decisions save lives. This guide lays out the red-flag symptoms in adults, children and pregnancy that should send you straight to emergency care \u2014 without waiting to see if it gets better.","body":"Most people have a healthy instinct to ''wait and see'' when they feel unwell. For many problems, that is sensible. But some conditions get measurably worse with every hour \u2014 and for those, the correct response is not observation. It is immediate care.\n\n## Red flags in adults\n\nGo to an emergency room immediately if you or someone with you experiences any of the following:\n\n- Chest pain, pressure or tightness, especially with sweating or breathlessness\n- Sudden difficulty breathing\n- Signs of a stroke \u2014 remember **FAST**: Face drooping, Arm weakness, Speech difficulty, Time to call. Any one of these is an emergency, even if it seems to improve\n- Heavy or uncontrollable bleeding\n- Severe abdominal pain, particularly with a rigid or swollen belly\n- A sudden, severe ''thunderclap'' headache\n- Confusion, unusual drowsiness, or difficulty waking\n- A seizure, especially the first one\n- A high fever with stiff neck\n- Burns covering a large area of the body, or suspected poisoning\n\n## Red flags in children\n\nChildren can deteriorate faster than adults. Seek urgent care if a child has:\n\n- Difficulty breathing \u2014 fast breathing, grunting, or ribs pulling in with each breath\n- Signs of dehydration: very few or no wet nappies, no tears when crying, a sunken soft spot in babies\n- A fever in any baby under three months of age\n- A seizure or convulsion\n- A child who is unusually sleepy, floppy, or hard to wake\n- A serious fall \u2014 especially onto the head\n- Refusal to drink for more than a day, or repeated vomiting\n\n## Red flags in pregnancy\n\n- Vaginal bleeding at any stage of pregnancy\n- A severe headache with visual disturbance\n- Sudden swelling of the face, hands or feet\n- Painful regular contractions before term\n- Labour lasting much longer than expected\n- A noticeable reduction in your baby''s movements\n\n> **When in doubt, come in.** It is always the right call. At Chi-Tom Rapha Hospital & Maternity our emergency line is open around the clock: +234 706 958 8315.\n\n## While you are on your way\n\n- Keep the person calm, sitting or lying in the most comfortable position\n- Do not give food or drink in case an operation may be needed\n- Note the time the symptoms started \u2014 it matters to the treating team\n- Bring their identification, any medicine they take, and a phone that is charged\n- If breathing stops, begin rescue breaths and keep the ambulance or driver informed of what you see\n\nNone of this is a diagnosis \u2014 it is a list of moments where waiting costs more than going. Save it, share it with your family, and keep our emergency number close."},{"id":"p3","slug":"child-immunization-nigeria","title":"Protecting Your Child: The Routine Immunization Schedule in Nigeria","category":"Prevention","icon":"shield","image":"assets/team-contact.jpg","date":"2026-09-15","status":"publish","excerpt":"Vaccines remain the single most effective tool we have against childhood disease. Here is the national schedule, in plain language \u2014 what your child receives, when, and why each one matters.","body":"Every year, millions of children in Nigeria are protected by routine immunization. It is quiet, unglamorous work \u2014 a few drops, a few small injections across the first year of life \u2014 but it is the single most effective shield we have against diseases that can injure or kill. Here is the national schedule in plain language.\n\n## The national schedule, month by month\n\n- **At birth:** BCG (protects against severe forms of tuberculosis), the birth dose of polio vaccine (OPV0) and the birth dose of Hepatitis B vaccine\n- **6, 10 and 14 weeks:** three doses each of the Pentavalent vaccine (which combines protection against diphtheria, pertussis/whooping cough, tetanus, Hepatitis B and Hib), polio vaccine (OPV), the pneumococcal vaccine (PCV, against pneumonia) and the rotavirus vaccine (against severe diarrhoea)\n- **6 months:** Vitamin A\n- **9 months:** the measles vaccine (first dose) and the yellow fever vaccine\n- **12\u201315 months:** Vitamin A again and a DPT booster dose\n- **Every 6 months until age 5:** repeat Vitamin A doses\n\n## Why each one matters\n\n- **BCG** guards against the most dangerous forms of childhood tuberculosis\n- **Pentavalent** covers five infections at once \u2014 including whooping cough, which can be life-threatening in young babies\n- **PCV** protects against pneumococcal pneumonia, one of the leading causes of childhood hospitalization\n- **Rotavirus** protects against the severe diarrhoea that dehydrates babies quickly\n- **Measles** prevents a virus whose complications \u2014 ear infection, pneumonia, brain damage \u2014 can be devastating\n- **Yellow fever** protects against a serious viral illness common in parts of Nigeria\n\n## How to keep your child on track\n\n- Book early: your child''s first set of vaccines comes at 6 weeks \u2014 make that visit before the month is out\n- Keep the immunization card safe and bring it to every visit\n- A little fever or soreness at the injection site is a normal response \u2014 not a reason to stop\n- If a dose was missed, do not start over: ask about catch-up. Series can usually be completed safely later\n- Schedule all of your child''s doses together so you never have to remember a single one\n\n> Immunization works best alongside the basics: good nutrition, clean water, and regular check-ups. A fully immunized child who is well fed is a child with every advantage.\n\nChi-Tom Rapha Hospital & Maternity offers immunization services for eligible patients, children and families. Call +234 706 958 8315 \u2014 we are open 24/7 \u2014 and we will map out your child''s schedule with you."},{"id":"p4","slug":"ultrasound-in-pregnancy","title":"Ultrasound in Pregnancy: Why It Matters and What to Expect","category":"Diagnostics","icon":"wave","image":"","date":"2026-09-10","status":"publish","excerpt":"The screen that shows you a heartbeat, a profile, a tiny hand \u2014 but ultrasound does far more than create memories. Here is what each scan actually checks, and why it is safe.","body":"For many parents, the ultrasound is the moment pregnancy stops being a test result and becomes a person on a screen. But beyond the memory, ultrasound is one of the most important tools in monitoring a pregnancy \u2014 and understanding what it does can ease a lot of worry.\n\n## What ultrasound actually is\n\nAn ultrasound uses high-frequency sound waves \u2014 the same principle as a bat''s echo \u2014 to create live pictures of the inside of the body. It involves no radiation, no X-rays and no known harm to you or your baby. It is painless, and the cool gel on your abdomen is the only part most people remember.\n\n## The scans, and what each one checks\n\n- **The dating scan (first trimester):** confirms how far along the pregnancy is, checks for more than one baby, and establishes a reliable due date\n- **The anatomy scan (around 18\u201320 weeks):** the detailed look \u2014 the baby''s organs, the position of the placenta, the amount of amniotic fluid, and overall growth\n- **Growth scans (later in pregnancy):** track that your baby is growing at the expected rate, especially when other factors like blood pressure need watching\n- **Positional checks (near term):** finding out whether baby is head-down, and helping plan the safest route of delivery\n\n## What to expect at your appointment\n\n- For early scans, you may be asked to arrive with a full bladder \u2014 it gives a clearer view\n- You will lie while a small transducer is moved over your abdomen with gel\n- Most appointments take 20 to 40 minutes; if the baby is in an awkward position, you may be asked to return rather than repeating a long session\n- Your clinician will explain what the images mean for your specific care \u2014 ask anything you like\n\n> An ultrasound supports clinical assessment. The pictures matter, but your clinician''s interpretation \u2014 and the plan that follows \u2014 is what guides your care.\n\nWe provide ultrasound imaging at Chi-Tom Rapha Hospital & Maternity to support clinical assessment and pregnancy-related monitoring where appropriate. Book through our contact page, or call +234 706 958 8315 any time \u2014 we are open 24 hours a day."},{"id":"p5","slug":"preparing-for-surgery","title":"Preparing for Surgery: Simple Steps for a Safer, Faster Recovery","category":"Surgery","icon":"cross","image":"assets/doctor-2.jpg","date":"2026-09-05","status":"publish","excerpt":"Surgery feels bigger than it needs to be. The truth is that most of a smooth recovery happens before the operation \u2014 and almost all of it is in your control. Here is a practical checklist.","body":"Ask most people what scares them about surgery and the answer is the unknown. So let''s remove as much of it as we can: most of a good surgical outcome is built in the days before the operation, and most of it is within your control.\n\n## In the days before\n\n- Follow the fasting instructions you are given \u2014 usually no food or drink after midnight \u2014 exactly as stated\n- Tell your team about **every** medicine you take: tablets, injections, herbs, and especially blood thinners, which are often paused or adjusted beforehand\n- Arrange someone to take you home after discharge \u2014 you should not drive after anaesthesia\n- Set up a restful space at home: a clear path from the door, a comfortable seat or bed, water and snacks within reach\n- Pack a bag with your identification, all test results and records you have received, and the clothes you will be most comfortable coming home in\n\n## On the day\n\n- Arrive at the time given \u2014 not the earliest possible minute, not the last\n- Bring your identification and any consent paperwork you completed\n- Wear loose clothing; leave valuables and jewellery at home\n- Write down anything you still want to ask \u2014 nerves make memory unreliable, and your team would rather answer a ''simple'' question than find out later you were worried\n\n## In the days after\n\n- Rest more than you think you need \u2014 healing uses energy you will not feel like you have\n- Take pain relief exactly as prescribed; well-controlled pain lets you breathe, move and sleep better\n- Keep the wound clean and dry, and change dressings as instructed\n- Start with light, easy food and plenty of fluids, then return to a normal, balanced diet\n- Move gently and steadily as advised \u2014 short, frequent walks are one of the best things you can do for circulation\n- Keep your follow-up appointment even if you feel completely fine\n\n## Seek care promptly if you notice\n\n> A fever, a wound that becomes increasingly red, warm or painful, pus or foul smell, bleeding that soaks a dressing, chest pain, or difficulty breathing after going home \u2014 any of these should be reported immediately. Do not wait for the follow-up visit.\n\nSurgical care at Chi-Tom Rapha Hospital & Maternity is supported by appropriate clinical assessment, professional preparation and post-operative care. If you have questions before your procedure, call +234 706 958 8315 \u2014 our line is open 24 hours a day."},{"id":"p6","slug":"malaria-in-pregnancy","title":"Malaria in Pregnancy: Why It Is a Risk \u2014 and How to Stay Protected","category":"Prevention","icon":"heart","image":"","date":"2026-08-28","status":"publish","excerpt":"Malaria affects millions of people across Nigeria every year \u2014 but in pregnancy the stakes are higher for two people at once. Here is what every expectant mother should know, and the protection that is available at every antenatal visit.","body":"Malaria is one of the most common illnesses across Nigeria, and most people treat it like a routine fever. During pregnancy, that routine attitude is exactly what needs to change \u2014 because malaria in pregnancy puts two people at risk at once: the mother and the baby she is carrying.\n\n## Why malaria in pregnancy is dangerous\n\nPregnancy changes the body in ways that make malaria more likely to strike and more likely to cause harm. The complications include:\n\n- **Anaemia in the mother** \u2014 as the parasite destroys red blood cells on top of the extra demands of pregnancy\n- **Low birth weight** \u2014 the baby not gaining as much as it should before birth\n- **Preterm delivery** \u2014 birth earlier than 37 weeks, with the risks that brings for a newborn\n- **Risk to the unborn child** \u2014 in severe cases, malaria can cross the placenta\n\nNone of this is inevitable. The difference between a mother who suffers these complications and one who does not is usually prevention.\n\n## The protection that is available\n\n- **Sleep under an insecticide-treated net (ITN)** \u2014 every night, and especially during pregnancy. This single habit blocks the majority of mosquito bites that occur at night, when the mosquitoes that carry malaria are most active\n- **Reduce mosquitoes around the home:** keep screens on windows, avoid standing water where mosquitoes breed, and use repellents as advised\n- **Attend every antenatal visit** \u2014 this is where **IPTp** happens: the recommended doses of sulfadoxine-pyrimethamine given under direct observation during your visits, which protect you against malaria infection in pregnancy as recommended by Nigeria''s national guidelines\n- **Treat fever the same day** \u2014 if you develop a fever while pregnant, do not treat it at home and hope. See a clinician immediately; the treatments recommended under national guidelines are available, and early treatment protects both you and the baby\n\n## What to watch for\n\n> A fever \u2014 even a mild one \u2014 during pregnancy should be tested for malaria the same day it starts. If you have chills, sweats, body aches and fever while pregnant, seek care promptly rather than waiting to see if it passes.\n\nMalaria is preventable, and in pregnancy it is worth every step of the prevention. At Chi-Tom Rapha Hospital & Maternity, malaria screening and IPTp are part of the antenatal care we provide \u2014 and our emergency line, +234 706 958 8315, is open 24 hours a day if you ever need us urgently."}], [{"id":"a1","pinned":true,"tag":"Ongoing","date":"Always","title":"We are open 24 hours a day, 7 days a week","body":"Medical services are available around the clock at Chi-Tom Rapha Hospital & Maternity \u2014 consultations, antenatal care, diagnostics and emergency care, any hour of the day. In an emergency, call +234 706 958 8315 immediately."},{"id":"a2","pinned":false,"tag":"New","date":"September 2026","title":"Request a consultation online \u2014 we call you back","body":"Our booking form is now on this website. Tell us who you are and why you''d like to see the doctor, and our care team will call you back to confirm your appointment. No waiting on the line to leave a message."},{"id":"a3","pinned":false,"tag":"Health","date":"Ongoing","title":"Antenatal care: your journey to a safe delivery starts with one visit","body":"Professional antenatal care and monitoring to support mothers throughout pregnancy and prepare them for a safe, informed delivery. If you are expecting, book your first visit today \u2014 the earlier you book, the more we can do for you."},{"id":"a4","pinned":false,"tag":"Health","date":"Ongoing","title":"Routine immunization for children and families","body":"Protect the people you love from preventable diseases. We offer immunization services for eligible patients, children and families. Call us to find out which vaccines apply to your family and schedule a convenient time."}], '[]'::jsonb)
on conflict (id) do nothing;

-- ============================================================================
-- v2 — Google reviews cache (added 2026-10-11; safe to re-run this section:
-- every object uses IF NOT EXISTS / CREATE OR REPLACE)
-- Stores the last synced Google reviews payload for the /api/reviews endpoint.
-- ============================================================================

create table if not exists public.google_reviews_cache (
  id integer primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz
);

alter table public.google_reviews_cache force row level security;

drop policy if exists "definer_only_grev" on public.google_reviews_cache;
create policy "definer_only_grev" on public.google_reviews_cache
  for all
  using (coalesce(current_setting('app.rapha.authorized', true), '') = 'true')
  with check (coalesce(current_setting('app.rapha.authorized', true), '') = 'true');

create or replace function public.rapha_reviews_get(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r public.google_reviews_cache%rowtype;
begin
  perform public.rapha_check_secret(p_secret);
  select * into r from public.google_reviews_cache where id = 1;
  if not found then
    return jsonb_build_object('payload', '{}'::jsonb, 'synced_at', null);
  end if;
  return jsonb_build_object('payload', r.payload, 'synced_at', r.synced_at);
end;
$$;

create or replace function public.rapha_reviews_set(p_secret text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rapha_check_secret(p_secret);
  insert into public.google_reviews_cache (id, payload, synced_at)
  values (1, coalesce(p_payload, '{}'::jsonb), now())
  on conflict (id) do update set payload = excluded.payload, synced_at = now();
end;
$$;

grant execute on function
  public.rapha_reviews_get(text),
  public.rapha_reviews_set(text, jsonb)
to anon, authenticated, service_role;

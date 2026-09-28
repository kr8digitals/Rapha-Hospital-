<?php
/**
 * Chi-Tom Rapha Hospital & Maternity — Content API
 * ------------------------------------------------------------------
 * Dependency-free JSON API (PHP 7.4+, works on any cPanel/Hostinger host).
 *
 *   GET  api/index.php?action=public          public content
 *   POST api/index.php?action=testimonial     visitor submits a story
 *   POST api/index.php?action=login           {password} -> {token}
 *   GET  api/index.php?action=admin_content   full content (Bearer token)
 *   POST api/index.php?action=save            {settings?,posts?,announcements?,testimonials?}
 *   GET  api/index.php?action=backup          downloads full content JSON
 *   POST api/index.php?action=import          replaces content from JSON
 *   POST api/index.php?action=reset           restores the original seed
 *
 * Storage:  data/content.json (live) + data/seed.json (pristine copy).
 * data/ is blocked from direct web access by data/.htaccess.
 */

error_reporting(0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-max-age');

$root = dirname(__DIR__);
$dataDir = $root . '/data';
$file = $dataDir . '/content.json';
$seedFile = $dataDir . '/seed.json';

/* ---------------- configuration (edit here) ---------------- */
define('ADMIN_PASS', 'Rapha@Adm!no/*');
define('API_TOKEN', 'ctrh-r7d41b8e63a55011c9d72e4ab6f30-9f2c');
/* ----------------------------------------------------------- */

function out($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function body_json() {
    $raw = file_get_contents('php://input');
    $d = json_decode((string)$raw, true);
    return is_array($d) ? $d : array();
}

function save_store($store) {
    global $file, $dataDir;
    if (!is_dir($dataDir)) { @mkdir($dataDir, 0775, true); }
    $tmp = $file . '.tmp';
    $json = json_encode($store, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) return false;
    if (@file_put_contents($tmp, $json) !== false && @rename($tmp, $file)) return true;
    @unlink($tmp);
    return false;
}

function load_store() {
    global $file, $seedFile, $dataDir;
    if (is_file($file) && filesize($file) > 0) {
        $raw = @file_get_contents($file);
        $d = json_decode((string)$raw, true);
        if (is_array($d) && isset($d['settings'], $d['posts'], $d['announcements'], $d['testimonials'])) {
            return $d;
        }
    }
    // first run: initialise from the pristine seed
    $seed = null;
    if (is_file($seedFile)) {
        $seed = json_decode((string)@file_get_contents($seedFile), true);
    }
    if (!is_array($seed)) {
        $seed = array('settings' => array(), 'posts' => array(), 'announcements' => array(), 'testimonials' => array());
    }
    if (!isset($seed['testimonials'])) $seed['testimonials'] = array();
    save_store($seed);
    return $seed;
}

function is_authed() {
    $h = isset($_SERVER['HTTP_AUTHORIZATION']) ? (string)$_SERVER['HTTP_AUTHORIZATION'] : '';
    if (strpos($h, 'Bearer ') === 0) $h = substr($h, 7);
    if ($h === '' && isset($_SERVER['PHP_AUTH_PW'])) $h = (string)$_SERVER['PHP_AUTH_PW'];
    return $h !== '' && hash_equals(API_TOKEN, trim($h));
}

function public_view($s) {
    $posts = array();
    foreach ((array)$s['posts'] as $p) {
        if (isset($p['status']) && $p['status'] !== 'draft') $posts[] = $p;
    }
    $tst = array();
    foreach ((array)$s['testimonials'] as $t) {
        if (isset($t['status']) && $t['status'] === 'publish') $tst[] = $t;
    }
    return array(
        'settings' => (array)$s['settings'],
        'posts' => $posts,
        'announcements' => (array)$s['announcements'],
        'testimonials' => $tst
    );
}

/* criticism screen — mirrors the front-end filter */
function is_criticism($msg, $rating) {
    $re = '/angry|anger|bad(ly)?|awful|horrible|terrible|atrocious|worst|disappoint|unhappy|unsatisfied|unprofessional|rud(e|ely|eness)|negligen|neglect|ignor(e|ed|ance)|abandon|dismiss|refus|waste of (time|money|resources)|scam|fraud|rip ?off|overcharg|filth|unhygienic|complain|abuse|poor (service|care|treatment|attitude)|never (again|come back|return)|avoid (this|them|it)|regret|useless|incompet|kept (me |us )?wait|waited (forever|hours|a long time|too long)|no (one|anyone|proper) (help|care|attention|respect)|indifferent|delay(ed)? (my |our )?(treatment|diagnosis|response)|missed (diagnosis|appointment)|died|killed|sue(d)?|court|legal action|threat|swindl|cheat(ed|ing)?|stole|robbed|dirty/i';
    if (@preg_match($re, (string)$msg)) return true;
    if ($rating && $rating <= 2) return true;
    return false;
}

function clip($s, $max) {
    $s = trim((string)$s);
    if (function_exists('mb_substr')) return mb_substr($s, 0, $max);
    return substr($s, 0, $max);
}

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? (string)$_GET['action'] : '';

if ($action === 'public') {
    if ($method !== 'GET') out(array('ok' => false, 'error' => 'GET only'), 405);
    out(array('ok' => true, 'content' => public_view(load_store())));
}

if ($action === 'testimonial') {
    if ($method !== 'POST') out(array('ok' => false, 'error' => 'POST only'), 405);
    $b = body_json();
    $msg = trim(isset($b['message']) ? (string)$b['message'] : '');
    if (strlen($msg) < 12) out(array('ok' => false, 'error' => 'Please write a little more — at least a couple of sentences.'), 422);
    $kind = (isset($b['kind']) && $b['kind'] === 'heard') ? 'heard' : 'experience';
    $rating = null;
    if ($kind === 'experience' && isset($b['rating'])) {
        $r = (int)$b['rating'];
        if ($r >= 1 && $r <= 5) $rating = $r;
    }
    $s = load_store();
    $flagged = is_criticism($msg, $rating);
    $s['testimonials'][] = array(
        'id' => 't' . date('YmdHis') . substr(md5(uniqid('', true)), 0, 4),
        'name' => isset($b['name']) ? clip($b['name'], 60) : '',
        'relation' => isset($b['relation']) ? clip($b['relation'], 40) : 'Community member',
        'kind' => $kind,
        'rating' => $rating,
        'message' => clip($msg, 5000),
        'date' => date('Y-m-d'),
        'pinned' => false,
        'status' => $flagged ? 'hidden' : 'publish',
        'flagged' => $flagged
    );
    if (save_store($s)) out(array('ok' => true, 'status' => $flagged ? 'hidden' : 'publish'));
    out(array('ok' => false, 'error' => 'Could not save your story. Please try again.'), 500);
}

if ($action === 'login') {
    if ($method !== 'POST') out(array('ok' => false, 'error' => 'POST only'), 405);
    $b = body_json();
    $pass = isset($b['password']) ? (string)$b['password'] : '';
    if ($pass !== '' && hash_equals(ADMIN_PASS, $pass)) {
        out(array('ok' => true, 'token' => API_TOKEN));
    }
    out(array('ok' => false, 'error' => 'Incorrect password.'), 401);
}

if ($action === 'admin_content') {
    if (!is_authed()) out(array('ok' => false, 'error' => 'Unauthorized'), 401);
    if ($method !== 'GET') out(array('ok' => false, 'error' => 'GET only'), 405);
    out(array('ok' => true, 'content' => load_store()));
}

if ($action === 'save') {
    if (!is_authed()) out(array('ok' => false, 'error' => 'Unauthorized'), 401);
    if ($method !== 'POST') out(array('ok' => false, 'error' => 'POST only'), 405);
    $b = body_json();
    $s = load_store();
    foreach (array('settings', 'posts', 'announcements', 'testimonials') as $k) {
        if (array_key_exists($k, $b) && is_array($b[$k])) $s[$k] = $b[$k];
    }
    if (save_store($s)) out(array('ok' => true));
    out(array('ok' => false, 'error' => 'Save failed — please try again.'), 500);
}

if ($action === 'backup') {
    if (!is_authed()) out(array('ok' => false, 'error' => 'Unauthorized'), 401);
    header('Content-Disposition: attachment; filename="chitom-rapha-content-' . date('Ymd') . '.json"');
    echo json_encode(load_store(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($action === 'import') {
    if (!is_authed()) out(array('ok' => false, 'error' => 'Unauthorized'), 401);
    if ($method !== 'POST') out(array('ok' => false, 'error' => 'POST only'), 405);
    $b = body_json();
    if (!isset($b['settings']) || !isset($b['posts']) || !isset($b['announcements']) || !isset($b['testimonials'])) {
        out(array('ok' => false, 'error' => 'That file is not a valid site backup.'), 422);
    }
    if (save_store($b)) out(array('ok' => true));
    out(array('ok' => false, 'error' => 'Import failed.'), 500);
}

if ($action === 'reset') {
    if (!is_authed()) out(array('ok' => false, 'error' => 'Unauthorized'), 401);
    if (is_file($seedFile)) {
        $seed = json_decode((string)@file_get_contents($seedFile), true);
        if (is_array($seed)) {
            if (!isset($seed['testimonials'])) $seed['testimonials'] = array();
            if (save_store($seed)) out(array('ok' => true));
        }
    }
    out(array('ok' => false, 'error' => 'No seed found on this server.'), 500);
}

out(array('ok' => false, 'error' => 'Unknown action'), 404);

/**
 * Skip to 7 Figures — Admin API + Dashboard
 * Cloudflare Worker (free tier) + D1.
 *
 * Routes
 *   GET  /                      -> redirect to /admin
 *   GET  /admin                 -> login page (redirects to dashboard when already signed in)
 *   POST /admin/login           -> authenticate, set session cookie
 *   POST /admin/logout          -> clear session
 *   GET  /admin/dashboard        -> dashboard (auth required)
 *   POST /admin/application/:id -> update status / notes (auth + CSRF)
 *   POST /admin/content         -> update editable site copy (auth + CSRF)
 *   GET  /admin/export.csv      -> download all applications (auth)
 *   POST /api/apply             -> PUBLIC: capture a funnel application
 *   GET  /api/content           -> PUBLIC: editable site copy
 *   POST /api/track             -> PUBLIC: page-view beacon
 *   GET  /api/health            -> PUBLIC: status
 */

const ORIGINS = new Set([
  'https://skip-to-7-figures.onrender.com',
  'https://skipto7figures.com',
  'https://www.skipto7figures.com',
]);
const SESSION_COOKIE = 'sf7_session';
const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const QUESTIONS = ['capital', 'timeline', 'experience', 'interest', 'decision'];
const STATUSES = ['new', 'contacted', 'closed'];

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------------- primitives ---------------- */

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64urlDecode(salt), iterations, hash: 'SHA-256' }, key, 256);
  return b64url(new Uint8Array(bits));
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hashIp(ip, secret) {
  const h = await hmac(secret, ip || 'unknown');
  return b64url(h).slice(0, 16);
}

/* ---------------- session ---------------- */

async function createSession(secret, admin) {
  const csrf = b64url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = { sub: admin.email, iat: Date.now(), exp: Date.now() + SESSION_DAYS * 864e5, csrf };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return { cookie: `${body}.${sig}`, csrf };
}
async function readSession(secret, request) {
  const raw = parseCookie(request.headers.get('cookie') || '')[SESSION_COOKIE];
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx < 1) return null;
  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = b64url(await hmac(secret, body));
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
function parseCookie(str) {
  const out = {};
  for (const part of str.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/* ---------------- helpers ---------------- */

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  const allow = origin && ORIGINS.has(origin) ? origin : null;
  const h = {};
  if (allow) h['Access-Control-Allow-Origin'] = allow;
  h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  h['Access-Control-Allow-Headers'] = 'Content-Type';
  h['Access-Control-Max-Age'] = '86400';
  h['Vary'] = 'Origin';
  return h;
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
function html(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '0.0.0.0';
}
function clean(str, max) {
  return String(str == null ? '' : str).replace(/\s+/g, ' ').trim().slice(0, max);
}
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/* ---------------- public API ---------------- */

async function handleApply(request, env, ctx) {
  const ip = clientIp(request);
  // lightweight per-IP throttle (10 submissions / 10 minutes)
  const key = await hashIp(ip, env.SESSION_SECRET);
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM applications WHERE ip_hash = ? AND created_at > datetime('now','-10 minutes')`
  ).bind(key).first();
  if (recent && recent.c >= 10) return json({ ok: false, error: 'Too many submissions. Please try again later.' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'Invalid request.' }, 400);

  // honeypot — real users never fill this
  if (clean(body.company, 100)) return json({ ok: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 40);
  if (!isEmail(email)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400);
  if (!phone || phone.replace(/\D/g, '').length < 7) return json({ ok: false, error: 'Please enter a valid phone number.' }, 400);

  const answers = {};
  for (const q of QUESTIONS) answers[q] = clean(body[q], 160);

  await env.DB.prepare(
    `INSERT INTO applications
      (name,email,phone,capital,timeline,experience,interest,decision,source,page_url,referrer,user_agent,ip_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      name, email, phone, answers.capital, answers.timeline, answers.experience, answers.interest, answers.decision,
      clean(body.source, 60) || 'funnel',
      clean(body.page_url, 300),
      clean(request.headers.get('referer') || '', 300),
      clean(request.headers.get('user-agent') || '', 300),
      key
    )
    .run();

  return json({ ok: true });
}

async function handleContent(request, env) {
  const rows = await env.DB.prepare('SELECT key, value FROM content').all();
  const out = {};
  for (const r of rows.rows || []) if (r.value) out[r.key] = r.value;
  return json(out);
}

async function handleTrack(request, env) {
  let path = '';
  try { path = clean(new URL(request.url).searchParams.get('path'), 120); } catch { /* ignore */ }
  if (!path) {
    let body = {};
    try { body = await request.json(); } catch { /* ignore */ }
    path = clean(body.path, 120);
  }
  if (!path) path = '/';
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO visits(day,path,count) VALUES (?,?,1)
     ON CONFLICT(day,path) DO UPDATE SET count = count + 1`
  ).bind(day, path).run();
  return json({ ok: true });
}

/* ---------------- auth ---------------- */

async function handleLogin(request, env) {
  const ip = clientIp(request);
  const ipKey = await hashIp(ip, env.SESSION_SECRET);
  const now = Date.now();
  const attempt = await env.DB.prepare('SELECT count, last_at FROM login_attempts WHERE ip = ?').bind(ipKey).first();
  if (attempt && attempt.count >= MAX_ATTEMPTS && now - attempt.last_at < ATTEMPT_WINDOW) {
    return html(loginPage({ error: 'Too many attempts. Wait 15 minutes and try again.' }), 429);
  }
  const form = await request.formData().catch(() => null);
  const email = clean(form?.get('email'), 160).toLowerCase();
  const password = String(form?.get('password') || '');
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();

  let ok = false;
  if (admin && password) {
    const hash = await pbkdf2(password, admin.salt, admin.iterations || 100000);
    ok = constantTimeEqual(hash, admin.password_hash);
  }
  if (!ok) {
    if (attempt && now - attempt.last_at < ATTEMPT_WINDOW) {
      await env.DB.prepare('UPDATE login_attempts SET count = count + 1, last_at = ? WHERE ip = ?').bind(now, ipKey).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO login_attempts(ip,count,last_at) VALUES (?,1,?)
         ON CONFLICT(ip) DO UPDATE SET count = 1, last_at = excluded.last_at`
      ).bind(ipKey, now).run();
    }
    return html(loginPage({ error: 'Incorrect email or password.' }), 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ipKey).run();
  await env.DB.prepare('UPDATE admins SET last_login_at = datetime(\'now\') WHERE id = ?').bind(admin.id).run();

  const { cookie } = await createSession(env.SESSION_SECRET, admin);
  return html('<meta http-equiv="refresh" content="0;url=/admin/dashboard">', 302, {
    'Set-Cookie': sessionCookie(cookie),
    'Cache-Control': 'no-store',
  });
}

async function handleLogout(request, env) {
  return html('<meta http-equiv="refresh" content="0;url=/admin">', 302, {
    'Set-Cookie': clearCookie(),
    'Cache-Control': 'no-store',
  });
}

/* ---------------- dashboard ---------------- */

async function dashboardData(env) {
  const stats = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) AS fresh,
       SUM(CASE WHEN status='contacted' THEN 1 ELSE 0 END) AS contacted,
       SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed,
       SUM(CASE WHEN created_at > datetime('now','-7 days') THEN 1 ELSE 0 END) AS week
     FROM applications`
  ).first();
  const views = await env.DB.prepare(
    `SELECT COALESCE(SUM(count),0) AS total, COALESCE(SUM(CASE WHEN day >= date('now','-6 days') THEN count ELSE 0 END),0) AS week FROM visits`
  ).first();
  const list = await env.DB.prepare('SELECT * FROM applications ORDER BY id DESC LIMIT 500').all();
  const content = await env.DB.prepare('SELECT key, value FROM content').all();
  return {
    stats: stats || {},
    views: views || {},
    rows: (list.results || []),
    content: Object.fromEntries((content.results || []).map((r) => [r.key, r.value || ''])),
  };
}

async function handleDashboard(request, env, session) {
  const data = await dashboardData(env);
  return html(dashboardPage(data, session.csrf));
}

async function handleUpdateApplication(request, env, session, id) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false }, 400);
  const status = STATUSES.includes(body.status) ? body.status : null;
  const notes = body.notes == null ? null : clean(body.notes, 2000);
  if (!status && notes == null) return json({ ok: false, error: 'Nothing to update.' }, 400);
  const sets = [];
  const binds = [];
  if (status) { sets.push('status = ?'); binds.push(status); }
  if (notes != null) { sets.push('notes = ?'); binds.push(notes); }
  binds.push(id);
  await env.DB.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return json({ ok: true });
}

async function handleSaveContent(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false }, 400);
  const allowed = ['headline', 'subheadline', 'cta_label', 'specialties'];
  for (const key of allowed) {
    if (typeof body[key] === 'string') {
      await env.DB.prepare(
        `INSERT INTO content(key,value) VALUES (?,?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(key, clean(body[key], 400)).run();
    }
  }
  return json({ ok: true });
}

async function handleExport(request, env) {
  const rows = await env.DB.prepare('SELECT * FROM applications ORDER BY id DESC').all();
  const header = ['id', 'created_at', 'name', 'email', 'phone', 'capital', 'timeline', 'experience', 'interest', 'decision', 'status', 'notes'];
  const lines = [header.join(',')];
  for (const r of rows.results || []) {
    lines.push(header.map((h) => csvCell(r[h])).join(','));
  }
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="skip-to-7-figures-applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ---------------- HTML ---------------- */

function shell(title, body, extraHead = '') {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<link rel="icon" type="image/png" href="https://skip-to-7-figures.onrender.com/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${extraHead}
<style>
:root{--ink:#1B1611;--ink2:#241C15;--cream:#F8F5EF;--cream2:#EFE8DB;--paper:#fff;--gold:#C99B54;--goldlt:#F1CB88;--muted:#6B6459;--line:rgba(27,22,17,.13);--lineg:rgba(201,155,84,.34);--serif:'Fraunces',ui-serif,Georgia,serif;--sans:'Inter',system-ui,-apple-system,sans-serif;--ease:cubic-bezier(.22,.61,.36,1)}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font:400 15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
h1,h2,h3{font-family:var(--serif);font-weight:600;letter-spacing:-.025em;margin:0}
.card{background:var(--paper);border:1px solid var(--line);border-radius:16px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--ink);color:#fff;border:0;border-radius:100px;padding:11px 20px;font:600 .88rem/1 var(--sans);cursor:pointer;text-decoration:none;transition:transform .2s var(--ease),opacity .2s}
.btn:hover{transform:translateY(-1px);opacity:.92}
.btn.gold{background:var(--gold);color:var(--ink)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--lineg)}
.btn.sm{padding:8px 14px;font-size:.8rem}
input,select,textarea{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--cream);font:400 .95rem/1.4 var(--sans);color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,155,84,.16)}
label{display:block;font:600 .74rem/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.muted{color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}

/* login */
.login{min-height:100vh;display:grid;place-items:center;padding:24px;
  background:radial-gradient(ellipse 60% 70% at 80% 10%,rgba(201,155,84,.16),transparent 60%),linear-gradient(165deg,#1B1611,#241C15);color:#FBF6EC}
.login__box{width:100%;max-width:420px;background:var(--cream);color:var(--ink);border-radius:20px;padding:38px 34px 32px;border:1px solid var(--lineg);box-shadow:0 40px 90px -40px rgba(0,0,0,.8)}
.login__box h1{font-size:1.9rem;margin-bottom:8px}
.login__box .sub{color:var(--muted);margin:0 0 26px}
.login__box form{display:grid;gap:16px}
.login__box input{background:var(--paper)}
.err{background:#FCEBE7;border:1px solid #E6B7AC;color:#8A2E22;border-radius:10px;padding:11px 13px;font-size:.87rem}
.ok{background:#E9F3EC;border:1px solid #A9CFB7;color:#1F5C3A;border-radius:10px;padding:11px 13px;font-size:.87rem}
.login__foot{margin-top:22px;font-size:.8rem;color:var(--muted);text-align:center}
.login__foot a{color:var(--gold-dp, #9A7038)}

/* dashboard */
.top{position:sticky;top:0;z-index:20;background:rgba(20,16,12,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--lineg);color:#FBF6EC}
.top__in{max-width:1180px;margin-inline:auto;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.top__brand{display:flex;align-items:center;gap:12px;font:600 1rem/1 var(--serif);letter-spacing:-.01em}
.top__brand img{width:34px;height:auto;border-radius:6px}
.top nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.top nav a,.top nav button{color:#E8DCC9;text-decoration:none;font:600 .82rem/1 var(--sans);background:transparent;border:1px solid var(--lineg);border-radius:100px;padding:9px 16px;cursor:pointer}
.wrap{max-width:1180px;margin-inline:auto;padding:30px 22px 70px}
h1.page{font-size:clamp(1.9rem,3.4vw,2.7rem);margin-bottom:6px}
.page__sub{color:var(--muted);margin:0 0 28px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:26px}
.stat{padding:20px 22px}
.stat b{display:block;font:600 2.1rem/1 var(--serif);letter-spacing:-.03em;margin-bottom:6px}
.stat span{font:600 .7rem/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.panel{padding:22px;margin-bottom:22px}
.panel h2{font-size:1.25rem;margin-bottom:4px}
.panel .hint{color:var(--muted);font-size:.85rem;margin:0 0 18px}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:18px}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--cream);border-radius:100px;padding:8px 15px;font:600 .82rem/1 var(--sans);cursor:pointer;color:var(--muted)}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.search{flex:1;min-width:190px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font:600 .7rem/1 var(--sans);letter-spacing:.11em;text-transform:uppercase;color:var(--muted);padding:0 12px 12px;border-bottom:1px solid var(--line)}
td{padding:14px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr.row{cursor:pointer;transition:background-color .15s}
tr.row:hover{background:#FBF8F2}
.pill{display:inline-block;border-radius:100px;padding:5px 12px;font:600 .74rem/1 var(--sans);letter-spacing:.03em}
.pill.new{background:#F6EDDF;color:#8A6420;border:1px solid var(--lineg)}
.pill.contacted{background:#E8F0FA;color:#28527F;border:1px solid #BCD2EE}
.pill.closed{background:#E9F3EC;color:#1F5C3A;border:1px solid #A9CFB7}
.who b{display:block;font-weight:600}
.who a{color:var(--muted);font-size:.85rem;text-decoration:none}
.who a:hover{text-decoration:underline}
.empty{text-align:center;padding:56px 20px;color:var(--muted)}
.empty b{display:block;font-family:var(--serif);font-size:1.3rem;color:var(--ink);margin-bottom:6px}
.drawer{display:none;background:#FBF8F2;border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:0 0 14px}
.drawer.open{display:block}
.kv{display:grid;grid-template-columns:130px 1fr;gap:8px 14px;font-size:.92rem;margin-bottom:20px}
.kv dt{color:var(--muted);font-weight:600}
.kv dd{margin:0}
.notes{width:100%;min-height:86px;resize:vertical}
.rowact{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:760px){
  .wrap{padding:22px 16px 60px}
  .top__in{padding:12px 16px}
  .grid2{grid-template-columns:1fr}
  .kv{grid-template-columns:1fr;gap:3px}
  .kv dd{margin-bottom:8px}
  th.hide,td.hide{display:none}
}
</style></head><body>${body}</body></html>`;
}

function loginPage({ error, ok } = {}) {
  return shell(
    'Sign in · Skip to 7 Figures Admin',
    `<div class="login"><div class="login__box">
      <h1>Skip to 7 Figures</h1>
      <p class="sub">Admin sign in</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      ${ok ? `<div class="ok">${esc(ok)}</div>` : ''}
      <form method="post" action="/admin/login">
        <div><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus></div>
        <div><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn gold" type="submit" style="width:100%;margin-top:4px">Sign in</button>
      </form>
      <p class="login__foot"><a href="/">← Back to the site</a></p>
    </div></div>`
  );
}

function dashboardPage(data, csrf) {
  const s = data.stats || {};
  const v = data.views || {};
  const rows = data.rows || [];
  const c = data.content || {};
  const stat = (n, label) => `<div class="card stat"><b>${esc(n ?? 0)}</b><span>${esc(label)}</span></div>`;

  const tableRows = rows
    .map((r) => {
      const initials = (r.name || r.email || '?').trim().charAt(0).toUpperCase();
      return `<tr class="row" data-id="${esc(r.id)}">
        <td class="mono hide" style="white-space:nowrap;color:var(--muted)">${esc((r.created_at || '').replace('T', ' ').slice(0, 16))}</td>
        <td class="who"><b>${esc(initials)} · ${esc(r.name || '—')}</b>
          <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>
          <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></td>
        <td class="hide">${esc(r.capital)}</td>
        <td class="hide">${esc(r.timeline)}</td>
        <td class="hide">${esc(r.interest)}</td>
        <td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td>
        <td><button class="btn sm ghost" data-open="${esc(r.id)}">Open</button></td>
      </tr>`;
    })
    .join('');

  const drawers = rows
    .map(
      (r) => `<div class="drawer" id="d-${esc(r.id)}">
      <div class="drawer__head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><h3 style="font-size:1.3rem">${esc(r.name || 'Applicant')}</h3>
        <p class="muted" style="margin:2px 0 0;font-size:.88rem">${esc((r.created_at || '').replace('T', ' ').slice(0, 16))} · ${esc(r.source || 'funnel')}</p></div>
        <span class="pill ${esc(r.status)}">${esc(r.status)}</span>
      </div>
      <dl class="kv" style="margin-top:16px">
        <dt>Email</dt><dd><a href="mailto:${esc(r.email)}" style="color:#9A7038">${esc(r.email)}</a></dd>
        <dt>Phone</dt><dd><a href="tel:${esc(r.phone)}" style="color:#9A7038">${esc(r.phone)}</a> · <a href="https://wa.me/${esc((r.phone || '').replace(/\D/g, ''))}" target="_blank" rel="noopener" style="color:#9A7038">WhatsApp ↗</a></dd>
        <dt>Capital</dt><dd>${esc(r.capital || '—')}</dd>
        <dt>Timeline</dt><dd>${esc(r.timeline || '—')}</dd>
        <dt>Experience</dt><dd>${esc(r.experience || '—')}</dd>
        <dt>Interest</dt><dd>${esc(r.interest || '—')}</dd>
        <dt>Decision</dt><dd>${esc(r.decision || '—')}</dd>
        <dt>Source</dt><dd>${esc(r.page_url || r.referrer || '—')}</dd>
      </dl>
      <label for="n-${esc(r.id)}">Notes</label>
      <textarea class="notes" id="n-${esc(r.id)}" data-notes="${esc(r.id)}" placeholder="Notes, outcome, next step…">${esc(r.notes || '')}</textarea>
      <div class="rowact">
        <button class="btn sm" data-status="new" data-target="${esc(r.id)}">Mark new</button>
        <button class="btn sm gold" data-status="contacted" data-target="${esc(r.id)}">Mark contacted</button>
        <button class="btn sm ghost" data-status="closed" data-target="${esc(r.id)}">Mark closed</button>
        <button class="btn sm gold" data-save="${esc(r.id)}">Save notes</button>
        <a class="btn sm ghost" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Skip to 7 Figures')}">Email</a>
      </div>
    </div>`
    )
    .join('');

  return shell(
    'Dashboard · Skip to 7 Figures Admin',
    `<div class="top"><div class="top__in">
      <div class="top__brand"><img src="https://skip-to-7-figures.onrender.com/favicon.png" alt=""><span>Skip to 7 Figures</span></div>
      <nav>
        <a href="https://skip-to-7-figures.onrender.com/" target="_blank" rel="noopener">View site ↗</a>
        <a href="/admin/export.csv">Export CSV</a>
        <form method="post" action="/admin/logout" style="display:inline"><button type="submit">Sign out</button></form>
      </nav>
    </div></div>
    <div class="wrap">
      <h1 class="page">Dashboard</h1>
      <p class="page__sub">Applications and traffic for the Skip to 7 Figures funnel.</p>

      <div class="stats">
        ${stat(s.total, 'Applications')}
        ${stat(s.fresh, 'New')}
        ${stat(s.contacted, 'Contacted')}
        ${stat(s.closed, 'Closed')}
        ${stat(s.week, 'Last 7 days')}
        ${stat(v.total, 'Page views')}
      </div>

      <div class="card panel">
        <h2>Applications</h2>
        <p class="hint">Newest first. Click a row for the full answer set, notes and status.</p>
        <div class="toolbar">
          <div class="chips" id="chips">
            <button class="chip on" data-filter="all">All</button>
            <button class="chip" data-filter="new">New</button>
            <button class="chip" data-filter="contacted">Contacted</button>
            <button class="chip" data-filter="closed">Closed</button>
          </div>
          <input class="search" id="q" type="search" placeholder="Search name, email, phone or answers…">
        </div>
        ${rows.length ? `<table><thead><tr>
          <th class="hide">When</th><th>Applicant</th><th class="hide">Capital</th><th class="hide">Timeline</th><th class="hide">Interest</th><th>Status</th><th></th>
        </tr></thead><tbody id="tbody">${tableRows}</tbody></table>` : `<div class="empty"><b>No applications yet</b>When someone completes the form on the funnel it will land here.</div>`}
      </div>

      <div class="card panel">
        <h2>Site copy</h2>
        <p class="hint">Override the funnel headline, sub-headline, CTA label and specialties. Leave blank to use the original wording.</p>
        <div class="grid2">
          <div><label for="c-headline">Headline</label><input id="c-headline" value="${esc(c.headline || '')}" placeholder="Launch your own beauty brand."></div>
          <div><label for="c-subheadline">Sub-headline</label><input id="c-subheadline" value="${esc(c.subheadline || '')}" placeholder="Turn your product idea into a brand you can sell online…"></div>
          <div><label for="c-cta_label">CTA label</label><input id="c-cta_label" value="${esc(c.cta_label || '')}" placeholder="Start your application ↗"></div>
          <div><label for="c-specialties">Specialties</label><input id="c-specialties" value="${esc(c.specialties || '')}" placeholder="Skincare, Hair growth, Health & wellness, Feminine care"></div>
        </div>
        <div class="rowact"><button class="btn gold" id="saveContent">Save copy</button><span id="contentMsg" class="muted" style="font-size:.85rem"></span></div>
      </div>
    </div>
    ${drawers}
    <script>
    const CSRF=${JSON.stringify(csrf)};
    const $=s=>document.querySelector(s);
    const toast=(m,ok)=>{const e=$('#contentMsg');e.textContent=m;e.style.color=ok?'#1F5C3A':'#8A2E22';setTimeout(()=>e.textContent='',2600);};
    async function api(url,body){
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify(body)});
      return r.json();
    }
    document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();document.querySelector('#d-'+b.dataset.open).classList.toggle('open');}));
    document.querySelectorAll('tr.row').forEach(tr=>tr.addEventListener('click',()=>{const d=document.querySelector('#d-'+tr.dataset.id);if(d)d.classList.toggle('open');}));
    document.querySelectorAll('[data-status]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.target, r=await api('/admin/application/'+id,{status:b.dataset.status});
      if(r.ok){const p=document.querySelector('#d-'+id+' .pill');if(p){p.textContent=b.dataset.status;p.className='pill '+b.dataset.status;}toast('Saved',true);}else toast('Could not save',false);
    }));
    document.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.save, notes=document.querySelector('#n-'+id).value, r=await api('/admin/application/'+id,{notes});
      toast(r.ok?'Notes saved':'Could not save notes',!!r.ok);
    }));
    $('#saveContent').addEventListener('click',async()=>{
      const r=await api('/admin/content',{headline:$('#c-headline').value,subheadline:$('#c-subheadline').value,cta_label:$('#c-cta_label').value,specialties:$('#c-specialties').value});
      toast(r.ok?'Copy saved — refresh the funnel to see it':'Could not save copy',!!r.ok);
    });
    document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{
      document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');applyFilter();
    }));
    $('#q').addEventListener('input',applyFilter);
    function applyFilter(){
      const f=document.querySelector('.chip.on').dataset.filter;
      const q=($('#q').value||'').toLowerCase();
      document.querySelectorAll('#tbody tr.row').forEach(tr=>{
        const st=tr.querySelector('.pill').textContent.trim();
        const okStatus=f==='all'||st===f;
        const okText=!q||tr.textContent.toLowerCase().includes(q);
        tr.style.display=okStatus&&okText?'':'none';
      });
    }
    </script>`
  );
}

/* ---------------- router ---------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const isPublicApi = path.startsWith('/api/');
    const cors = isPublicApi ? corsHeaders(request) : {};

    if (request.method === 'OPTIONS' && isPublicApi) return new Response(null, { status: 204, headers: cors });

    try {
      if (path === '/' && request.method === 'GET') {
        return new Response(null, { status: 302, headers: { Location: '/admin', 'Cache-Control': 'no-store' } });
      }
      if (path === '/api/health') return json({ ok: true, service: 'skip7figures-admin' }, 200, cors);
      if (path === '/api/apply' && request.method === 'POST') {
        const res = await handleApply(request, env, ctx);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      }
      if (path === '/api/content' && request.method === 'GET') {
        const res = await handleContent(request, env);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      }
      if (path === '/api/track' && request.method === 'POST') {
        const res = await handleTrack(request, env);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      }

      if (path === '/admin' || path === '/admin/login') {
        if (request.method === 'GET') {
          const session = await readSession(env.SESSION_SECRET, request);
          if (session) return new Response(null, { status: 302, headers: { Location: '/admin/dashboard', 'Cache-Control': 'no-store' } });
          return html(loginPage({}));
        }
        if (request.method === 'POST') return await handleLogin(request, env);
      }
      if (path === '/admin/logout' && request.method === 'POST') return await handleLogout(request, env);

      if (path === '/admin/dashboard' && request.method === 'GET') {
        const session = await readSession(env.SESSION_SECRET, request);
        if (!session) return new Response(null, { status: 302, headers: { Location: '/admin', 'Cache-Control': 'no-store' } });
        return await handleDashboard(request, env, session);
      }
      if (path === '/admin/export.csv' && request.method === 'GET') {
        const session = await readSession(env.SESSION_SECRET, request);
        if (!session) return new Response(null, { status: 302, headers: { Location: '/admin', 'Cache-Control': 'no-store' } });
        return await handleExport(request, env);
      }
      if (path.startsWith('/admin/application/') && request.method === 'POST') {
        const session = await readSession(env.SESSION_SECRET, request);
        if (!session) return json({ ok: false, error: 'Not signed in.' }, 401);
        const token = request.headers.get('x-csrf-token');
        if (!token || !constantTimeEqual(String(token), String(session.csrf))) return json({ ok: false, error: 'Invalid CSRF token.' }, 403);
        const id = parseInt(path.split('/').pop(), 10);
        if (!id) return json({ ok: false, error: 'Bad id.' }, 400);
        return await handleUpdateApplication(request, env, session, id);
      }
      if (path === '/admin/content' && request.method === 'POST') {
        const session = await readSession(env.SESSION_SECRET, request);
        if (!session) return json({ ok: false, error: 'Not signed in.' }, 401);
        const token = request.headers.get('x-csrf-token');
        if (!token || !constantTimeEqual(String(token), String(session.csrf))) return json({ ok: false, error: 'Invalid CSRF token.' }, 403);
        return await handleSaveContent(request, env);
      }

      return html('<h1>Not found</h1><p><a href="/admin">Go to admin</a></p>', 404);
    } catch (err) {
      return new Response(`Error: ${err && err.message ? err.message : 'unknown'}`, { status: 500 });
    }
  },
};

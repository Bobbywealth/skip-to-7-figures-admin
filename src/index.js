import { dashboardPage } from './dashboard.js';

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

async function createSession(secret, admin, userAgent, env) {
  const csrf = b64url(crypto.getRandomValues(new Uint8Array(18)));
  const sid = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = { sub: admin.email, iat: Date.now(), exp: Date.now() + SESSION_DAYS * 864e5, csrf, sid };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  try {
    await env.DB.prepare('INSERT INTO admin_sessions(id,email,user_agent) VALUES (?,?,?)')
      .bind(sid, admin.email, String(userAgent || '').slice(0, 200)).run();
  } catch { /* session tracking is best-effort */ }
  return { cookie: `${body}.${sig}`, csrf, sid };
}
async function readSession(secret, request, env) {
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
    if (env && payload.sid) {
      const row = await env.DB.prepare('SELECT revoked FROM admin_sessions WHERE id = ?').bind(payload.sid).first();
      if (row && row.revoked) return null;
      try { await env.DB.prepare("UPDATE admin_sessions SET last_seen = datetime('now') WHERE id = ?").bind(payload.sid).run(); } catch { /* ignore */ }
    }
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

/* ---------------- scoring, pipeline, audit, settings, keys ---------------- */

const STAGES = ['new', 'contacted', 'qualified', 'closed', 'lost'];

function scoreLead(a) {
  let s = 0;
  const cap = String(a.capital || '');
  if (cap.includes('250,000+')) s += 40;
  else if (cap.includes('100,000')) s += 34;
  else if (cap.includes('50,000')) s += 27;
  else if (cap.includes('25,000')) s += 20;
  else if (cap.includes('10,000')) s += 12;
  else if (cap.includes('5,000')) s += 6;
  const tl = String(a.timeline || '').toLowerCase();
  if (tl.includes('immediately')) s += 25;
  else if (tl.includes('30 days')) s += 20;
  else if (tl.includes('1–3 months') || tl.includes('1-3 months')) s += 12;
  else if (tl.includes('researching')) s += 3;
  const dec = String(a.decision || '').toLowerCase();
  if (dec === 'yes') s += 20;
  else if (dec.includes('partner')) s += 15;
  else if (dec === 'no') s += 2;
  const exp = String(a.experience || '').toLowerCase();
  if (exp.includes('already operating')) s += 12;
  else if (exp.includes('experienced')) s += 10;
  else if (exp.includes('beginner')) s += 5;
  return Math.min(100, s);
}
function scoreBand(score) {
  return score >= 70 ? 'hot' : score >= 45 ? 'warm' : 'cool';
}
function daysSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

async function logActivity(env, actor, action, entityId, detail, entity = 'application') {
  try {
    await env.DB.prepare('INSERT INTO activity(actor,action,entity,entity_id,detail) VALUES (?,?,?,?,?)')
      .bind(String(actor || '').slice(0, 120), String(action || '').slice(0, 60), entity, entityId == null ? null : Number(entityId), String(detail || '').slice(0, 600))
      .run();
  } catch { /* never block the action on the audit write */ }
}

async function getSettings(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows.results || []) out[r.key] = r.value;
  return out;
}
async function setSetting(env, key, value) {
  await env.DB.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(String(key), String(value == null ? '' : value)).run();
}

async function hashApiKey(raw, secret) {
  return b64url(await hmac(secret, 'apikey:' + raw));
}
async function createApiKey(env, name) {
  const raw = 's7_' + b64url(crypto.getRandomValues(new Uint8Array(24)));
  const hash = await hashApiKey(raw, env.SESSION_SECRET);
  const prefix = raw.slice(0, 10);
  await env.DB.prepare('INSERT INTO api_keys(name,prefix,key_hash) VALUES (?,?,?)').bind(String(name || 'integration').slice(0, 60), prefix, hash).run();
  return { raw, prefix, name };
}
async function verifyApiKey(env, request) {
  const raw = (request.headers.get('x-api-key') || '').trim();
  if (!raw) return null;
  const hash = await hashApiKey(raw, env.SESSION_SECRET);
  const row = await env.DB.prepare('SELECT * FROM api_keys WHERE key_hash = ?').bind(hash).first();
  if (!row) return null;
  try { await env.DB.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").bind(row.id).run(); } catch { /* ignore */ }
  return row;
}

async function logError(env, message, path) {
  try {
    await env.DB.prepare('INSERT INTO errors(message,path) VALUES (?,?)').bind(String(message || '').slice(0, 500), String(path || '').slice(0, 200)).run();
  } catch { /* ignore */ }
}

async function recordEvent(env, name, path, visitorId, data) {
  try {
    await env.DB.prepare('INSERT INTO events(name,path,visitor_id,data) VALUES (?,?,?,?)')
      .bind(String(name || '').slice(0, 40), String(path || '/').slice(0, 200), String(visitorId || '').slice(0, 64), JSON.stringify(data || {}).slice(0, 600))
      .run();
  } catch { /* ignore */ }
}

async function deliverWebhooks(env, event, payload) {
  const rows = await env.DB.prepare("SELECT url FROM webhook_out WHERE event = ? OR event = '*'").bind(String(event)).all();
  const urls = (rows.results || []).map((r) => r.url).filter(Boolean);
  for (const url of urls.slice(0, 5)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload }),
      });
      const body = (await res.text()).slice(0, 300);
      await env.DB.prepare('INSERT INTO webhook_out(url,event,status,response) VALUES (?,?,?,?)').bind(url, event, String(res.status), body).run();
    } catch (e) {
      await env.DB.prepare('INSERT INTO webhook_out(url,event,status,response) VALUES (?,?,?,?)').bind(url, event, 'error', String(e && e.message ? e.message : e).slice(0, 300)).run();
    }
  }
}

/* ---------------- lead notifications (Telegram) ---------------- */

async function notifyLead(env, ctx, lead) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    // global rate guard: max 8 alerts per hour so the channel cannot be flooded
    const now = Date.now();
    const row = await env.DB.prepare('SELECT count, window_start FROM notify_guard WHERE key = ?').bind('telegram').first();
    let allowed = true;
    if (row && now - row.window_start < 3600000 && row.count >= 8) allowed = false;
    if (allowed) {
      if (row && now - row.window_start < 3600000) {
        await env.DB.prepare('UPDATE notify_guard SET count = count + 1 WHERE key = ?').bind('telegram').run();
      } else {
        await env.DB.prepare(
          `INSERT INTO notify_guard(key,count,window_start) VALUES (?,1,?)
           ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`
        ).bind('telegram', now).run();
      }
      const lines = [
        'New Skip to 7 Figures application',
        '',
        lead.name ? `Name: ${lead.name}` : null,
        lead.email ? `Email: ${lead.email}` : null,
        lead.phone ? `Phone: ${lead.phone}` : null,
        lead.capital ? `Capital: ${lead.capital}` : null,
        lead.timeline ? `Timeline: ${lead.timeline}` : null,
        lead.experience ? `Experience: ${lead.experience}` : null,
        lead.interest ? `Interest: ${lead.interest}` : null,
        lead.decision ? `Decision: ${lead.decision}` : null,
        '',
        'Dashboard: https://skip-to-7-figures-admin.skip7figures.workers.dev/admin/dashboard',
      ].filter((l) => l !== null);
      const task = fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), disable_notification: false }),
      })
        .then(async (r) => {
          const body = await r.text();
          console.log(`[lead-notify] telegram status=${r.status} ok=${/\"ok\":true/.test(body)} chat=${chatId}`);
          return body;
        })
        .catch((e) => {
          console.log(`[lead-notify] telegram FAILED: ${e && e.message ? e.message : e}`);
          return '';
        });
      if (ctx && ctx.waitUntil) ctx.waitUntil(task);
      else await task;
    }
  } catch {
    /* a notification failure must never lose the lead */
  }
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

  const ua = clean(request.headers.get('user-agent') || '', 300);
  const device = /mobile|iphone|android/i.test(ua) ? 'mobile' : /ipad|tablet/i.test(ua) ? 'tablet' : 'desktop';
  const country = clean(request.headers.get('cf-ipcountry') || '', 8);
  const visitorId = clean(body.visitor_id, 64);
  const score = scoreLead(answers);
  /* per-application secret so the visitor can delete THIS record and nothing else */
  const deleteToken = b64url(crypto.getRandomValues(new Uint8Array(18)));

  // duplicate detection: same email again inside 30 days
  let duplicateOf = null;
  const dupe = await env.DB.prepare(
    `SELECT id FROM applications WHERE email = ? AND id <> coalesce((SELECT id FROM applications WHERE 0), -1)
       AND created_at > datetime('now','-30 days') ORDER BY id DESC LIMIT 1`
  ).bind(email).first();
  if (dupe && dupe.id) duplicateOf = dupe.id;

  const res = await env.DB.prepare(
    `INSERT INTO applications
      (name,email,phone,capital,timeline,experience,interest,decision,source,page_url,referrer,user_agent,ip_hash,
       stage,score,owner,spam,duplicate_of,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid,device,country,visitor_id,delete_token)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'new', ?, '', 0, ?, ?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      name, email, phone, answers.capital, answers.timeline, answers.experience, answers.interest, answers.decision,
      clean(body.source, 60) || 'funnel',
      clean(body.page_url, 300),
      clean(request.headers.get('referer') || '', 300),
      ua,
      key,
      score,
      duplicateOf,
      clean(body.utm_source, 80),
      clean(body.utm_medium, 80),
      clean(body.utm_campaign, 120),
      clean(body.utm_content, 120),
      clean(body.utm_term, 120),
      clean(body.gclid, 80),
      clean(body.fbclid, 80),
      device,
      country,
      visitorId,
      deleteToken
    )
    .run();

  const leadId = res && res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;
  const lead = { id: leadId, name, email, phone, ...answers, score, duplicateOf };

  await logActivity(env, 'visitor', 'applied', leadId, `score ${score} (${scoreBand(score)})`);
  await recordEvent(env, 'apply_complete', '/', visitorId, { score });
  await notifyLead(env, ctx, lead);
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(deliverWebhooks(env, 'lead.created', lead));
  } else {
    await deliverWebhooks(env, 'lead.created', lead);
  }

  return json({ ok: true, id: leadId, delete_token: deleteToken });
}

async function handleContent(request, env) {
  const rows = await env.DB.prepare('SELECT key, value FROM content').all();
  const out = {};
  /* D1 returns rows under .results — NOT .rows (that is the node-postgres shape) */
  for (const r of rows.results || []) if (r.value) out[r.key] = r.value;
  return json(out);
}

async function handleTrack(request, env) {
  let path = '';
  try { path = clean(new URL(request.url).searchParams.get('path'), 120); } catch { /* ignore */ }
  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  if (!path) path = clean(body.path, 120) || '/';
  const name = clean(body.name, 40) || 'view';
  const day = new Date().toISOString().slice(0, 10);
  /* only real page views count as views - counting every event here would
     inflate the denominator and understate the conversion rate */
  if (name === 'view') {
    await env.DB.prepare(
      `INSERT INTO visits(day,path,count) VALUES (?,?,1)
       ON CONFLICT(day,path) DO UPDATE SET count = count + 1`
    ).bind(day, path).run();
  }
  await recordEvent(env, name, path, clean(body.visitor_id, 64), body.data || {});
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

  const { cookie } = await createSession(env.SESSION_SECRET, admin, request.headers.get('user-agent') || '', env);
  await logActivity(env, admin.email, 'login', null, 'signed in');
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

async function buildDigest(env) {
  const s = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN stage='new' THEN 1 ELSE 0 END),0) AS newLeads,
            COALESCE(SUM(CASE WHEN created_at > datetime('now','-1 day') THEN 1 ELSE 0 END),0) AS today
     FROM applications`
  ).first();
  const v = await env.DB.prepare(`SELECT COALESCE(SUM(count),0) AS t FROM visits WHERE day >= date('now','-1 day')`).first();
  const text = [
    'Skip to 7 Figures - daily summary',
    `Applications today: ${(s && s.today) || 0} (total ${(s && s.total) || 0})`,
    `Still to contact: ${(s && s.newLeads) || 0}`,
    `Page views (24h): ${(v && v.t) || 0}`,
  ].join('\n');
  return { text, total: (s && s.total) || 0, newLeads: (s && s.newLeads) || 0, today: (s && s.today) || 0 };
}

async function dashboardData(env) {
  const stats = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN stage='new' THEN 1 ELSE 0 END),0) AS fresh,
       COALESCE(SUM(CASE WHEN stage='contacted' THEN 1 ELSE 0 END),0) AS contacted,
       COALESCE(SUM(CASE WHEN stage='closed' THEN 1 ELSE 0 END),0) AS closed,
       COALESCE(SUM(CASE WHEN stage='qualified' THEN 1 ELSE 0 END),0) AS qualified,
       COALESCE(SUM(CASE WHEN stage='lost' THEN 1 ELSE 0 END),0) AS lost,
       COALESCE(SUM(CASE WHEN spam=1 THEN 1 ELSE 0 END),0) AS spam,
       COALESCE(SUM(CASE WHEN duplicate_of IS NOT NULL THEN 1 ELSE 0 END),0) AS dupes,
       COALESCE(SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END),0) AS hot,
       COALESCE(SUM(CASE WHEN created_at > datetime('now','-7 days') THEN 1 ELSE 0 END),0) AS week
     FROM applications`
  ).first();
  const views = await env.DB.prepare(
    `SELECT COALESCE(SUM(count),0) AS total, COALESCE(SUM(CASE WHEN day >= date('now','-6 days') THEN count ELSE 0 END),0) AS week FROM visits`
  ).first();
  const list = await env.DB.prepare('SELECT * FROM applications ORDER BY id DESC LIMIT 500').all();
  const content = await env.DB.prepare('SELECT key, value FROM content').all();
  const daily = await env.DB.prepare(
    `SELECT d.day,
            (SELECT COALESCE(SUM(count),0) FROM visits v WHERE v.day = d.day) AS views,
            (SELECT COUNT(*) FROM applications a WHERE date(a.created_at) = d.day) AS leads
     FROM (SELECT date('now','-13 days') AS day UNION SELECT DISTINCT date(created_at) FROM applications) d
     WHERE d.day >= date('now','-13 days')
     ORDER BY d.day`
  ).all();
  const sources = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(utm_source,''), CASE WHEN referrer LIKE '%instagram%' THEN 'instagram' WHEN referrer LIKE '%facebook%' THEN 'facebook' WHEN referrer LIKE '%tiktok%' THEN 'tiktok' WHEN referrer LIKE '%google%' THEN 'google' WHEN referrer != '' THEN 'other' ELSE 'direct' END) AS src,
            COUNT(*) AS n
     FROM applications GROUP BY src ORDER BY n DESC LIMIT 12`
  ).all();
  const funnel = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN name='apply_start' THEN 1 ELSE 0 END),0) AS starts,
            COALESCE(SUM(CASE WHEN name='apply_complete' THEN 1 ELSE 0 END),0) AS completes,
            COUNT(*) AS events FROM events`
  ).first();
  const activity = await env.DB.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 40').all();
  const errors = await env.DB.prepare('SELECT * FROM errors ORDER BY id DESC LIMIT 10').all();
  const admins = await env.DB.prepare('SELECT id,email,created_at,last_login_at FROM admins ORDER BY id').all();
  const settings = await getSettings(env);
  const reminders = await env.DB.prepare(
    `SELECT id,name,email,phone,score,stage,created_at,last_contacted_at
     FROM applications
     WHERE stage IN ('new','contacted')
       AND (last_contacted_at IS NULL OR last_contacted_at < datetime('now','-3 days'))
     ORDER BY score DESC LIMIT 10`
  ).all();
  return {
    stats: stats || {},
    views: views || {},
    rows: (list.results || []),
    content: Object.fromEntries((content.results || []).map((r) => [r.key, r.value || ''])),
    daily: daily.results || [],
    sources: sources.results || [],
    funnel: funnel || {},
    activity: activity.results || [],
    errors: errors.results || [],
    admins: admins.results || [],
    settings,
    reminders: reminders.results || [],
  };
}

async function handleDashboard(request, env, session) {
  const data = await dashboardData(env);
  return html(shell('Dashboard · Skip to 7 Figures Admin', dashboardPage(data, session.csrf)));
}

async function handleUpdateApplication(request, env, session, id) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false }, 400);
  const sets = [];
  const binds = [];
  const changes = [];
  if (STAGES.includes(body.stage)) {
    sets.push('stage = ?');
    binds.push(body.stage);
    changes.push('stage=' + body.stage);
    if (body.stage === 'contacted' || body.stage === 'qualified') {
      sets.push("last_contacted_at = datetime('now')");
    }
  }
  if (typeof body.owner === 'string') {
    sets.push('owner = ?');
    binds.push(clean(body.owner, 80));
    changes.push('owner=' + clean(body.owner, 80));
  }
  if (body.spam === true || body.spam === false) {
    sets.push('spam = ?');
    binds.push(body.spam ? 1 : 0);
    changes.push(body.spam ? 'marked spam' : 'unmarked spam');
  }
  if (typeof body.notes === 'string') {
    sets.push('notes = ?', "notes_updated_at = datetime('now')", 'notes_author = ?');
    binds.push(clean(body.notes, 2000), String(session.sub || '').slice(0, 120));
    changes.push('notes edited');
  }
  if (body.rescore === true) {
    const cur = await env.DB.prepare('SELECT capital,timeline,experience,interest,decision FROM applications WHERE id = ?').bind(id).first();
    if (cur) {
      sets.push('score = ?');
      binds.push(scoreLead(cur));
      changes.push('rescored');
    }
  }
  if (!sets.length) return json({ ok: false, error: 'Nothing to update.' }, 400);
  binds.push(id);
  await env.DB.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  await logActivity(env, session.sub, 'updated', id, changes.join(', '));
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
  const header = ['id', 'created_at', 'name', 'email', 'phone', 'capital', 'timeline', 'experience', 'interest', 'decision', 'stage', 'score', 'owner', 'source', 'utm_source', 'utm_campaign', 'status', 'notes'];
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
  td,th{padding-left:8px;padding-right:8px}
  .who a{word-break:break-all}
  .btn.sm{padding:8px 12px}
  .stat{padding:16px 18px}
  .stat b{font-size:1.8rem}
  .twocol{grid-template-columns:1fr}
  .chart{height:120px}
}

/* ---- dashboard components ---- */
.twocol{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:22px}
.stat--hot{border-color:var(--lineg);background:linear-gradient(180deg,#FDF6EA,#fff)}
.stat--hot b{color:#9A7038}
.pill.qualified{background:#F0E9FA;color:#4A3080;border:1px solid #D6C7EE}
.pill.lost{background:#F3EFEA;color:#7A7168;border:1px solid #DED6CB}
.score{display:inline-block;min-width:38px;text-align:center;border-radius:100px;padding:4px 9px;font:700 .8rem/1 var(--mono)}
.score.hot{background:#FBE7D2;color:#8A4B12}
.score.warm{background:#F7EBD4;color:#8A6420}
.score.cool{background:#EDEFEA;color:#6B6459}
.tag{display:inline-block;border-radius:5px;padding:1px 6px;background:#F0E9FA;color:#4A3080;font:700 .62rem/1.5 var(--sans);text-transform:uppercase;letter-spacing:.05em}
.tag--bad{background:#F8E4E1;color:#8A2E22}
.fbar{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.fbar__l{width:116px;font-size:.85rem;color:var(--muted)}
.fbar__track{flex:1;height:12px;border-radius:100px;background:#EFE8DB;overflow:hidden}
.fbar__track i{display:block;height:100%;border-radius:100px}
.fbar__n{width:44px;text-align:right;font:700 .95rem/1 var(--mono)}
.pipes{display:grid;gap:9px}
.pipe{display:grid;grid-template-columns:40px 1fr 96px;align-items:center;gap:12px;background:none;border:0;padding:4px 0;cursor:pointer;text-align:left}
.pipe__n{font:700 1.05rem/1 var(--mono);color:var(--ink)}
.pipe__bar{height:10px;border-radius:100px;background:#EFE8DB;overflow:hidden}
.pipe__bar i{display:block;height:100%;border-radius:100px}
.pipe__l{font-size:.86rem;color:var(--muted)}
.pipe:hover .pipe__l{color:var(--ink)}
:root{--c-new:#C99B54;--c-contacted:#8A6420;--c-qualified:#6A4EA8;--c-closed:#2E7D4F;--c-lost:#9A938A}
.mini{list-style:none;margin:0;padding:0;font-size:.88rem}
.mini li{display:flex;gap:8px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.mini li:last-child{border-bottom:0}
.mini li b{font-weight:600}
.mini li .muted{font-size:.8rem}
.chart{display:flex;align-items:flex-end;gap:6px;height:140px;padding-top:10px}
.day{flex:1;display:flex;align-items:flex-end;gap:2px;height:100%;position:relative}
.day span{display:block;flex:1;border-radius:4px 4px 0 0}
.day__v{background:#E2C79B}
.day__l{background:#2E7D4F}
.day em{position:absolute;bottom:-16px;left:0;right:0;text-align:center;font:500 .62rem/1 var(--mono);color:var(--muted);font-style:normal}
.bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 14px;margin-bottom:14px;background:#FBF6EA;border:1px solid var(--lineg);border-radius:12px}
.bulk span{font:600 .84rem/1 var(--sans)}
.pre{background:#F4F1EA;border:1px solid var(--line);border-radius:10px;padding:12px;font:500 .78rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-all;margin:12px 0 0}
.drawer__head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
select.search{padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--cream);font:400 .95rem/1.3 var(--sans);color:var(--ink)}
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

export default {
  async scheduled(event, env, ctx) {
    // daily digest + retention purge
    try {
      const digest = await buildDigest(env);
      if (digest.newLeads > 0 || digest.total > 0) {
        const token = env.TELEGRAM_BOT_TOKEN;
        const chatId = env.TELEGRAM_CHAT_ID;
        if (token && chatId) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: digest.text }),
          });
        }
        await env.DB.prepare('INSERT INTO notify_log(kind,detail) VALUES (?,?)').bind('digest', digest.text.slice(0, 500)).run();
      }
      const days = parseInt((await getSettings(env)).retention_days || '0', 10) || 0;
      if (days > 0) {
        const r = await env.DB.prepare(`DELETE FROM applications WHERE created_at < datetime('now', ?)`).bind('-' + days + ' days').run();
        if (r && r.meta && r.meta.changes) await logActivity(env, 'system', 'retention_purge', null, `${r.meta.changes} leads older than ${days} days`);
      }
    } catch (e) {
      try { await logError(env, 'scheduled: ' + (e && e.message ? e.message : e), 'scheduled'); } catch { /* ignore */ }
    }
  },
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
          const session = await readSession(env.SESSION_SECRET, request, env);
          if (session) return new Response(null, { status: 302, headers: { Location: '/admin/dashboard', 'Cache-Control': 'no-store' } });
          return html(loginPage({}));
        }
        if (request.method === 'POST') return await handleLogin(request, env);
      }
      if (path === '/admin/logout' && request.method === 'POST') return await handleLogout(request, env);

      if (path === '/admin/dashboard' && request.method === 'GET') {
        const session = await readSession(env.SESSION_SECRET, request, env);
        if (!session) return new Response(null, { status: 302, headers: { Location: '/admin', 'Cache-Control': 'no-store' } });
        return await handleDashboard(request, env, session);
      }
      if (path === '/admin/export.csv' && request.method === 'GET') {
        const session = await readSession(env.SESSION_SECRET, request, env);
        if (!session) return new Response(null, { status: 302, headers: { Location: '/admin', 'Cache-Control': 'no-store' } });
        return await handleExport(request, env);
      }
      if (path.startsWith('/admin/application/') && request.method === 'POST') {
        const session = await readSession(env.SESSION_SECRET, request, env);
        if (!session) return json({ ok: false, error: 'Not signed in.' }, 401);
        const token = request.headers.get('x-csrf-token');
        if (!token || !constantTimeEqual(String(token), String(session.csrf))) return json({ ok: false, error: 'Invalid CSRF token.' }, 403);
        const id = parseInt(path.split('/').pop(), 10);
        if (!id) return json({ ok: false, error: 'Bad id.' }, 400);
        return await handleUpdateApplication(request, env, session, id);
      }
      if (path === '/admin/content' && request.method === 'POST') {
        const session = await readSession(env.SESSION_SECRET, request, env);
        if (!session) return json({ ok: false, error: 'Not signed in.' }, 401);
        const token = request.headers.get('x-csrf-token');
        if (!token || !constantTimeEqual(String(token), String(session.csrf))) return json({ ok: false, error: 'Invalid CSRF token.' }, 403);
        return await handleSaveContent(request, env);
      }

      /* ---- authenticated admin API ---- */
      let session = null;
      if (path.startsWith('/admin/') && request.method !== 'GET') {
        session = await readSession(env.SESSION_SECRET, request, env);
        if (!session) return json({ ok: false, error: 'Not signed in.' }, 401);
        const token = request.headers.get('x-csrf-token');
        if (!token || !constantTimeEqual(String(token), String(session.csrf))) return json({ ok: false, error: 'Invalid CSRF token.' }, 403);
      }

      if (path === '/admin/application/bulk' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean).slice(0, 500) : [];
        const stage = STAGES.includes(body.stage) ? body.stage : null;
        if (!ids.length || !stage) return json({ ok: false, error: 'ids and stage required.' }, 400);
        for (const id of ids) {
          await env.DB.prepare("UPDATE applications SET stage = ?, last_contacted_at = CASE WHEN ? IN ('contacted','qualified') THEN datetime('now') ELSE last_contacted_at END WHERE id = ?").bind(stage, stage, id).run();
        }
        await logActivity(env, session.sub, 'bulk_stage', null, `${ids.length} leads -> ${stage}`);
        return json({ ok: true, updated: ids.length });
      }

      if (path.startsWith('/admin/application/') && request.method === 'DELETE') {
        const id = parseInt(path.split('/').pop(), 10);
        if (!id) return json({ ok: false }, 400);
        await env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(id).run();
        await logActivity(env, session.sub, 'deleted', id, 'lead deleted');
        return json({ ok: true });
      }

      if (path.startsWith('/admin/application/') && request.method === 'GET') {
        const id = parseInt(path.split('/').pop(), 10);
        const row = await env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(id).first();
        if (!row) return json({ ok: false, error: 'Not found.' }, 404);
        const act = await env.DB.prepare('SELECT * FROM activity WHERE entity_id = ? ORDER BY id DESC LIMIT 50').bind(id).all();
        return json({ ok: true, lead: row, activity: act.results || [] });
      }

      if (path === '/admin/api-key' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const created = await createApiKey(env, clean(body.name, 60) || 'integration');
        await logActivity(env, session.sub, 'api_key_created', null, created.name);
        return json({ ok: true, key: created.raw, prefix: created.prefix });
      }
      if (path === '/admin/api-key' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,name,prefix,created_at,last_used_at FROM api_keys ORDER BY id DESC').all();
        return json({ ok: true, keys: rows.results || [] });
      }
      if (path.startsWith('/admin/api-key/') && request.method === 'DELETE') {
        const id = parseInt(path.split('/').pop(), 10);
        await env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
        await logActivity(env, session.sub, 'api_key_revoked', id, 'key revoked');
        return json({ ok: true });
      }

      if (path === '/admin/sessions' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,email,created_at,last_seen,user_agent,revoked FROM admin_sessions ORDER BY created_at DESC LIMIT 50').all();
        return json({ ok: true, sessions: rows.results || [] });
      }
      if (path === '/admin/sessions/revoke' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const sid = clean(body.sid, 64);
        if (!sid) return json({ ok: false }, 400);
        await env.DB.prepare('UPDATE admin_sessions SET revoked = 1 WHERE id = ?').bind(sid).run();
        await logActivity(env, session.sub, 'session_revoked', null, sid);
        return json({ ok: true });
      }

      if (path === '/admin/activity' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 100').all();
        return json({ ok: true, activity: rows.results || [] });
      }
      if (path === '/admin/errors' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM errors ORDER BY id DESC LIMIT 50').all();
        return json({ ok: true, errors: rows.results || [] });
      }

      if (path === '/admin/admins' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,email,created_at,last_login_at FROM admins ORDER BY id').all();
        return json({ ok: true, admins: rows.results || [] });
      }
      if (path === '/admin/admins' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = clean(body.email, 160).toLowerCase();
        const password = String(body.password || '');
        if (!isEmail(email) || password.length < 12) return json({ ok: false, error: 'Valid email and a 12+ character password required.' }, 400);
        const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await pbkdf2(password, salt, 100000);
        await env.DB.prepare('INSERT INTO admins(email,password_hash,salt,iterations) VALUES (?,?,?,100000) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, salt=excluded.salt').bind(email, hash, salt).run();
        await logActivity(env, session.sub, 'admin_added', null, email);
        return json({ ok: true });
      }
      if (path.startsWith('/admin/admins/') && request.method === 'DELETE') {
        const id = parseInt(path.split('/').pop(), 10);
        await env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id).run();
        await logActivity(env, session.sub, 'admin_removed', id, '');
        return json({ ok: true });
      }
      if (path === '/admin/password' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const current = String(body.current || '');
        const next = String(body.next || '');
        if (next.length < 12) return json({ ok: false, error: 'New password must be at least 12 characters.' }, 400);
        const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(session.sub).first();
        if (!admin) return json({ ok: false, error: 'Admin not found.' }, 404);
        const check = await pbkdf2(current, admin.salt, admin.iterations || 100000);
        if (!constantTimeEqual(check, admin.password_hash)) return json({ ok: false, error: 'Current password is incorrect.' }, 401);
        const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await pbkdf2(next, salt, 100000);
        await env.DB.prepare('UPDATE admins SET password_hash = ?, salt = ?, iterations = 100000 WHERE id = ?').bind(hash, salt, admin.id).run();
        await logActivity(env, session.sub, 'password_changed', null, '');
        return json({ ok: true });
      }

      if (path === '/admin/settings' && request.method === 'GET') {
        return json({ ok: true, settings: await getSettings(env) });
      }
      if (path === '/admin/settings' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        for (const [k, v] of Object.entries(body)) {
          if (typeof v === 'string' || typeof v === 'number') await setSetting(env, clean(k, 60), clean(String(v), 400));
        }
        await logActivity(env, session.sub, 'settings_saved', null, '');
        return json({ ok: true });
      }

      if (path === '/admin/webhooks' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM webhook_out ORDER BY id DESC LIMIT 50').all();
        return json({ ok: true, deliveries: rows.results || [] });
      }
      if (path === '/admin/webhooks' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const url = clean(body.url, 300);
        if (!/^https?:\/\//i.test(url)) return json({ ok: false, error: 'A valid http(s) URL is required.' }, 400);
        await env.DB.prepare('INSERT INTO webhook_out(url,event,status,response) VALUES (?,?,?,?)').bind(url, clean(body.event, 40) || 'lead.created', 'configured', '').run();
        await logActivity(env, session.sub, 'webhook_added', null, url);
        return json({ ok: true });
      }
      if (path.startsWith('/admin/webhooks/') && request.method === 'DELETE') {
        const id = parseInt(path.split('/').pop(), 10);
        await env.DB.prepare('DELETE FROM webhook_out WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
      if (path === '/admin/webhooks/test' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const url = clean(body.url, 300);
        if (!/^https?:\/\//i.test(url)) return json({ ok: false, error: 'A valid http(s) URL is required.' }, 400);
        try {
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'test', payload: { ok: true } }) });
          const text = (await res.text()).slice(0, 200);
          return json({ ok: true, status: res.status, response: text });
        } catch (e) {
          return json({ ok: false, error: String(e && e.message ? e.message : e) });
        }
      }

      if (path === '/admin/digest' && request.method === 'GET') {
        return json({ ok: true, digest: await buildDigest(env) });
      }
      if (path === '/admin/recalc' && request.method === 'POST') {
        const rows = await env.DB.prepare('SELECT id,capital,timeline,experience,interest,decision FROM applications').all();
        for (const r of rows.results || []) {
          await env.DB.prepare('UPDATE applications SET score = ? WHERE id = ?').bind(scoreLead(r), r.id).run();
        }
        await logActivity(env, session.sub, 'recalc_scores', null, `${(rows.results || []).length} leads`);
        return json({ ok: true, updated: (rows.results || []).length });
      }

      /* ---- API-key protected JSON API for external tools ---- */
      if ((path === '/v1/leads' || path.startsWith('/v1/leads/')) && request.method === 'GET') {
        const key = await verifyApiKey(env, request);
        if (!key) return json({ ok: false, error: 'Invalid or missing API key.' }, 401);
        if (path === '/v1/leads') {
          const limit = Math.min(500, parseInt(new URL(request.url).searchParams.get('limit') || '100', 10) || 100);
          const rows = await env.DB.prepare('SELECT * FROM applications ORDER BY id DESC LIMIT ?').bind(limit).all();
          return json({ ok: true, count: (rows.results || []).length, leads: rows.results || [] });
        }
        const id = parseInt(path.split('/').pop(), 10);
        const row = await env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(id).first();
        if (!row) return json({ ok: false, error: 'Not found.' }, 404);
        return json({ ok: true, lead: row });
      }

      /* ---- public GDPR self-delete (requires the per-application token) ---- */
      if (path === '/api/delete-my-data' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = clean(body.email, 160).toLowerCase();
        const token = clean(body.token, 64);
        if (!isEmail(email)) return json({ ok: false, error: 'Valid email required.' }, 400);
        if (!token) return json({ ok: false, error: 'Your delete code is required.' }, 400);
        /* throttle so the endpoint cannot be used to probe for valid codes */
        const ipKey = await hashIp(clientIp(request), env.SESSION_SECRET);
        const recent = await env.DB.prepare(
          `SELECT COUNT(*) AS c FROM applications WHERE ip_hash = ? AND created_at > datetime('now','-10 minutes')`
        ).bind(ipKey).first();
        if (recent && recent.c >= 20) return json({ ok: false, error: 'Too many attempts. Please try again later.' }, 429);
        /* only rows whose email AND token both match can be deleted */
        const rows = await env.DB.prepare('SELECT id FROM applications WHERE email = ? AND delete_token = ?').bind(email, token).all();
        for (const r of rows.results || []) {
          await env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(r.id).run();
          await logActivity(env, 'visitor', 'gdpr_delete', r.id, 'self-service delete (token verified)');
        }
        if (!rows.results || !rows.results.length) {
          return json({ ok: false, error: 'That email and delete code do not match an application.' }, 404);
        }
        return json({ ok: true, removed: rows.results.length });
      }

      /* ---- public funnel counters for the site ---- */
      if (path === '/api/stats' && request.method === 'GET') {
        const v = await env.DB.prepare('SELECT COALESCE(SUM(count),0) AS total FROM visits').first();
        const e = await env.DB.prepare("SELECT COUNT(*) AS c FROM events WHERE name = 'apply_start'").first();
        const c = await env.DB.prepare("SELECT COUNT(*) AS c FROM events WHERE name = 'apply_complete'").first();
        const l = await env.DB.prepare('SELECT COUNT(*) AS c FROM applications').first();
        return json({ ok: true, views: (v && v.total) || 0, starts: (e && e.c) || 0, completes: (c && c.c) || 0, leads: (l && l.c) || 0 });
      }

      return html('<h1>Not found</h1><p><a href="/admin">Go to admin</a></p>', 404);
    } catch (err) {
      try { await logError(env, (err && err.message ? err.message : 'unknown') + ' @ ' + path, path); } catch { /* ignore */ }
      return new Response(`Error: ${err && err.message ? err.message : 'unknown'}`, { status: 500 });
    }
  },
};

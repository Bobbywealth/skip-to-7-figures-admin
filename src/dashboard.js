/**
 * Admin console for the Skip to 7 Figures funnel (Cloudflare Worker + D1).
 *
 * Server-rendered markup plus one inline script for the interactive bits.
 * The visual system lives in ./dashboard-css.js so the login page styles in
 * index.js stay untouched.
 *
 * Every id the script reaches for is kept stable - the API contract and the
 * admin endpoints do not change with the redesign.
 */

import { DASH_CSS } from './dashboard-css.js';

const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed: 'Closed',
  lost: 'Lost',
};

const VIEWS = {
  overview: ['Overview', 'Live pulse of the funnel'],
  leads: ['Leads', 'Every application, newest first'],
  content: ['Site copy', 'The words the funnel speaks'],
  automation: ['Automation', 'Webhooks, API keys, digests'],
  settings: ['Settings', 'Retention, admins and security'],
};

const COLUMNS = [
  ['when', 'When', true],
  ['score', 'Score', true],
  ['capital', 'Capital', false],
  ['stage', 'Stage', true],
  ['source', 'Source', false],
  ['open', 'Open', true],
];

const TEMPLATES = {
  intro: 'Hi {name}, thanks for your Skip to 7 Figures application. What are you hoping to build?',
  followup: 'Hi {name}, just following up on your application. Happy to answer anything you need to know.',
  price: 'Hi {name}, happy to send over the cost details. What email should I send them to?',
  later: 'Hi {name}, no rush at all. I will check back in a couple of weeks. Anything I can help with?',
};

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function band(score) {
  const s = Number(score || 0);
  return s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'cool';
}
function num(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}
function ms(iso) {
  if (!iso) return 0;
  const t = Date.parse(String(iso).replace(' ', 'T') + 'Z');
  return Number.isNaN(t) ? 0 : t;
}
function when(iso) {
  if (!iso) return '';
  const t = ms(iso);
  if (!t) return String(iso);
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}
function initials(name, email) {
  const s = String(name || '').trim();
  if (s) return s.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return String(email || '?').slice(0, 1).toUpperCase();
}
function waNumber(phone) {
  return String(phone || '').replace(/\D/g, '');
}
function tagList(r) {
  return String(r.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
/* 0 = fine, 1 = a few hours old, 2 = over a day old */
function slaOf(r) {
  const st = r.stage || 'new';
  if (st !== 'new' && st !== 'contacted') return 0;
  if (r.last_contacted_at) return 0;
  const t = ms(r.created_at);
  if (!t) return 0;
  const h = (Date.now() - t) / 3600000;
  if (h >= 24) return 2;
  if (h >= 3) return 1;
  return 0;
}
function dateOnly(v) {
  return String(v || '').slice(0, 10);
}
function plusDays(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10) + ' 09:00:00';
}

/* ---------- charts ---------- */

function sparkSvg(daily) {
  const n = (daily || []).length;
  if (!n) return '';
  const W = 280, H = 74, pad = 6;
  const max = Math.max(1, ...daily.map((d) => Math.max(num(d.views), num(d.leads))));
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, n - 1);
  const y = (v) => H - pad - ((H - pad * 2) * v) / max;
  const line = (key) => daily.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(num(d[key])).toFixed(1)).join(' ');
  const area = (key) => line(key) + ' L' + x(n - 1).toFixed(1) + ',' + (H - pad) + ' L' + x(0).toFixed(1) + ',' + (H - pad) + ' Z';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="sparkV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F6D69C" stop-opacity=".5"/><stop offset="100%" stop-color="#F6D69C" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area('views')}" fill="url(#sparkV)"/>
    <path d="${line('views')}" fill="none" stroke="#F6D69C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${line('leads')}" fill="none" stroke="#8FD3B4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function chartSvg(daily) {
  const rows = daily || [];
  if (!rows.length) return '<p class="muted" style="font-size:.85rem">No traffic data yet.</p>';
  const W = 1000, H = 250, pl = 42, pr = 16, pt = 18, pb = 32;
  const max = Math.max(1, ...rows.map((d) => Math.max(num(d.views), num(d.leads))));
  const n = rows.length;
  const x = (i) => pl + (i * (W - pl - pr)) / Math.max(1, n - 1);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const line = (key) => rows.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(num(d[key])).toFixed(1)).join(' ');
  const area = (key) => line(key) + ' L' + x(n - 1).toFixed(1) + ',' + (H - pb) + ' L' + x(0).toFixed(1) + ',' + (H - pb) + ' Z';

  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const v = Math.round((max / 4) * g);
    const yy = y(v).toFixed(1);
    grid += `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="rgba(23,18,13,.07)" stroke-width="1"/>`;
    grid += `<text x="${pl - 10}" y="${(+yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#938A7C" font-family="ui-monospace,Menlo,monospace">${v}</text>`;
  }
  let labels = '';
  rows.forEach((d, i) => {
    if (i % 2 === 0 || i === n - 1) {
      labels += `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#938A7C" font-family="ui-monospace,Menlo,monospace">${esc(String(d.day || '').slice(5))}</text>`;
    }
  });
  let dots = '';
  rows.forEach((d, i) => {
    dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(num(d.views)).toFixed(1)}" r="3.2" fill="#CFA85F"><title>${esc(d.day)} - ${esc(d.views)} views</title></circle>`;
    dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(num(d.leads)).toFixed(1)}" r="3.2" fill="#2E7D4F"><title>${esc(d.day)} - ${esc(d.leads)} applications</title></circle>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Views and applications over the last ${n} days">
    <defs>
      <linearGradient id="cV" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#CFA85F" stop-opacity=".4"/><stop offset="100%" stop-color="#CFA85F" stop-opacity="0"/></linearGradient>
      <linearGradient id="cL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2E7D4F" stop-opacity=".32"/><stop offset="100%" stop-color="#2E7D4F" stop-opacity="0"/></linearGradient>
    </defs>
    ${grid}
    <path d="${area('views')}" fill="url(#cV)"/>
    <path d="${area('leads')}" fill="url(#cL)"/>
    <path d="${line('views')}" fill="none" stroke="#CFA85F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${line('leads')}" fill="none" stroke="#2E7D4F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg>`;
}

/* ---------- page ---------- */

export function dashboardPage(data, csrf) {
  const s = data.stats || {};
  const v = data.views || {};
  const f = data.funnel || {};
  const rows = data.rows || [];
  const daily = data.daily || [];
  const stages = ['new', 'contacted', 'qualified', 'closed', 'lost'];
  const stageCount = (st) => Number(s[st === 'new' ? 'fresh' : st] || 0);
  const views = num(v.total);
  const starts = num(f.starts);
  const completes = num(f.completes);
  const conv = views > 0 ? ((completes / views) * 100).toFixed(1) : '0.0';
  const startRate = views > 0 ? ((starts / views) * 100).toFixed(1) : '0.0';
  const finishRate = starts > 0 ? ((completes / starts) * 100).toFixed(1) : '0.0';
  const funnelMax = Math.max(views, starts, completes, 1);
  const total = num(s.total);
  const settings = data.settings || {};
  const content = data.content || {};
  const bands = data.bands || { hot: 0, warm: 0, cool: 0, untouched: 0 };
  const response = data.response || { avg_hours: null, contacted: 0 };

  /* ---- health signals for the hero strip ---- */
  const last7 = daily.slice(-7).reduce((a, d) => a + num(d.leads), 0);
  const prev7 = daily.slice(-14, -7).reduce((a, d) => a + num(d.leads), 0);
  const trendState = prev7 === 0 ? (last7 > 0 ? 'good' : 'flat') : (last7 >= prev7 ? 'good' : 'bad');
  const avgH = response.avg_hours == null ? null : Number(response.avg_hours);
  const respState = avgH == null ? 'flat' : avgH <= 12 ? 'good' : avgH <= 48 ? 'warn' : 'bad';
  const backlogState = num(bands.untouched) > 10 ? 'bad' : num(bands.untouched) > 3 ? 'warn' : 'good';
  const hotRate = total > 0 ? (num(bands.hot) / total) * 100 : 0;
  const hotState = hotRate >= 20 ? 'good' : hotRate >= 8 ? 'warn' : 'flat';

  const plate = (n, label, tone) =>
    `<div class="plate${tone ? ' ' + tone : ''}"><b>${esc(n ?? 0)}</b><span>${esc(label)}</span></div>`;

  const fnRow = (label, value, color) => {
    const pct = Math.max(3, Math.round((num(value) / funnelMax) * 100));
    return `<div class="fn__row"><span class="fn__l">${esc(label)}</span>` +
      `<span class="fn__track"><span class="fn__fill" style="width:${pct}%;background:${color}"></span></span>` +
      `<span class="fn__n">${esc(value)}</span></div>`;
  };

  const pipelineBars = stages
    .map((st) => {
      const n = stageCount(st);
      const pct = Math.max(2, Math.round((n / Math.max(1, total)) * 100));
      return `<button class="pipe" data-stage="${st}">` +
        `<span class="pipe__dot" style="background:var(--c-${st})"></span>` +
        `<span class="pipe__l">${esc(STAGE_LABELS[st])}</span>` +
        `<span class="pipe__bar"><i style="width:${pct}%;background:var(--c-${st})"></i></span>` +
        `<span class="pipe__n">${esc(n)}</span></button>`;
    })
    .join('');

  const tableRows = rows
    .map((r) => {
      const dup = r.duplicate_of ? ' dup' : '';
      const spam = r.spam ? ' spam' : '';
      const st = r.stage || 'new';
      const src = r.source_label || r.utm_source || 'direct';
      const sc = band(r.score);
      const sla = slaOf(r);
      const slaChip = sla === 2 ? '<span class="sla sla--2">24h+</span>' : sla === 1 ? '<span class="sla sla--1">3h+</span>' : '';
      const tags = tagList(r);
      const tagChips = tags.slice(0, 2).map((t) => `<span class="tag tag--tag">${esc(t)}</span>`).join('');
      const created = ms(r.created_at);
      const contacted = ms(r.last_contacted_at);
      return `<tr class="row${dup}${spam}" data-id="${esc(r.id)}" data-stage="${esc(st)}" data-source="${esc(String(src).toLowerCase())}"` +
        ` data-owner="${esc(String(r.owner || '').toLowerCase())}" data-date="${esc(String(r.created_at || '').slice(0, 10))}"` +
        ` data-name="${esc(r.name || '')}" data-email="${esc(r.email || '')}" data-phone="${esc(r.phone || '')}"` +
        ` data-capital="${esc(r.capital || '')}" data-timeline="${esc(r.timeline || '')}" data-experience="${esc(r.experience || '')}"` +
        ` data-interest="${esc(r.interest || '')}" data-decision="${esc(r.decision || '')}" data-owner-name="${esc(r.owner || '')}"` +
        ` data-source-label="${esc(src)}" data-score="${esc(r.score || 0)}" data-band="${esc(sc)}" data-when="${esc(when(r.created_at))}"` +
        ` data-created="${created}" data-contacted="${contacted}" data-dup="${r.duplicate_of ? 1 : 0}" data-tags="${esc(tags.join(',').toLowerCase())}"` +
        ` data-next="${esc(r.next_action_at || '')}" data-notes="${esc(r.notes || '')}"` +
        ` data-search="${esc([r.name, r.email, r.phone, r.capital, r.interest, r.utm_campaign, r.referrer, r.owner, src, r.notes, tags.join(' ')].join(' ').toLowerCase())}">` +
        `<td><input type="checkbox" class="pick" data-id="${esc(r.id)}" aria-label="Select lead ${esc(r.id)}"></td>` +
        `<td class="mono hide" data-col="when" data-when-cell="${created}">${esc(when(r.created_at))}${slaChip}</td>` +
        `<td class="who"><span class="who__av ${sc}">${esc(initials(r.name, r.email))}</span><div>` +
        `<b>${esc(r.name || '-')}${tagChips}${r.duplicate_of ? ' <span class="tag">dup</span>' : ''}${r.flagged ? ' <span class="tag tag--warn">unverified</span>' : ''}${r.spam ? ' <span class="tag tag--bad">spam</span>' : ''}</b>` +
        `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a></div></td>` +
        `<td data-col="score"><span class="score ${sc}">${esc(r.score || 0)}</span></td>` +
        `<td class="hide" data-col="capital">${esc(r.capital)}</td>` +
        `<td class="pill-cell" data-col="stage"><span class="pill ${esc(st)}">${esc(STAGE_LABELS[st] || st)}</span></td>` +
        `<td class="hide" data-col="source">${esc(src)}</td>` +
        `<td data-col="open"><button class="btn sm ghost" data-open="${esc(r.id)}">Open</button></td></tr>`;
    })
    .join('');

  const drawers = rows
    .map((r) => {
      const st = r.stage || 'new';
      const phone = waNumber(r.phone);
      const tags = tagList(r);
      const sla = slaOf(r);
      const next = r.next_action_at || '';
      return `<div class="drawer" id="d-${esc(r.id)}">
      <div class="drawer__head">
        <div><h3>${esc(r.name || 'Applicant')} <span class="score ${band(r.score)}">${esc(r.score || 0)}</span>${sla === 2 ? '<span class="sla sla--2">24h+</span>' : sla === 1 ? '<span class="sla sla--1">3h+</span>' : ''}</h3>
        <p class="muted" style="margin:4px 0 0;font-size:.82rem">${esc(when(r.created_at))} · ${esc(r.source_label || r.source || 'funnel')} · ${esc(r.device || '')} ${esc(r.country || '')}</p></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="pill ${esc(st)}">${esc(STAGE_LABELS[st] || st)}</span>
          <button class="drawer__x" data-close="${esc(r.id)}" aria-label="Close lead">×</button>
        </div>
      </div>
      <div class="rowact" style="margin:0 0 14px">
        <a class="btn sm gold" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Skip to 7 Figures')}">Email</a>
        <a class="btn sm ghost" href="tel:${esc(r.phone)}">Call</a>
        <a class="btn sm ghost" data-wa="${esc(r.id)}" href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn sm ghost" data-copy="${esc(r.id)}">Copy details</button>
        <button class="btn sm ghost" data-print="${esc(r.id)}">Print</button>
      </div>
      <div class="tpl">
        <label>Message template</label>
        <div class="rowact" style="margin-top:0">
          <select class="tpl__sel" data-tpl="${esc(r.id)}">
            <option value="">Choose a template...</option>
            <option value="intro">Intro</option>
            <option value="followup">Follow up</option>
            <option value="price">Price question</option>
            <option value="later">Not now</option>
          </select>
          <button class="btn sm ghost" data-tplcopy="${esc(r.id)}">Copy message</button>
        </div>
        <p class="tpl__out" data-tplout="${esc(r.id)}" hidden></p>
      </div>
      <div class="remind">
        <label>Follow up</label>
        <div class="rowact" style="margin-top:0">
          <button class="btn sm ghost" data-remind="${esc(r.id)}" data-days="1">Tomorrow</button>
          <button class="btn sm ghost" data-remind="${esc(r.id)}" data-days="3">In 3 days</button>
          <button class="btn sm ghost" data-remind="${esc(r.id)}" data-days="7">Next week</button>
          <input class="rmdate" type="date" data-rmdate="${esc(r.id)}" value="${esc(dateOnly(next))}">
          ${next ? `<button class="btn sm ghost" data-remindclear="${esc(r.id)}">Clear</button>` : ''}
        </div>
        <p class="muted remind__msg" data-rmmsg="${esc(r.id)}">${next ? 'Follow-up set for ' + esc(String(next).slice(0, 10)) : 'No follow-up set'}</p>
      </div>
      <div class="tagbox">
        <label>Tags</label>
        <div class="rowact" style="margin-top:0">
          <input class="edit" data-field="tags" data-id="${esc(r.id)}" value="${esc(tags.join(', '))}" placeholder="vip, booked">
          <button class="btn sm ghost" data-tagsave="${esc(r.id)}">Save tags</button>
        </div>
        <div class="chips" style="margin-top:8px">
          ${['VIP', 'Booked', 'Applied', 'Ghost'].map((t) => `<button class="chip chip--mini" data-addtag="${esc(r.id)}" data-tag="${esc(t)}">+ ${esc(t)}</button>`).join('')}
        </div>
      </div>
      <dl class="kv">
        <dt>Email</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd>
        <dt>Phone</dt><dd><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></dd>
        <dt>Capital</dt><dd>${esc(r.capital || '-')}</dd>
        <dt>Timeline</dt><dd>${esc(r.timeline || '-')}</dd>
        <dt>Experience</dt><dd>${esc(r.experience || '-')}</dd>
        <dt>Interest</dt><dd>${esc(r.interest || '-')}</dd>
        <dt>Decision</dt><dd>${esc(r.decision || '-')}</dd>
        <dt>Source</dt><dd>${esc(r.utm_source || 'direct')} ${r.utm_campaign ? '· ' + esc(r.utm_campaign) : ''} ${r.referrer ? '· ' + esc(r.referrer) : ''}</dd>
        <dt>Owner</dt><dd>${esc(r.owner || 'unassigned')}</dd>
        <dt>Notes</dt><dd>${esc(r.notes_updated_at ? when(r.notes_updated_at) : 'never')}${r.notes_author ? ' by ' + esc(r.notes_author) : ''}</dd>
      </dl>
      <div class="grid2">
        <div><label>Name</label><input class="edit" data-field="name" data-id="${esc(r.id)}" value="${esc(r.name || '')}"></div>
        <div><label>Email</label><input class="edit" data-field="email" data-id="${esc(r.id)}" value="${esc(r.email || '')}"></div>
        <div><label>Phone</label><input class="edit" data-field="phone" data-id="${esc(r.id)}" value="${esc(r.phone || '')}"></div>
        <div><label>Owner</label><input class="edit" data-field="owner" data-id="${esc(r.id)}" value="${esc(r.owner || '')}" placeholder="unassigned"></div>
      </div>
      <div style="margin-top:16px"><label>Notes</label><textarea class="notes" id="n-${esc(r.id)}" placeholder="Notes, outcome, next step...">${esc(r.notes || '')}</textarea></div>
      <div class="rowact">
        ${stages.map((x) => `<button class="btn sm${x === st ? ' gold' : ' ghost'}" data-stage-set="${esc(x)}" data-target="${esc(r.id)}">${esc(STAGE_LABELS[x])}</button>`).join('')}
        <button class="btn sm gold" data-save="${esc(r.id)}">Save</button>
        <button class="btn sm ghost" data-spam="${esc(r.id)}" data-spam-state="${r.spam ? 1 : 0}">${r.spam ? 'Not spam' : 'Mark spam'}</button>
        <button class="btn sm ghost" data-del="${esc(r.id)}">Delete</button>
      </div>
    </div>`;
    })
    .join('');

  const reminders = (data.reminders || [])
    .map((r) => `<li><b>${esc(r.name || r.email)}</b> <span class="muted">score ${esc(r.score)} · ${esc(STAGE_LABELS[r.stage] || r.stage)} · ${esc(when(r.last_contacted_at || r.created_at))}</span> <button class="btn sm ghost" data-jump="${esc(r.id)}">Open</button></li>`)
    .join('') || '<li class="muted">Nothing waiting. You are caught up.</li>';

  const dueList = (data.due || [])
    .map((r) => `<li><b>${esc(r.name || r.email)}</b> <span class="muted">due ${esc(String(r.next_action_at || '').slice(0, 10))} · score ${esc(r.score)}</span> <button class="btn sm ghost" data-jump="${esc(r.id)}">Open</button></li>`)
    .join('');
  const upList = (data.upcoming || [])
    .map((r) => `<li><b>${esc(r.name || r.email)}</b> <span class="muted">${esc(String(r.next_action_at || '').slice(0, 10))} · score ${esc(r.score)}</span> <button class="btn sm ghost" data-jump="${esc(r.id)}">Open</button></li>`)
    .join('');

  const dupList = (data.duplicates || [])
    .map((d) => `<li><b>${esc(d.name || d.email)}</b> <span class="muted">duplicate of ${esc(d.orig_name || d.orig_email)} · ${esc(when(d.created_at))}</span> <button class="btn sm ghost" data-jump="${esc(d.id)}">Open</button></li>`)
    .join('');

  const qMax = Math.max(1, ...(data.quality || []).map((x) => num(x.n)));
  const quality = (data.quality || [])
    .map((x) => `<tr><td>${esc(x.src || 'direct')}</td>` +
      `<td class="qbar"><span class="qbar__t"><i style="width:${Math.max(3, Math.round((num(x.n) / qMax) * 100))}%"></i></span>${esc(x.n)}</td>` +
      `<td>${esc(x.hot)}</td><td>${esc(x.qualified)}</td></tr>`)
    .join('');

  const bandTotal = Math.max(1, num(bands.hot) + num(bands.warm) + num(bands.cool));
  const bandRow = (label, n, color) => `<div class="mixrow"><span>${esc(label)}</span>` +
    `<span class="mixrow__t"><i style="width:${Math.max(2, Math.round((num(n) / bandTotal) * 100))}%;background:${color}"></i></span>` +
    `<span class="mixrow__n">${esc(n)}</span></div>`;

  const activity = (data.activity || [])
    .map((a) => {
      const kind = /applied|created/i.test(a.action || '') ? 'lead' : /login/i.test(a.action || '') ? 'admin' : 'system';
      return `<li data-act="${esc(kind)}"><b>${esc(a.actor || 'system')}</b> ${esc(a.action)} ${a.entity_id ? '#' + esc(a.entity_id) : ''} <span class="muted">${esc(when(a.created_at))}${a.detail ? ' · ' + esc(a.detail) : ''}</span></li>`;
    })
    .join('') || '<li class="muted">No activity yet.</li>';

  const errors = (data.errors || [])
    .map((e) => `<li><b>${esc(when(e.created_at))}</b> ${esc(e.message)}</li>`)
    .join('') || '<li class="muted">No errors recorded.</li>';

  const admins = (data.admins || [])
    .map((a) => `<li><b>${esc(a.email)}</b> <span class="muted">last ${esc(a.last_login_at ? when(a.last_login_at) : 'never')}</span> <button class="btn sm ghost" data-rmadmin="${esc(a.id)}">Remove</button></li>`)
    .join('');

  const tagChips = (data.tags || [])
    .map((t) => `<button class="chip" data-filter="tag:${esc(t.tag)}">${esc(t.tag)} <span class="chip__n">${esc(t.n)}</span></button>`)
    .join('');

  const health = [
    { k: 'Applications', v: last7 + ' this week', s: trendState, d: prev7 ? 'vs ' + prev7 + ' last week' : '' },
    { k: 'Response time', v: avgH == null ? 'no data' : avgH + 'h avg', s: respState, d: response.contacted ? response.contacted + ' contacted' : '' },
    { k: 'Uncontacted', v: num(bands.untouched), s: backlogState, d: 'waiting on you' },
    { k: 'Hot rate', v: hotRate.toFixed(0) + '%', s: hotState, d: num(bands.hot) + ' hot leads' },
  ];

  return `<style>${DASH_CSS}</style>
<div class="app" id="app">
  <aside class="rail" id="rail">
    <div class="rail__brand">
      <span class="rail__mark"><img src="https://skip-to-7-figures.skip7figures.workers.dev/favicon.png" alt="" width="22" height="22"></span>
      <span class="rail__name"><b>Skip to 7 Figures</b><em>Admin console</em></span>
    </div>
    <nav class="rail__nav">
      <p class="rail__label">Command</p>
      <a class="navi is-on" href="#overview" data-view="overview">Overview</a>
      <p class="rail__label">Pipeline</p>
      <a class="navi" href="#leads" data-view="leads">Leads <span class="navi__n" id="navLeads">${esc(total)}</span></a>
      <p class="rail__label">Manage</p>
      <a class="navi" href="#content" data-view="content">Site copy</a>
      <a class="navi" href="#automation" data-view="automation">Automation</a>
      <a class="navi" href="#settings" data-view="settings">Settings</a>
    </nav>
    <div class="rail__foot">
      <div class="rail__who"><span class="avatar">${esc(initials('Admin', ''))}</span><div><b>Administrator</b><span>${esc((data.admins && data.admins[0] && data.admins[0].email) || '')}</span></div></div>
      <a class="rail__link" href="https://skip-to-7-figures.skip7figures.workers.dev/" target="_blank" rel="noopener">View live site ↗</a>
      <button class="rail__link" id="themeBtn">Dark mode</button>
      <button class="rail__link" id="keysBtn">Keyboard shortcuts</button>
      <form method="post" action="/admin/logout" id="logoutForm"><button class="rail__link" type="submit">Sign out</button></form>
    </div>
  </aside>

  <div class="main">
    <header class="bar">
      <button class="bar__burger" id="burger" aria-label="Open menu">☰</button>
      <div class="bar__title"><h1 id="viewTitle">Overview</h1><p id="viewSub">Live pulse of the funnel</p></div>
      <div class="bar__actions">
        <span class="newpill" id="newPill" hidden><b></b><button type="button" id="newReload">Reload</button></span>
        <button class="live" id="liveBtn" aria-pressed="false"><span class="live__dot"></span>Live</button>
        <button class="omni" id="omniBtn"><span>Search leads</span><kbd>⌘K</kbd></button>
        <a class="bar__link" href="/admin/export.csv">Export CSV</a>
      </div>
    </header>

    <main class="canvas">

      <!-- ============ OVERVIEW ============ -->
      <section class="view is-on" data-view="overview">
        <div class="hero">
          <div class="hero__grid">
            <div>
              <p class="eyebrow">Applications captured</p>
              <b class="hero__num">${esc(total)}</b>
              <span class="hero__cap">${esc(num(s.week))} in the last 7 days · ${esc(views)} page views</span>
            </div>
            <div class="hero__stats">
              <div><b>${esc(conv)}%</b><span>View → apply</span></div>
              <div><b>${esc(num(s.hot))}</b><span>Hot leads</span></div>
              <div><b>${esc(num(s.qualified))}</b><span>Qualified</span></div>
            </div>
            <div class="hero__spark">${sparkSvg(daily)}</div>
          </div>
          <div class="health">
            ${health.map((h) => `<div class="health__i health--${h.s}"><span class="health__dot"></span><div><b>${esc(h.v)}</b><span>${esc(h.k)}</span>${h.d ? `<em>${esc(h.d)}</em>` : ''}</div></div>`).join('')}
          </div>
        </div>

        <div class="plates">
          ${plate(total, 'Applications')}
          ${plate(s.fresh, 'New')}
          ${plate(s.hot, 'Hot leads', 'plate--hot')}
          ${plate(s.qualified, 'Qualified')}
          ${plate(views, 'Page views')}
        </div>

        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>Conversion funnel</h2><p>Views → started the form → completed it.</p></div>
            </div>
            <div class="fn">
              ${fnRow('Page views', views, 'linear-gradient(90deg,#F6D69C,#CFA85F)')}
              ${fnRow('Started form', starts, 'linear-gradient(90deg,#E0BE7E,#B98C42)')}
              ${fnRow('Completed', completes, 'linear-gradient(90deg,#7FBF9C,#2E7D4F)')}
            </div>
            <div class="fn__note">
              <span class="fn__chip"><b>${esc(startRate)}%</b> started the form</span>
              <span class="fn__chip"><b>${esc(finishRate)}%</b> finished it</span>
              <span class="fn__chip"><b>${esc(conv)}%</b> of all viewers applied</span>
            </div>
          </section>

          <section class="panel">
            <div class="panel__head">
              <div><h2>Pipeline</h2><p>Click a stage to filter the lead list.</p></div>
            </div>
            <div class="pipes">${pipelineBars}</div>
          </section>
        </div>

        <section class="panel">
          <div class="panel__head">
            <div><h2>Traffic · last ${esc(daily.length || 0)} days</h2><p>Page views and applications, day by day.</p></div>
          </div>
          <div class="chartbox">${chartSvg(daily)}</div>
          <div class="legend">
            <span><i style="background:#CFA85F"></i>Page views</span>
            <span><i style="background:#2E7D4F"></i>Applications</span>
          </div>
        </section>

        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>Needs attention</h2><p>Waiting on you, duplicates, spam.</p></div>
              <span class="muted" style="font-size:.82rem">${esc(num(s.dupes))} duplicate · ${esc(num(s.spam))} spam</span>
            </div>
            <ul class="mini">${reminders}</ul>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div><h2>Follow-ups</h2><p>Reminders you set, overdue and coming up.</p></div>
            </div>
            <ul class="mini">${dueList || '<li class="muted">Nothing due.</li>'}</ul>
            ${upList ? `<p class="panel__sub">Coming up</p><ul class="mini">${upList}</ul>` : ''}
          </section>
        </div>

        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>Source quality</h2><p>Which traffic turns into hot and qualified leads.</p></div>
            </div>
            ${quality ? `<table class="qtable"><thead><tr><th>Source</th><th>Leads</th><th>Hot</th><th>Qualified</th></tr></thead><tbody>${quality}</tbody></table>` : '<p class="muted" style="font-size:.85rem">No traffic data yet.</p>'}
          </section>
          <section class="panel">
            <div class="panel__head">
              <div><h2>Lead quality mix</h2><p>Scored hot, warm and cool.</p></div>
            </div>
            <div class="mix">
              ${bandRow('Hot', bands.hot, 'linear-gradient(90deg,#F0B27A,#C9702F)')}
              ${bandRow('Warm', bands.warm, 'linear-gradient(90deg,#E3C48A,#B98C42)')}
              ${bandRow('Cool', bands.cool, 'linear-gradient(90deg,#C9C3B6,#8E877A)')}
            </div>
            <p class="muted" style="margin:14px 0 0;font-size:.84rem">${esc(num(bands.untouched))} never contacted</p>
          </section>
        </div>

        ${(data.duplicates || []).length ? `<section class="panel">
          <div class="panel__head">
            <div><h2>Duplicate applications</h2><p>The same person applied more than once.</p></div>
          </div>
          <ul class="mini">${dupList}</ul>
        </section>` : ''}
      </section>

      <!-- ============ LEADS ============ -->
      <section class="view" data-view="leads">
        <div class="leads">
          <div class="leads__list">
            <div class="toolbar">
              <div class="chips" id="chips">
                <button class="chip on" data-filter="all">All</button>
                ${stages.map((x) => `<button class="chip" data-filter="${x}">${esc(STAGE_LABELS[x])}</button>`).join('')}
                <button class="chip" data-filter="hot">Hot</button>
                <button class="chip" data-filter="dup">Duplicates</button>
              </div>
              ${tagChips ? `<div class="chips chips--tags" id="tagChips">${tagChips}</div>` : ''}
              <input class="search" id="q" type="search" placeholder="Search leads...">
              <select id="srcFilter" class="search"><option value="">All sources</option>${(data.sources || []).map((x) => `<option value="${esc(String(x.src || 'direct').toLowerCase())}">${esc(x.src || 'direct')}</option>`).join('')}</select>
              <select id="sortSel" class="search" title="Sort">
                <option value="new">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="score">Highest score</option>
                <option value="scoreLow">Lowest score</option>
                <option value="name">Name A-Z</option>
                <option value="contacted">Recently contacted</option>
              </select>
              <input class="search" id="from" type="date" title="From date">
              <input class="search" id="to" type="date" title="To date">
              <span class="colmenu">
                <button class="btn sm ghost" id="colBtn">Columns</button>
                <span class="colmenu__pop" id="colPop" hidden>
                  ${COLUMNS.map((c) => `<label class="colmenu__row"><input type="checkbox" data-col-toggle="${c[0]}"${c[2] ? ' checked' : ''}> ${esc(c[1])}</label>`).join('')}
                </span>
              </span>
            </div>
            <div class="bulk" id="bulk" hidden>
              <span id="bulkCount">0 selected</span>
              ${stages.map((x) => `<button class="btn sm ghost" data-bulk="${x}">Mark ${esc(STAGE_LABELS[x])}</button>`).join('')}
              <button class="btn sm ghost" id="bulkAll">Mark all visible contacted</button>
              <button class="btn sm ghost" id="bulkClear">Clear</button>
            </div>
            ${(data.totalRows || rows.length) > rows.length ? `<p class="muted" style="margin:0 0 14px;font-size:.84rem">Showing the ${esc(rows.length)} most recent of ${esc(data.totalRows)}. <a href="/admin/dashboard?limit=200" style="color:var(--gold-dp)">Show 200</a> · <a href="/admin/dashboard?limit=500" style="color:var(--gold-dp)">Show all</a></p>` : ''}
            ${rows.length ? `<div class="tablewrap" id="tablewrap"><table><thead><tr>
              <th style="width:28px"></th><th class="hide" data-col="when">When</th><th>Applicant</th><th data-col="score">Score</th><th class="hide" data-col="capital">Capital</th><th data-col="stage">Stage</th><th class="hide" data-col="source">Source</th><th data-col="open"></th>
            </tr></thead><tbody id="tbody">${tableRows}</tbody></table></div>` : `<div class="empty"><b>No applications yet</b>When someone completes the form on the funnel it will land here.</div>`}
          </div>
          <aside class="leads__detail" id="detail">
            <div class="detail__empty"><b>Select a lead</b>Pick a row to see every answer, add notes and move it through the pipeline.</div>
            ${drawers}
          </aside>
        </div>
      </section>

      <!-- ============ SITE COPY ============ -->
      <section class="view" data-view="content">
        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>Site copy</h2><p>Override the funnel wording. Leave a box blank to keep the original.</p></div>
            </div>
            <div class="grid2">
              <div><label>Headline</label><input id="c-headline" value="${esc(content.headline || '')}" placeholder="Launch your own beauty brand."></div>
              <div><label>Sub-headline</label><input id="c-subheadline" value="${esc(content.subheadline || '')}"></div>
              <div><label>CTA label</label><input id="c-cta_label" value="${esc(content.cta_label || '')}" placeholder="Start your application"></div>
              <div><label>Specialties</label><input id="c-specialties" value="${esc(content.specialties || '')}" placeholder="Skincare, Hair growth..."></div>
            </div>
            <div style="margin-top:14px"><label>Cost answer</label><textarea id="c-cost_answer" class="notes" placeholder="What does it cost? Answer the applicants.">${esc(content.cost_answer || '')}</textarea></div>
            <div class="rowact"><button class="btn gold" id="saveContent">Save copy</button><span id="contentMsg" class="muted" style="font-size:.85rem"></span></div>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div><h2>Activity</h2><p>Every change, newest first.</p></div>
            </div>
            <div class="chips" id="actChips">
              <button class="chip on" data-act-filter="all">All</button>
              <button class="chip" data-act-filter="lead">Leads</button>
              <button class="chip" data-act-filter="admin">Admin</button>
              <button class="chip" data-act-filter="system">System</button>
            </div>
            <ul class="mini actlist" id="actList">${activity}</ul>
            <button class="btn sm ghost" id="actMore" style="margin-top:12px">Show more</button>
          </section>
        </div>
      </section>

      <!-- ============ AUTOMATION ============ -->
      <section class="view" data-view="automation">
        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>API keys</h2><p>For pulling leads into other systems. The key is shown once.</p></div>
            </div>
            <div class="rowact"><input id="keyName" placeholder="name" style="flex:1;min-width:120px"><button class="btn sm gold" id="makeKey">Create key</button></div>
            <pre id="keyOut" class="pre" hidden></pre>
            <ul class="mini" id="keyList"></ul>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div><h2>Webhooks</h2><p>POST a JSON payload on each new lead.</p></div>
            </div>
            <div class="rowact"><input id="hookUrl" placeholder="https://..." style="flex:1;min-width:160px"><button class="btn sm gold" id="addHook">Add</button></div>
            <ul class="mini" id="hookList"></ul>
          </section>
        </div>
        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>Daily digest</h2><p>Sent to your Telegram once a day.</p></div>
            </div>
            <button class="btn sm ghost" id="previewDigest">Preview digest</button>
            <pre id="digestOut" class="pre" hidden></pre>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div><h2>Sessions</h2><p>Active admin sign-ins.</p></div>
            </div>
            <ul class="mini" id="sessList"></ul>
          </section>
        </div>
      </section>

      <!-- ============ SETTINGS ============ -->
      <section class="view" data-view="settings">
        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>Settings</h2><p>Retention auto-purges old leads daily (0 = keep forever).</p></div>
            </div>
            <label>Retention (days)</label><input id="set-retention" value="${esc(settings.retention_days || '0')}">
            <div class="rowact"><button class="btn sm gold" id="saveSettings">Save settings</button><span id="setMsg" class="muted" style="font-size:.85rem"></span></div>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div><h2>Admin users</h2><p>Other people who can sign in.</p></div>
            </div>
            <ul class="mini">${admins}</ul>
            <div class="rowact"><input id="newAdminEmail" placeholder="email" style="flex:1;min-width:140px"><input id="newAdminPw" placeholder="password (12+ chars)" style="flex:1;min-width:140px"><button class="btn sm gold" id="addAdmin">Add</button></div>
            <span id="adminMsg" class="muted" style="font-size:.85rem"></span>
          </section>
        </div>
        <div class="grid-2">
          <section class="panel">
            <div class="panel__head">
              <div><h2>Change password</h2><p>Your own account.</p></div>
            </div>
            <label>Current password</label><input id="pwCur" type="password" autocomplete="current-password">
            <label style="margin-top:10px">New password</label><input id="pwNew" type="password" autocomplete="new-password">
            <div class="rowact"><button class="btn sm gold" id="chPw">Change password</button><span id="pwMsg" class="muted" style="font-size:.85rem"></span></div>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div><h2>Errors</h2><p>Exceptions recorded by the API.</p></div>
            </div>
            <ul class="mini">${errors}</ul>
          </section>
        </div>
      </section>

    </main>
  </div>

  <div class="palette" id="palette">
    <div class="palette__box">
      <input id="omniInput" type="search" placeholder="Jump to a lead by name, email or phone..." autocomplete="off">
      <ul class="palette__list" id="omniList"></ul>
      <p class="palette__foot">↑ ↓ to move · Enter to open · Esc to close</p>
    </div>
  </div>

  <div class="palette" id="shortcuts">
    <div class="palette__box">
      <div class="sheet__head"><b>Keyboard shortcuts</b><button class="drawer__x" id="sheetClose" aria-label="Close">×</button></div>
      <dl class="keys">
        <dt>⌘K / Ctrl K</dt><dd>Search and jump to a lead</dd>
        <dt>/</dt><dd>Focus the search box</dd>
        <dt>j / k</dt><dd>Move down / up the lead list</dd>
        <dt>Enter</dt><dd>Open the selected lead</dd>
        <dt>Esc</dt><dd>Close a panel or clear the search</dd>
        <dt>?</dt><dd>This list</dd>
      </dl>
    </div>
  </div>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>
</div>
    <script>
    const CSRF=${JSON.stringify(csrf)};
    const VIEWS=${JSON.stringify(VIEWS)};
    const TEMPLATES=${JSON.stringify(TEMPLATES)};
    const COLS=${JSON.stringify(COLUMNS.map((c) => c[0]))};
    const BASE_LEADS=${esc(total)};
    const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
    const toast=(m,ok,el)=>{
      const e=el||$('#toast');
      if(!e)return;
      e.textContent=m;
      e.className='toast '+(ok?'toast--ok':'toast--bad')+' toast--show';
      clearTimeout(e._t);
      e._t=setTimeout(()=>e.classList.remove('toast--show'),3000);
    };
    async function api(url,body,method){
      const r=await fetch(url,{method:method||'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:body?JSON.stringify(body):undefined});
      return r.json().catch(()=>({ok:false,error:'bad response'}));
    }
    function fmtAgo(ms){
      if(!ms)return '';
      const d=Date.now()-ms, m=Math.floor(d/60000);
      if(m<1)return 'just now';
      if(m<60)return m+'m ago';
      const h=Math.floor(m/60);
      if(h<24)return h+'h ago';
      const dd=Math.floor(h/24);
      if(dd<30)return dd+'d ago';
      return new Date(ms).toISOString().slice(0,10);
    }

    /* ---------------- section routing ---------------- */
    function setView(name){
      const v=VIEWS[name]?name:'overview';
      $$('.view').forEach(s=>s.classList.toggle('is-on',s.dataset.view===v));
      $$('.navi').forEach(a=>a.classList.toggle('is-on',a.dataset.view===v));
      const t=VIEWS[v];
      const h=$('#viewTitle'), p=$('#viewSub');
      if(h)h.textContent=t[0];
      if(p)p.textContent=t[1];
      const rail=$('#rail');
      if(rail)rail.classList.remove('is-open');
    }
    $$('.navi').forEach(a=>a.addEventListener('click',e=>{
      e.preventDefault();
      setView(a.dataset.view);
      history.replaceState(null,'','#'+a.dataset.view);
    }));
    window.addEventListener('hashchange',()=>setView((location.hash||'').replace('#','')));
    setView((location.hash||'').replace('#','')||'overview');
    const burger=$('#burger');
    if(burger)burger.addEventListener('click',()=>{const r=$('#rail');if(r)r.classList.toggle('is-open');});

    /* ---------------- lead detail ---------------- */
    let selectedId='';
    function selectRow(id){
      $$('#tbody tr.row').forEach(tr=>tr.classList.toggle('is-sel',tr.dataset.id===id));
      selectedId=id;
    }
    function openLead(id){
      const dr=document.querySelector('#d-'+id);
      if(!dr)return;
      $$('.drawer.open').forEach(d=>{if(d!==dr)d.classList.remove('open');});
      dr.classList.add('open');
      selectRow(id);
      const app=$('#app');
      if(app)app.classList.add('has-detail');
      const detail=$('#detail');
      if(detail){detail.classList.add('has-lead');detail.scrollTop=0;}
    }
    function closeLead(id){
      const dr=id?document.querySelector('#d-'+id):null;
      if(dr)dr.classList.remove('open');
      selectRow('');
      const app=$('#app');
      if(app)app.classList.remove('has-detail');
      const detail=$('#detail');
      if(detail)detail.classList.remove('has-lead');
    }
    function toggleLead(id){
      const dr=document.querySelector('#d-'+id);
      if(!dr)return;
      if(dr.classList.contains('open'))closeLead(id);
      else openLead(id);
    }
    $$('[data-open]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleLead(b.dataset.open);}));
    $$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeLead(b.dataset.close)));
    $$('[data-jump]').forEach(b=>b.addEventListener('click',()=>{setView('leads');openLead(b.dataset.jump);}));
    $$('tr.row').forEach(tr=>tr.addEventListener('click',ev=>{
      if(ev.target&&ev.target.closest('.pick'))return;
      toggleLead(tr.dataset.id);
    }));
    $$('[data-print]').forEach(b=>b.addEventListener('click',()=>window.print()));

    /* ---------------- filters + sorting ---------------- */
    let stageF='all', srcF='', fromF='', toF='', tagF='';
    function visibleRows(){
      return $$('#tbody tr.row').filter(tr=>tr.style.display!=='none');
    }
    function applyFilter(){
      const q=($('#q').value||'').toLowerCase();
      $$('#tbody tr.row').forEach(tr=>{
        const okStage=stageF==='all'||tr.dataset.stage===stageF||(stageF==='hot'&&tr.querySelector('.score.hot'))||(stageF==='dup'&&tr.dataset.dup==='1');
        const okSrc=!srcF||tr.dataset.source===srcF;
        const okTag=!tagF||(tr.dataset.tags||'').split(',').indexOf(tagF)>=0;
        const okQ=!q||(tr.dataset.search||'').includes(q);
        const rowDate=tr.dataset.date||'';
        const okFrom=!fromF||(!!rowDate&&rowDate>=fromF);
        const okTo=!toF||(!!rowDate&&rowDate<=toF);
        tr.style.display=okStage&&okSrc&&okTag&&okQ&&okFrom&&okTo?'':'none';
      });
    }
    let sortKey='new';
    function applySort(){
      const tbody=$('#tbody');
      if(!tbody)return;
      const rows=Array.from(tbody.querySelectorAll('tr.row'));
      const n=(tr,k)=>Number(tr.dataset[k]||0);
      rows.sort((a,b)=>{
        if(sortKey==='oldest')return n(a,'created')-n(b,'created');
        if(sortKey==='score')return n(b,'score')-n(a,'score');
        if(sortKey==='scoreLow')return n(a,'score')-n(b,'score');
        if(sortKey==='name')return (a.dataset.name||'').localeCompare(b.dataset.name||'');
        if(sortKey==='contacted')return n(b,'contacted')-n(a,'contacted');
        return n(b,'created')-n(a,'created');
      });
      rows.forEach(r=>tbody.appendChild(r));
    }
    $$('#chips .chip').forEach(c=>c.addEventListener('click',()=>{
      $$('#chips .chip').forEach(x=>x.classList.remove('on'));
      c.classList.add('on');
      stageF=c.dataset.filter;tagF='';
      $$('#tagChips .chip').forEach(x=>x.classList.remove('on'));
      applyFilter();
    }));
    $$('#tagChips .chip').forEach(c=>c.addEventListener('click',()=>{
      const on=c.classList.contains('on');
      $$('#tagChips .chip').forEach(x=>x.classList.remove('on'));
      $$('#chips .chip').forEach(x=>x.classList.remove('on'));
      stageF='all';
      if(!on){c.classList.add('on');tagF=(c.dataset.filter||'').replace('tag:','').toLowerCase();}
      applyFilter();
    }));
    $$('.pipe').forEach(p=>p.addEventListener('click',()=>{
      $$('#chips .chip').forEach(x=>x.classList.remove('on'));
      const chip=document.querySelector('#chips .chip[data-filter="'+p.dataset.stage+'"]');
      if(chip) chip.classList.add('on');
      stageF=p.dataset.stage;tagF='';
      applyFilter();
      setView('leads');
    }));
    $('#q').addEventListener('input',applyFilter);
    $('#srcFilter').addEventListener('change',e=>{srcF=e.target.value;applyFilter();});
    $('#from').addEventListener('change',e=>{fromF=e.target.value;applyFilter();});
    $('#to').addEventListener('change',e=>{toF=e.target.value;applyFilter();});
    $('#sortSel').addEventListener('change',e=>{sortKey=e.target.value;applySort();});

    /* ---------------- column visibility ---------------- */
    const tw=$('#tablewrap');
    function applyCols(){
      if(!tw)return;
      COLS.forEach(c=>{
        const on=$$('[data-col-toggle="'+c+'"]')[0];
        tw.classList.toggle('col-off-'+c,!(on&&on.checked));
      });
    }
    $$('[data-col-toggle]').forEach(c=>c.addEventListener('change',()=>{
      applyCols();
      try{
        localStorage.setItem('s7f-cols',JSON.stringify(COLS.filter(c=>{const el=$$('[data-col-toggle="'+c+'"]')[0];return el&&el.checked;})));
      }catch(e){}
    }));
    try{
      const saved=JSON.parse(localStorage.getItem('s7f-cols')||'null');
      if(saved&&saved.length){COLS.forEach(c=>{const el=$$('[data-col-toggle="'+c+'"]')[0];if(el)el.checked=saved.indexOf(c)>=0;});}
    }catch(e){}
    applyCols();
    const colBtn=$('#colBtn'), colPop=$('#colPop');
    if(colBtn&&colPop)colBtn.addEventListener('click',e=>{e.stopPropagation();colPop.hidden=!colPop.hidden;});
    document.addEventListener('click',e=>{if(colPop&&!colPop.hidden&&!colPop.contains(e.target)&&e.target!==colBtn)colPop.hidden=true;});

    /* ---------------- bulk ---------------- */
    $$('.pick').forEach(c=>c.addEventListener('change',()=>{
      const n=$$('.pick:checked').length; $('#bulk').hidden=n===0; $('#bulkCount').textContent=n+' selected';
    }));
    $$('[data-bulk]').forEach(b=>b.addEventListener('click',async()=>{
      const ids=$$('.pick:checked').map(c=>Number(c.dataset.id));
      if(!ids.length) return;
      const r=await api('/admin/application/bulk',{ids,stage:b.dataset.bulk});
      toast(r.ok?('Updated '+r.updated+' leads'):'Could not update',r.ok);
      if(r.ok) setTimeout(()=>location.reload(),600);
    }));
    $('#bulkAll').addEventListener('click',async()=>{
      const ids=visibleRows().map(tr=>Number(tr.dataset.id)).filter(Boolean);
      if(!ids.length){toast('Nothing visible to update',false);return;}
      if(!confirm('Mark all '+ids.length+' visible leads as Contacted?'))return;
      let done=0;
      for(let i=0;i<ids.length;i+=100){
        const r=await api('/admin/application/bulk',{ids:ids.slice(i,i+100),stage:'contacted'});
        if(r.ok)done+=r.updated||0;
      }
      toast('Updated '+done+' leads',true);
      if(done)setTimeout(()=>location.reload(),700);
    });
    $('#bulkClear').addEventListener('click',()=>{$$('.pick').forEach(c=>c.checked=false);$('#bulk').hidden=true;$('#bulkCount').textContent='0 selected';});

    /* ---------------- stage + notes + fields ---------------- */
    $$('[data-stage-set]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.target, r=await api('/admin/application/'+id,{stage:b.dataset.stageSet});
      if(r.ok){
        const p=document.querySelector('#d-'+id+' .pill');
        if(p){p.textContent=b.textContent;p.className='pill '+b.dataset.stageSet;}
        const row=document.querySelector('#tbody tr[data-id="'+id+'"]');
        if(row){
          row.dataset.stage=b.dataset.stageSet;
          const cell=row.querySelector('.pill-cell');
          if(cell){cell.textContent=b.textContent;cell.className='pill-cell pill '+b.dataset.stageSet;}
        }
        toast('Stage updated',true);
      }else toast('Could not update',false);
    }));
    $$('[data-save]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.save, body={notes:document.querySelector('#n-'+id).value};
      $$('.edit[data-id="'+id+'"]').forEach(i=>{if(i.dataset.field!=='tags')body[i.dataset.field]=i.value;});
      const r=await api('/admin/application/'+id,body);
      toast(r.ok?'Saved':'Could not save',r.ok);
    }));
    $$('[data-spam]').forEach(b=>b.addEventListener('click',async()=>{
      const next=String(b.dataset.spamState)!=='1';
      const r=await api('/admin/application/'+b.dataset.spam,{spam:next});
      if(r.ok){
        b.dataset.spamState=next?'1':'0';
        b.textContent=next?'Not spam':'Mark spam';
        const row=b.closest('tr'); if(row) row.classList.toggle('spam',next);
      }
      toast(r.ok?(next?'Marked as spam':'No longer marked as spam'):'Could not update',r.ok);
    }));
    $$('[data-del]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('Delete this lead permanently?')) return;
      const r=await api('/admin/application/'+b.dataset.del,null,'DELETE');
      if(r.ok){
        const dr=b.closest('.drawer');
        const id=dr?dr.id.replace('d-',''):null;
        if(dr) dr.remove();
        if(id){const row=document.querySelector('#tbody tr[data-id="'+id+'"]');if(row)row.remove();}
        closeLead();
        toast('Deleted',true);
      }else toast('Could not delete',false);
    }));

    /* ---------------- tags ---------------- */
    $$('[data-addtag]').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.addtag, inp=document.querySelector('.edit[data-id="'+id+'"][data-field="tags"]');
      if(!inp)return;
      const cur=inp.value.split(',').map(x=>x.trim()).filter(Boolean);
      const tag=b.dataset.tag;
      if(cur.map(x=>x.toLowerCase()).indexOf(tag.toLowerCase())<0)cur.push(tag);
      inp.value=cur.join(', ');
    }));
    $$('[data-tagsave]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.tagsave;
      const inp=document.querySelector('.edit[data-id="'+id+'"][data-field="tags"]');
      if(!inp)return;
      const r=await api('/admin/application/'+id,{tags:inp.value});
      if(r.ok){
        const row=document.querySelector('#tbody tr[data-id="'+id+'"]');
        if(row){row.dataset.tags=inp.value.toLowerCase();}
        toast('Tags saved',true);
      }else toast('Could not save tags',false);
    }));

    /* ---------------- follow-up reminders ---------------- */
    function setReminder(id,value,msg){
      return api('/admin/application/'+id,{next_action_at:value}).then(r=>{
        if(r.ok){
          const out=document.querySelector('[data-rmmsg="'+id+'"]');
          if(out)out.textContent=msg;
          const row=document.querySelector('#tbody tr[data-id="'+id+'"]');
          if(row)row.dataset.next=value;
          toast('Follow-up saved',true);
        }else toast('Could not save the follow-up',false);
      });
    }
    $$('[data-remind]').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.remind, days=Number(b.dataset.days||1);
      const d=new Date(Date.now()+days*86400000);
      const val=d.toISOString().slice(0,10)+' 09:00:00';
      setReminder(id,val,'Follow-up set for '+d.toISOString().slice(0,10));
    }));
    $$('[data-rmdate]').forEach(inp=>inp.addEventListener('change',()=>{
      const id=inp.dataset.rmdate;
      if(!inp.value)return;
      setReminder(id,inp.value+' 09:00:00','Follow-up set for '+inp.value);
    }));
    $$('[data-remindclear]').forEach(b=>b.addEventListener('click',()=>{
      setReminder(b.dataset.remindclear,'','No follow-up set');
    }));

    /* ---------------- message templates ---------------- */
    function tplText(id,key){
      const row=document.querySelector('#tbody tr[data-id="'+id+'"]');
      const name=(row&&row.dataset.name)||'';
      const t=(TEMPLATES[key]||'').replace('{name}',name.split(' ')[0]||'there');
      return t;
    }
    $$('[data-tpl]').forEach(sel=>sel.addEventListener('change',()=>{
      const id=sel.dataset.tpl, key=sel.value;
      const out=document.querySelector('[data-tplout="'+id+'"]');
      if(!key){if(out){out.hidden=true;out.textContent='';}return;}
      const txt=tplText(id,key);
      if(out){out.hidden=false;out.textContent=txt;}
      const row=document.querySelector('#tbody tr[data-id="'+id+'"]');
      const wa=document.querySelector('[data-wa="'+id+'"]');
      if(wa&&row)wa.href='https://wa.me/'+String(row.dataset.phone||'').replace(/\\D/g,'')+'?text='+encodeURIComponent(txt);
    }));
    $$('[data-tplcopy]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.tplcopy;
      const sel=document.querySelector('[data-tpl="'+id+'"]');
      if(!sel||!sel.value){toast('Pick a template first',false);return;}
      const txt=tplText(id,sel.value);
      try{
        if(!navigator.clipboard||!navigator.clipboard.writeText) throw new Error('no clipboard api');
        await Promise.race([navigator.clipboard.writeText(txt),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),1500))]);
        toast('Message copied',true);
      }catch(e){
        try{
          const ta=document.createElement('textarea');
          ta.value=txt;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';
          document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);
          const ok=document.execCommand('copy');
          document.body.removeChild(ta);
          toast(ok?'Message copied':'Could not copy',ok);
        }catch(err){toast('Could not copy - the text is on screen',false);}
      }
    }));

    /* ---------------- copy details ---------------- */
    $$('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.copy;
      const row=document.querySelector('#tbody tr[data-id="'+id+'"]');
      if(!row){toast('Could not find that lead',false);return;}
      const d=row.dataset;
      const txt=[
        d.name||'',d.email||'',d.phone||'',
        'Capital: '+(d.capital||'-'),
        'Timeline: '+(d.timeline||'-'),
        'Experience: '+(d.experience||'-'),
        'Interest: '+(d.interest||'-'),
        'Decision: '+(d.decision||'-'),
        'Source: '+(d.sourceLabel||'-'),
        'Owner: '+(d.ownerName||'unassigned'),
        'Stage: '+(d.stage||'new'),
        'Score: '+(d.score||0),
        'Received: '+(d.when||'')
      ].join('\\n');
      toast('Copying...',true);
      try{
        if(!navigator.clipboard||!navigator.clipboard.writeText) throw new Error('no clipboard api');
        await Promise.race([navigator.clipboard.writeText(txt),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),1500))]);
        toast('Details copied',true);
      }catch(e){
        try{
          const ta=document.createElement('textarea');
          ta.value=txt;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';
          document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);
          const ok=document.execCommand('copy');
          document.body.removeChild(ta);
          toast(ok?'Details copied':'Could not copy',ok);
        }catch(err){ toast('Could not copy - the details are on screen',false); }
      }
    }));

    /* ---------------- logout + admins ---------------- */
    const logoutForm=document.getElementById('logoutForm');
    if(logoutForm){
      logoutForm.addEventListener('submit',async(ev)=>{
        ev.preventDefault();
        const r=await api('/admin/logout',null,'POST');
        if(r.ok) location.href='/admin';
      });
    }
    $$('[data-rmadmin]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('Remove this admin user?'))return;
      const r=await api('/admin/admins/'+b.dataset.rmadmin,null,'DELETE');
      if(r.ok){ const li=b.closest('li'); if(li) li.remove(); toast('Removed',true); }
      else toast(r.error||'Could not remove',false);
    }));

    /* ---------------- command palette ---------------- */
    const palette=$('#palette'), omniInput=$('#omniInput'), omniList=$('#omniList');
    let omniHits=[], omniIdx=0;
    function paintOmni(q){
      const ql=(q||'').trim().toLowerCase();
      const rows=$$('#tbody tr.row');
      omniHits=rows.filter(tr=>!ql||(tr.dataset.search||'').includes(ql)).slice(0,8);
      omniIdx=0;
      if(!omniList)return;
      omniList.innerHTML=omniHits.length?omniHits.map((tr,i)=>'<li data-goto="'+tr.dataset.id+'"'+(i===0?' class="is-on"':'')+'><div><b>'+(tr.dataset.name||'Lead')+'</b><span>'+(tr.dataset.email||'')+'</span></div><span class="score '+(tr.dataset.band||'cool')+'">'+(tr.dataset.score||0)+'</span></li>').join(''):'<li class="muted" style="padding:12px 14px">No lead matches that.</li>';
      omniList.querySelectorAll('[data-goto]').forEach(li=>li.addEventListener('click',()=>{
        setView('leads');
        openLead(li.dataset.goto);
        closePalette();
      }));
    }
    function openPalette(){
      if(!palette)return;
      palette.classList.add('is-on');
      if(omniInput){omniInput.value='';omniInput.focus();}
      paintOmni('');
    }
    function closePalette(){
      if(palette)palette.classList.remove('is-on');
    }
    const omniBtn=$('#omniBtn');
    if(omniBtn)omniBtn.addEventListener('click',openPalette);
    if(palette)palette.addEventListener('click',e=>{if(e.target===palette)closePalette();});
    if(omniInput)omniInput.addEventListener('input',e=>paintOmni(e.target.value));

    /* ---------------- keyboard shortcuts sheet ---------------- */
    const sheet=$('#shortcuts');
    function openSheet(){if(sheet)sheet.classList.add('is-on');}
    function closeSheet(){if(sheet)sheet.classList.remove('is-on');}
    const keysBtn=$('#keysBtn');
    if(keysBtn)keysBtn.addEventListener('click',openSheet);
    const sheetClose=$('#sheetClose');
    if(sheetClose)sheetClose.addEventListener('click',closeSheet);
    if(sheet)sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet();});

    /* ---------------- keyboard navigation ---------------- */
    function moveSelection(delta){
      const vis=visibleRows();
      if(!vis.length)return;
      let i=vis.findIndex(tr=>tr.dataset.id===selectedId);
      i=i<0?(delta>0?0:vis.length-1):Math.max(0,Math.min(vis.length-1,i+delta));
      selectedId=vis[i].dataset.id;
      vis.forEach(tr=>tr.classList.toggle('is-sel',tr.dataset.id===selectedId));
      vis[i].scrollIntoView({block:'nearest'});
    }
    document.addEventListener('keydown',e=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      const typing=tag==='input'||tag==='textarea'||tag==='select'||(e.target&&e.target.isContentEditable);
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return;}
      if(typing)return;
      if(e.key==='Escape'){closePalette();closeSheet();closeLead();return;}
      if(e.key==='?'){e.preventDefault();sheet&&sheet.classList.contains('is-on')?closeSheet():openSheet();return;}
      if(e.key==='/'){e.preventDefault();setView('leads');const q=$('#q');if(q)q.focus();return;}
      if(e.key==='j'||e.key==='J'){e.preventDefault();moveSelection(1);return;}
      if(e.key==='k'||e.key==='K'){e.preventDefault();moveSelection(-1);return;}
      if(e.key==='Enter'){
        if(palette&&palette.classList.contains('is-on')){
          e.preventDefault();
          const hit=omniHits[omniIdx];
          if(hit){setView('leads');openLead(hit.dataset.id);closePalette();}
          return;
        }
        if(selectedId){e.preventDefault();openLead(selectedId);}
        return;
      }
      if(palette&&palette.classList.contains('is-on')&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
        e.preventDefault();
        if(!omniHits.length)return;
        omniIdx=(omniIdx+(e.key==='ArrowDown'?1:-1)+omniHits.length)%omniHits.length;
        omniList.querySelectorAll('[data-goto]').forEach((li,i)=>li.classList.toggle('is-on',i===omniIdx));
        const on=omniList.querySelector('.is-on');
        if(on)on.scrollIntoView({block:'nearest'});
      }
    });

    /* ---------------- live: watch for new leads ---------------- */
    let liveOn=false, liveTimer=null, liveBase=Number(BASE_LEADS)||0;
    const liveBtn=$('#liveBtn'), newPill=$('#newPill');
    async function pollLive(){
      try{
        const r=await fetch('/api/status',{headers:{'Accept':'application/json'}});
        const j=await r.json();
        if(j&&typeof j.leads==='number'){
          if(j.leads>liveBase){
            const d=j.leads-liveBase;
            if(newPill){newPill.hidden=false;newPill.querySelector('b').textContent=d+' new lead'+(d===1?'':'s');}
          }
        }
      }catch(e){}
    }
    if(liveBtn)liveBtn.addEventListener('click',()=>{
      liveOn=!liveOn;
      liveBtn.classList.toggle('is-on',liveOn);
      liveBtn.setAttribute('aria-pressed',liveOn?'true':'false');
      if(liveOn){liveTimer=setInterval(pollLive,45000);pollLive();}
      else if(liveTimer){clearInterval(liveTimer);liveTimer=null;}
    });
    const newReload=$('#newReload');
    if(newReload)newReload.addEventListener('click',()=>location.reload());

    /* ---------------- relative times keep ticking ---------------- */
    setInterval(()=>{
      $$('[data-when-cell]').forEach(el=>{
        const v=Number(el.dataset.whenCell||0);
        if(!v)return;
        const sla=el.querySelector('.sla');
        el.textContent=fmtAgo(v);
        if(sla)el.appendChild(sla);
      });
    },30000);

    /* ---------------- activity log filter + more ---------------- */
    let actLimit=10;
    const actList=$('#actList');
    function paintAct(){
      if(!actList)return;
      const items=Array.from(actList.querySelectorAll('li'));
      let shown=0;
      items.forEach(li=>{
        const kind=li.dataset.act;
        const kindOk=actKind==='all'||kind===actKind;
        if(kindOk&&shown<actLimit){li.style.display='';shown++;}
        else li.style.display='none';
      });
      const more=$('#actMore');
      if(more)more.textContent=shown>=items.length?'Everything shown':'Show more';
    }
    let actKind='all';
    $$('#actChips .chip').forEach(c=>c.addEventListener('click',()=>{
      $$('#actChips .chip').forEach(x=>x.classList.remove('on'));
      c.classList.add('on');
      actKind=c.dataset.actFilter;
      paintAct();
    }));
    const actMore=$('#actMore');
    if(actMore)actMore.addEventListener('click',()=>{
      if(actLimit>=40){actLimit=10;}else{actLimit=actLimit+15;}
      paintAct();
    });
    paintAct();

    /* ---------------- dark mode ---------------- */
    const themeBtn=$('#themeBtn');
    function setTheme(dark){
      const app=$('#app');
      if(app)app.classList.toggle('is-dark',dark);
      document.body.style.background=dark?'#14110D':'';
      if(themeBtn)themeBtn.textContent=dark?'Light mode':'Dark mode';
      try{localStorage.setItem('s7f-theme',dark?'dark':'light');}catch(e){}
    }
    let dark=false;
    try{dark=localStorage.getItem('s7f-theme')==='dark';}catch(e){}
    setTheme(dark);
    if(themeBtn)themeBtn.addEventListener('click',()=>{dark=!dark;setTheme(dark);});

    /* ---------------- site copy + settings + keys ---------------- */
    $('#saveContent').addEventListener('click',async()=>{
      const r=await api('/admin/content',{headline:$('#c-headline').value,subheadline:$('#c-subheadline').value,cta_label:$('#c-cta_label').value,specialties:$('#c-specialties').value,cost_answer:$('#c-cost_answer')?$('#c-cost_answer').value:''});
      toast(r.ok?'Copy saved - refresh the funnel to see it':'Could not save copy',r.ok,$('#contentMsg'));
    });
    $('#saveSettings').addEventListener('click',async()=>{
      const r=await api('/admin/settings',{retention_days:$('#set-retention').value});
      toast(r.ok?'Settings saved':'Could not save',r.ok,$('#setMsg'));
    });
    $('#previewDigest').addEventListener('click',async()=>{
      const r=await api('/admin/digest',null,'GET');
      const pre=$('#digestOut'); pre.hidden=false; pre.textContent=(r.digest&&r.digest.text)||'No data';
    });
    $('#makeKey').addEventListener('click',async()=>{
      const r=await api('/admin/api-key',{name:$('#keyName').value||'integration'});
      if(r.ok){const pre=$('#keyOut');pre.hidden=false;pre.textContent='Copy this key now (it will not be shown again):\\n'+r.key;}else toast('Could not create key',false);
      loadKeys();
    });
    $('#addAdmin').addEventListener('click',async()=>{
      const r=await api('/admin/admins',{email:$('#newAdminEmail').value,password:$('#newAdminPw').value});
      toast(r.ok?'Admin added':'Could not add admin',r.ok,$('#adminMsg'));
    });
    $('#addHook').addEventListener('click',async()=>{
      const r=await api('/admin/webhooks',{url:$('#hookUrl').value});
      toast(r.ok?'Webhook added':'Could not add webhook',r.ok);
      loadHooks();
    });
    $('#chPw').addEventListener('click',async()=>{
      const r=await api('/admin/password',{current:$('#pwCur').value,next:$('#pwNew').value});
      toast(r.ok?'Password changed':(r.error||'Could not change password'),r.ok,$('#pwMsg'));
      if(r.ok){$('#pwCur').value='';$('#pwNew').value='';}
    });
    async function loadKeys(){
      const r=await api('/admin/api-key',null,'GET');
      $('#keyList').innerHTML=(r.keys||[]).map(k=>'<li><b>'+k.prefix+'</b> '+k.name+' <span class="muted">'+k.created_at+'</span> <button class="btn sm ghost" data-revkey="'+k.id+'">Revoke</button></li>').join('')||'<li class="muted">No keys yet.</li>';
      $$('[data-revkey]').forEach(b=>b.addEventListener('click',async()=>{await api('/admin/api-key/'+b.dataset.revkey,null,'DELETE');loadKeys();}));
    }
    async function loadHooks(){
      const r=await api('/admin/webhooks',null,'GET');
      const cfg=(r.deliveries||[]).filter(x=>x.status==='configured');
      $('#hookList').innerHTML=cfg.map(k=>'<li><b>'+k.url+'</b> <span class="muted">'+k.event+'</span> <button class="btn sm ghost" data-rmhook="'+k.id+'">Remove</button></li>').join('')||'<li class="muted">No webhooks yet.</li>';
      $$('[data-rmhook]').forEach(b=>b.addEventListener('click',async()=>{await api('/admin/webhooks/'+b.dataset.rmhook,null,'DELETE');loadHooks();}));
    }
    async function loadSessions(){
      const r=await api('/admin/sessions',null,'GET');
      $('#sessList').innerHTML=(r.sessions||[]).map(s=>'<li><b>'+(s.revoked?'revoked ':'')+s.email+'</b> <span class="muted">'+s.created_at+'</span> <button class="btn sm ghost" data-revsess="'+s.id+'">Revoke</button></li>').join('')||'<li class="muted">No sessions.</li>';
      $$('[data-revsess]').forEach(b=>b.addEventListener('click',async()=>{await api('/admin/sessions/revoke',{sid:b.dataset.revsess});loadSessions();}));
    }
    loadKeys(); loadHooks(); loadSessions();
    </script>`;
}

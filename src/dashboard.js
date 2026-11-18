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
function when(iso) {
  if (!iso) return '';
  const t = Date.parse(String(iso).replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return String(iso);
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
      return `<tr class="row${dup}${spam}" data-id="${esc(r.id)}" data-stage="${esc(st)}" data-source="${esc(String(src).toLowerCase())}"` +
        ` data-owner="${esc(String(r.owner || '').toLowerCase())}" data-date="${esc(String(r.created_at || '').slice(0, 10))}"` +
        ` data-name="${esc(r.name || '')}" data-email="${esc(r.email || '')}" data-phone="${esc(r.phone || '')}"` +
        ` data-capital="${esc(r.capital || '')}" data-timeline="${esc(r.timeline || '')}" data-experience="${esc(r.experience || '')}"` +
        ` data-interest="${esc(r.interest || '')}" data-decision="${esc(r.decision || '')}" data-owner-name="${esc(r.owner || '')}"` +
        ` data-source-label="${esc(src)}" data-score="${esc(r.score || 0)}" data-band="${esc(sc)}" data-when="${esc(when(r.created_at))}"` +
        ` data-search="${esc([r.name, r.email, r.phone, r.capital, r.interest, r.utm_campaign, r.referrer, r.owner].join(' ').toLowerCase())}">` +
        `<td><input type="checkbox" class="pick" data-id="${esc(r.id)}" aria-label="Select lead ${esc(r.id)}"></td>` +
        `<td class="mono hide" style="white-space:nowrap;color:var(--muted)">${esc(when(r.created_at))}</td>` +
        `<td class="who"><span class="who__av ${sc}">${esc(initials(r.name, r.email))}</span><div>` +
        `<b>${esc(r.name || '-')}${r.duplicate_of ? ' <span class="tag">dup</span>' : ''}${r.flagged ? ' <span class="tag tag--warn">unverified</span>' : ''}${r.spam ? ' <span class="tag tag--bad">spam</span>' : ''}</b>` +
        `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a></div></td>` +
        `<td class="col-score"><span class="score ${sc}">${esc(r.score || 0)}</span></td>` +
        `<td class="hide">${esc(r.capital)}</td>` +
        `<td class="pill-cell"><span class="pill ${esc(st)}">${esc(STAGE_LABELS[st] || st)}</span></td>` +
        `<td class="hide">${esc(src)}</td>` +
        `<td class="col-open"><button class="btn sm ghost" data-open="${esc(r.id)}">Open</button></td></tr>`;
    })
    .join('');

  const drawers = rows
    .map((r) => {
      const st = r.stage || 'new';
      const phone = waNumber(r.phone);
      return `<div class="drawer" id="d-${esc(r.id)}">
      <div class="drawer__head">
        <div><h3>${esc(r.name || 'Applicant')} <span class="score ${band(r.score)}">${esc(r.score || 0)}</span></h3>
        <p class="muted" style="margin:4px 0 0;font-size:.82rem">${esc(when(r.created_at))} · ${esc(r.source_label || r.source || 'funnel')} · ${esc(r.device || '')} ${esc(r.country || '')}</p></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="pill ${esc(st)}">${esc(STAGE_LABELS[st] || st)}</span>
          <button class="drawer__x" data-close="${esc(r.id)}" aria-label="Close lead">×</button>
        </div>
      </div>
      <div class="rowact" style="margin:0 0 16px">
        <a class="btn sm gold" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Skip to 7 Figures')}">Email</a>
        <a class="btn sm ghost" href="tel:${esc(r.phone)}">Call</a>
        <a class="btn sm ghost" href="https://wa.me/${esc(phone)}?text=${encodeURIComponent('Hi ' + (r.name || '') + ', thanks for your Skip to 7 Figures application. ')}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn sm ghost" data-copy="${esc(r.id)}">Copy details</button>
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

  const srcMax = Math.max(1, ...(data.sources || []).map((x) => num(x.n)));
  const sources = (data.sources || [])
    .map((x) => `<div class="srcrow"><span>${esc(x.src || 'direct')}</span>` +
      `<span class="srcrow__t"><i style="width:${Math.max(3, Math.round((num(x.n) / srcMax) * 100))}%"></i></span>` +
      `<span class="srcrow__n">${esc(x.n)}</span></div>`)
    .join('') || '<p class="muted" style="font-size:.85rem">No traffic data yet.</p>';

  const activity = (data.activity || [])
    .map((a) => `<li><b>${esc(a.actor || 'system')}</b> ${esc(a.action)} ${a.entity_id ? '#' + esc(a.entity_id) : ''} <span class="muted">${esc(when(a.created_at))}${a.detail ? ' · ' + esc(a.detail) : ''}</span></li>`)
    .join('') || '<li class="muted">No activity yet.</li>';

  const errors = (data.errors || [])
    .map((e) => `<li><b>${esc(when(e.created_at))}</b> ${esc(e.message)}</li>`)
    .join('') || '<li class="muted">No errors recorded.</li>';

  const admins = (data.admins || [])
    .map((a) => `<li><b>${esc(a.email)}</b> <span class="muted">last ${esc(a.last_login_at ? when(a.last_login_at) : 'never')}</span> <button class="btn sm ghost" data-rmadmin="${esc(a.id)}">Remove</button></li>`)
    .join('');

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
      <form method="post" action="/admin/logout" id="logoutForm"><button class="rail__link" type="submit">Sign out</button></form>
    </div>
  </aside>

  <div class="main">
    <header class="bar">
      <button class="bar__burger" id="burger" aria-label="Open menu">☰</button>
      <div class="bar__title"><h1 id="viewTitle">Overview</h1><p id="viewSub">Live pulse of the funnel</p></div>
      <div class="bar__actions">
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
              <div><h2>Where they came from</h2><p>UTM source, then referrer, then direct.</p></div>
            </div>
            ${sources}
          </section>
        </div>
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
              </div>
              <input class="search" id="q" type="search" placeholder="Search leads...">
              <select id="srcFilter" class="search"><option value="">All sources</option>${(data.sources || []).map((x) => `<option value="${esc(String(x.src || 'direct').toLowerCase())}">${esc(x.src || 'direct')}</option>`).join('')}</select>
              <input class="search" id="from" type="date" title="From date">
              <input class="search" id="to" type="date" title="To date">
            </div>
            <div class="bulk" id="bulk" hidden>
              <span id="bulkCount">0 selected</span>
              ${stages.map((x) => `<button class="btn sm ghost" data-bulk="${x}">Mark ${esc(STAGE_LABELS[x])}</button>`).join('')}
              <button class="btn sm ghost" id="bulkClear">Clear</button>
            </div>
            ${(data.totalRows || rows.length) > rows.length ? `<p class="muted" style="margin:0 0 14px;font-size:.84rem">Showing the ${esc(rows.length)} most recent of ${esc(data.totalRows)}. <a href="/admin/dashboard?limit=200" style="color:var(--gold-dp)">Show 200</a> · <a href="/admin/dashboard?limit=500" style="color:var(--gold-dp)">Show all</a></p>` : ''}
            ${rows.length ? `<div class="tablewrap"><table><thead><tr>
              <th style="width:28px"></th><th class="hide">When</th><th>Applicant</th><th class="col-score">Score</th><th class="hide">Capital</th><th>Stage</th><th class="hide">Source</th><th class="col-open"></th>
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
            <ul class="mini">${activity}</ul>
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
    </div>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
</div>
    <script>
    const CSRF=${JSON.stringify(csrf)};
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
    /* ---------------- section routing ---------------- */
    const VIEWS=${JSON.stringify(VIEWS)};
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
    function selectRow(id){
      $$('#tbody tr.row').forEach(tr=>tr.classList.toggle('is-sel',tr.dataset.id===id));
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

    /* ---------------- command palette ---------------- */
    const palette=$('#palette'), omniInput=$('#omniInput'), omniList=$('#omniList');
    function paintOmni(q){
      const ql=(q||'').trim().toLowerCase();
      const rows=$$('#tbody tr.row');
      const hits=rows.filter(tr=>!ql||(tr.dataset.search||'').includes(ql)).slice(0,8);
      if(!omniList)return;
      omniList.innerHTML=hits.length?hits.map(tr=>'<li data-goto="'+tr.dataset.id+'"><div><b>'+(tr.dataset.name||'Lead')+'</b><span>'+(tr.dataset.email||'')+'</span></div><span class="score '+(tr.dataset.band||'cool')+'">'+(tr.dataset.score||0)+'</span></li>').join(''):'<li class="muted" style="padding:12px 14px">No lead matches that.</li>';
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
    document.addEventListener('keydown',e=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return;}
      if(e.key==='Escape'){closePalette();closeLead();}
    });

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
      $$('.edit[data-id="'+id+'"]').forEach(i=>{body[i.dataset.field]=i.value;});
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
        await Promise.race([
          navigator.clipboard.writeText(txt),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),1500))
        ]);
        toast('Details copied',true);
      }catch(e){
        try{
          const ta=document.createElement('textarea');
          ta.value=txt;
          ta.setAttribute('readonly','');
          ta.style.position='fixed';
          ta.style.opacity='0';
          document.body.appendChild(ta);
          ta.select();
          ta.setSelectionRange(0,ta.value.length);
          const ok=document.execCommand('copy');
          document.body.removeChild(ta);
          toast(ok?'Details copied':'Could not copy',ok);
        }catch(err){ toast('Could not copy - the details are on screen',false); }
      }
    }));
    /* the logout form is a plain POST, so the CSRF token goes on as a header */
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
    /* filters */
    let stageF='all', srcF='', fromF='', toF='';
    function applyFilter(){
      const q=($('#q').value||'').toLowerCase();
      $$('#tbody tr.row').forEach(tr=>{
        const okStage=stageF==='all'||tr.dataset.stage===stageF||(stageF==='hot'&&tr.querySelector('.score.hot'));
        const okSrc=!srcF||tr.dataset.source===srcF;
        const okQ=!q||(tr.dataset.search||'').includes(q);
        const rowDate=tr.dataset.date||'';
        const okFrom=!fromF||(!!rowDate&&rowDate>=fromF);
        const okTo=!toF||(!!rowDate&&rowDate<=toF);
        tr.style.display=okStage&&okSrc&&okQ&&okFrom&&okTo?'':'none';
      });
    }
    $$('#chips .chip').forEach(c=>c.addEventListener('click',()=>{$$('#chips .chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');stageF=c.dataset.filter;applyFilter();}));
    /* the pipeline bars are buttons too - they filter the same list */
    $$('.pipe').forEach(p=>p.addEventListener('click',()=>{
      $$('#chips .chip').forEach(x=>x.classList.remove('on'));
      const chip=document.querySelector('#chips .chip[data-filter="'+p.dataset.stage+'"]');
      if(chip) chip.classList.add('on');
      stageF=p.dataset.stage;
      applyFilter();
      setView('leads');
    }));
    $('#q').addEventListener('input',applyFilter);
    $('#srcFilter').addEventListener('change',e=>{srcF=e.target.value;applyFilter();});
    $('#from').addEventListener('change',e=>{fromF=e.target.value;applyFilter();});
    $('#to').addEventListener('change',e=>{toF=e.target.value;applyFilter();});
    /* bulk */
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
    $('#bulkClear').addEventListener('click',()=>{$$('.pick').forEach(c=>c.checked=false);$('#bulk').hidden=true;$('#bulkCount').textContent='0 selected';});
    /* copy */
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

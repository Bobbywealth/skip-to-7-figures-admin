/**
 * Dashboard markup for the Skip to 7 Figures admin (Cloudflare Worker + D1).
 * Server-rendered; interactive bits are small inline scripts.
 */

const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed: 'Closed',
  lost: 'Lost',
};

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function band(score) {
  const s = Number(score || 0);
  return s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'cool';
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

export function dashboardPage(data, csrf) {
  const s = data.stats || {};
  const v = data.views || {};
  const f = data.funnel || {};
  const rows = data.rows || [];
  const daily = data.daily || [];
  const stages = ['new', 'contacted', 'qualified', 'closed', 'lost'];
  const stageCount = (st) => Number(s[st === 'new' ? 'fresh' : st] || 0);
  const maxDaily = Math.max(1, ...daily.map((d) => Math.max(Number(d.views || 0), Number(d.leads || 0))));
  const views = Number(v.total || 0);
  const starts = Number(f.starts || 0);
  const completes = Number(f.completes || 0);
  const conv = views > 0 ? ((completes / views) * 100).toFixed(1) : '0.0';
  const funnelMax = Math.max(views, starts, completes, 1);

  const stat = (n, label, tone) =>
    `<div class="card stat${tone ? ' ' + tone : ''}"><b>${esc(n ?? 0)}</b><span>${esc(label)}</span></div>`;

  const pipelineBars = stages
    .map((st) => {
      const n = stageCount(st);
      const pct = Math.max(2, Math.round((n / Math.max(1, Number(s.total || 0))) * 100));
      return `<button class="pipe" data-stage="${st}"><span class="pipe__n">${esc(n)}</span><span class="pipe__bar"><i style="width:${pct}%;background:var(--c-${st})"></i></span><span class="pipe__l">${esc(STAGE_LABELS[st])}</span></button>`;
    })
    .join('');

  const dailyBars = daily
    .map((d) => {
      const hv = Math.round((Number(d.views || 0) / maxDaily) * 100);
      const hl = Math.round((Number(d.leads || 0) / maxDaily) * 100);
      return `<div class="day" title="${esc(d.day)}: ${esc(d.views)} views, ${esc(d.leads)} leads">
        <span class="day__v" style="height:${Math.max(2, hv)}%"></span>
        <span class="day__l" style="height:${Math.max(2, hl)}%"></span>
        <em>${esc(String(d.day || '').slice(8))}</em></div>`;
    })
    .join('');

  const tableRows = rows
    .map((r) => {
      const dup = r.duplicate_of ? ' dup' : '';
      const spam = r.spam ? ' spam' : '';
      return `<tr class="row${dup}${spam}" data-id="${esc(r.id)}" data-stage="${esc(r.stage || 'new')}" data-source="${esc((r.source_label || r.utm_source || 'direct').toLowerCase())}" data-owner="${esc((r.owner || '').toLowerCase())}" data-date="${esc(String(r.created_at || '').slice(0,10))}" data-search="${esc([r.name, r.email, r.phone, r.capital, r.interest, r.utm_campaign, r.referrer].join(' ').toLowerCase())}">
        <td><input type="checkbox" class="pick" data-id="${esc(r.id)}" aria-label="Select lead ${esc(r.id)}"></td>
        <td class="mono hide" style="white-space:nowrap;color:var(--muted)">${esc(when(r.created_at))}</td>
        <td class="who"><b>${esc(r.name || '—')}${r.duplicate_of ? ' <span class="tag">dup</span>' : ''}${r.spam ? ' <span class="tag tag--bad">spam</span>' : ''}</b>
          <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>
          <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></td>
        <td><span class="score ${band(r.score)}">${esc(r.score || 0)}</span></td>
        <td class="hide">${esc(r.capital)}</td>
        <td class="pill-cell"><span class="pill ${esc(r.stage || 'new')}">${esc(STAGE_LABELS[r.stage || 'new'] || r.stage)}</span></td>
        <td class="hide">${esc(r.utm_source || (r.referrer ? 'referral' : 'direct'))}</td>
        <td><button class="btn sm ghost" data-open="${esc(r.id)}">Open</button></td>
      </tr>`;
    })
    .join('');

  const drawers = rows
    .map((r) => {
      const st = r.stage || 'new';
      return `<div class="drawer" id="d-${esc(r.id)}">
      <div class="drawer__head">
        <div><h3 style="font-size:1.3rem">${esc(r.name || 'Applicant')} <span class="score ${band(r.score)}">${esc(r.score || 0)}</span></h3>
        <p class="muted" style="margin:2px 0 0;font-size:.86rem">${esc(when(r.created_at))} · ${esc(r.source || 'funnel')} · ${esc(r.device || '')} ${esc(r.country || '')}</p></div>
        <span class="pill ${esc(st)}">${esc(STAGE_LABELS[st] || st)}</span>
      </div>
      <dl class="kv">
        <dt>Email</dt><dd><a href="mailto:${esc(r.email)}" style="color:#9A7038">${esc(r.email)}</a></dd>
        <dt>Phone</dt><dd><a href="tel:${esc(r.phone)}" style="color:#9A7038">${esc(r.phone)}</a> · <a href="https://wa.me/${esc((r.phone || '').replace(/\D/g, ''))}" target="_blank" rel="noopener" style="color:#9A7038">WhatsApp ↗</a></dd>
        <dt>Capital</dt><dd>${esc(r.capital || '—')}</dd>
        <dt>Timeline</dt><dd>${esc(r.timeline || '—')}</dd>
        <dt>Experience</dt><dd>${esc(r.experience || '—')}</dd>
        <dt>Interest</dt><dd>${esc(r.interest || '—')}</dd>
        <dt>Decision</dt><dd>${esc(r.decision || '—')}</dd>
        <dt>Source</dt><dd>${esc(r.utm_source || 'direct')} ${esc(r.utm_campaign ? '· ' + r.utm_campaign : '')} ${esc(r.referrer ? '· ' + r.referrer : '')}</dd>
        <dt>Owner</dt><dd>${esc(r.owner || 'unassigned')}</dd>
        <dt>Notes</dt><dd>${esc(r.notes_updated_at ? when(r.notes_updated_at) : 'never')}${r.notes_author ? ' by ' + esc(r.notes_author) : ''}</dd>
      </dl>
      <div class="grid2">
        <div><label>Name</label><input class="edit" data-field="name" data-id="${esc(r.id)}" value="${esc(r.name || '')}"></div>
        <div><label>Email</label><input class="edit" data-field="email" data-id="${esc(r.id)}" value="${esc(r.email || '')}"></div>
        <div><label>Phone</label><input class="edit" data-field="phone" data-id="${esc(r.id)}" value="${esc(r.phone || '')}"></div>
        <div><label>Owner</label><input class="edit" data-field="owner" data-id="${esc(r.id)}" value="${esc(r.owner || '')}" placeholder="unassigned"></div>
      </div>
      <div style="margin-top:16px"><label>Notes</label><textarea class="notes" id="n-${esc(r.id)}" placeholder="Notes, outcome, next step…">${esc(r.notes || '')}</textarea></div>
      <div class="rowact">
        ${stages.map((x) => `<button class="btn sm${x === st ? ' gold' : ' ghost'}" data-stage-set="${esc(x)}" data-target="${esc(r.id)}">${esc(STAGE_LABELS[x])}</button>`).join('')}
        <button class="btn sm gold" data-save="${esc(r.id)}">Save</button>
        <button class="btn sm ghost" data-spam="${esc(r.id)}" data-spam-state="${r.spam ? 1 : 0}">${r.spam ? 'Not spam' : 'Mark spam'}</button>
        <button class="btn sm ghost" data-del="${esc(r.id)}">Delete</button>
        <a class="btn sm ghost" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Skip to 7 Figures')}">Email</a>
          <a class="btn sm gold" href="https://wa.me/${esc((r.phone||'').replace(/\D/g,''))}?text=${encodeURIComponent('Hi '+esc(r.name||'')+', thanks for your Skip to 7 Figures application. ')}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn sm ghost" data-copy="${esc(r.id)}">Copy details</button>
      </div>
    </div>`;
    })
    .join('');

  const reminders = (data.reminders || [])
    .map((r) => `<li><b>${esc(r.name || r.email)}</b> <span class="muted">score ${esc(r.score)} · ${esc(STAGE_LABELS[r.stage] || r.stage)} · ${esc(when(r.last_contacted_at || r.created_at))}</span></li>`)
    .join('') || '<li class="muted">Nothing waiting. You are caught up.</li>';

  const sources = (data.sources || [])
    .map((x) => `<li><span>${esc(x.src || 'direct')}</span><b>${esc(x.n)}</b></li>`)
    .join('') || '<li class="muted">No traffic data yet.</li>';

  const activity = (data.activity || [])
    .map((a) => `<li><b>${esc(a.actor || 'system')}</b> ${esc(a.action)} ${a.entity_id ? '#' + esc(a.entity_id) : ''} <span class="muted">${esc(when(a.created_at))}${a.detail ? ' · ' + esc(a.detail) : ''}</span></li>`)
    .join('') || '<li class="muted">No activity yet.</li>';

  const errors = (data.errors || [])
    .map((e) => `<li><b>${esc(when(e.created_at))}</b> ${esc(e.message)}</li>`)
    .join('') || '<li class="muted">No errors recorded.</li>';

  const admins = (data.admins || [])
    .map((a) => `<li><b>${esc(a.email)}</b> <span class="muted">last ${esc(a.last_login_at ? when(a.last_login_at) : 'never')}</span> <button class="btn sm ghost" data-rmadmin="${esc(a.id)}">Remove</button></li>`)
    .join('');

  const settings = data.settings || {};

  return `<div class="top"><div class="top__in">
      <div class="top__brand"><img src="https://skip-to-7-figures.onrender.com/favicon.png" alt=""><span>Skip to 7 Figures</span></div>
      <nav>
        <a href="https://skip-to-7-figures.onrender.com/" target="_blank" rel="noopener">View site ↗</a>
        <a href="/admin/export.csv">Export CSV</a>
        <form method="post" action="/admin/logout" style="display:inline"><button type="submit">Sign out</button></form>
      </nav>
    </div></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <div class="wrap">
      <h1 class="page">Dashboard</h1>
      <p class="page__sub">Applications, pipeline and traffic for the Skip to 7 Figures funnel.</p>

      <div class="stats">
        ${stat(s.total, 'Applications')}
        ${stat(s.fresh, 'New')}
        ${stat(s.hot, 'Hot leads', 'stat--hot')}
        ${stat(s.qualified, 'Qualified')}
        ${stat(s.week, 'Last 7 days')}
        ${stat(v.total, 'Page views')}
        ${stat(conv + '%', 'View → apply')}
      </div>

      <div class="twocol">
        <div class="card panel">
          <h2>Funnel</h2>
          <p class="hint">Views → started the form → completed.</p>
          ${bar('Views', views, '#C99B54', funnelMax)}
          ${bar('Started form', starts, '#8A6420', funnelMax)}
          ${bar('Completed', completes, '#1F5C3A', funnelMax)}
        </div>
        <div class="card panel">
          <h2>Pipeline</h2>
          <p class="hint">Click a stage to filter the list.</p>
          <div class="pipes">${pipelineBars}</div>
        </div>
      </div>

      <div class="twocol">
        <div class="card panel">
          <h2>Needs attention</h2>
          <p class="hint">Waiting on you, duplicates, spam.</p>
          <ul class="mini">${reminders}</ul>
          <p class="muted" style="margin:12px 0 0;font-size:.84rem">${esc(s.dupes || 0)} duplicate · ${esc(s.spam || 0)} spam</p>
        </div>
        <div class="card panel">
          <h2>Where they came from</h2>
          <p class="hint">UTM source, then referrer, then direct.</p>
          <ul class="mini">${sources}</ul>
        </div>
      </div>

      ${daily.length ? `<div class="card panel"><h2>Last 14 days</h2><p class="hint">Views (gold) and applications (green).</p><div class="chart">${dailyBars}</div></div>` : ''}

      <div class="card panel">
        <h2>Applications</h2>
        <p class="hint">Newest first. Click a row for the full answer set, notes and stage.</p>
        <div class="toolbar">
          <div class="chips" id="chips">
            <button class="chip on" data-filter="all">All</button>
            ${stages.map((x) => `<button class="chip" data-filter="${x}">${esc(STAGE_LABELS[x])}</button>`).join('')}
            <button class="chip" data-filter="hot">Hot</button>
          </div>
          <input class="search" id="q" type="search" placeholder="Search name, email, phone, answer…">
          <select id="srcFilter" class="search"><option value="">All sources</option>${(data.sources || []).map((x) => `<option value="${esc((x.src || 'direct').toLowerCase())}">${esc(x.src || 'direct')}</option>`).join('')}</select>
          <input class="search" id="from" type="date" title="From date">
          <input class="search" id="to" type="date" title="To date">
        </div>
        <div class="bulk" id="bulk" hidden>
          <span id="bulkCount">0 selected</span>
          ${stages.map((x) => `<button class="btn sm ghost" data-bulk="${x}">Mark ${esc(STAGE_LABELS[x])}</button>`).join('')}
          <button class="btn sm ghost" id="bulkClear">Clear</button>
        </div>
        ${(data.totalRows||rows.length) > rows.length ? `<p class="hint" style="margin:0 0 12px">Showing the ${rows.length} most recent of ${data.totalRows}. <a href="/admin/dashboard?limit=200">Show 200</a> · <a href="/admin/dashboard?limit=500">Show all</a></p>` : ''}
        ${rows.length ? `<table><thead><tr>
          <th style="width:28px"></th><th class="hide">When</th><th>Applicant</th><th>Score</th><th class="hide">Capital</th><th>Stage</th><th class="hide">Source</th><th></th>
        </tr></thead><tbody id="tbody">${tableRows}</tbody></table>` : `<div class="empty"><b>No applications yet</b>When someone completes the form on the funnel it will land here.</div>`}
      </div>

      <div class="twocol">
        <div class="card panel">
          <h2>Site copy</h2>
          <p class="hint">Override the funnel wording. Leave blank to keep the original.</p>
          <div class="grid2">
            <div><label>Headline</label><input id="c-headline" value="${esc(data.content.headline || '')}" placeholder="Launch your own beauty brand."></div>
            <div><label>Sub-headline</label><input id="c-subheadline" value="${esc(data.content.subheadline || '')}"></div>
            <div><label>CTA label</label><input id="c-cta_label" value="${esc(data.content.cta_label || '')}" placeholder="Start your application ↗"></div>
            <div><label>Specialties</label><input id="c-specialties" value="${esc(data.content.specialties || '')}" placeholder="Skincare, Hair growth…"></div>
          </div>
          <div class="rowact"><button class="btn gold" id="saveContent">Save copy</button><span id="contentMsg" class="muted" style="font-size:.85rem"></span></div>
        </div>
        <div class="card panel">
          <h2>Activity</h2>
          <p class="hint">Every change, newest first.</p>
          <ul class="mini">${activity}</ul>
        </div>
      </div>

      <div class="twocol">
        <div class="card panel">
          <h2>Settings</h2>
          <p class="hint">Retention auto-purges old leads daily (0 = keep forever).</p>
          <label>Retention (days)</label><input id="set-retention" value="${esc(settings.retention_days || '0')}">
          <div class="rowact"><button class="btn sm gold" id="saveSettings">Save settings</button><span id="setMsg" class="muted" style="font-size:.85rem"></span></div>
        </div>
        <div class="card panel">
          <h2>Daily digest</h2>
          <p class="hint">Sent to your Telegram once a day.</p>
          <button class="btn sm ghost" id="previewDigest">Preview digest</button>
          <pre id="digestOut" class="pre" hidden></pre>
        </div>
      </div>

      <div class="twocol">
        <div class="card panel">
          <h2>API keys</h2>
          <p class="hint">For pulling leads into other systems. The key is shown once.</p>
          <div class="rowact"><input id="keyName" placeholder="name" style="flex:1;min-width:120px"><button class="btn sm gold" id="makeKey">Create key</button></div>
          <pre id="keyOut" class="pre" hidden></pre>
          <ul class="mini" id="keyList"></ul>
        </div>
        <div class="card panel">
          <h2>Admin users</h2>
          <p class="hint">Other people who can sign in.</p>
          <ul class="mini">${admins}</ul>
          <div class="rowact"><input id="newAdminEmail" placeholder="email" style="flex:1;min-width:140px"><input id="newAdminPw" placeholder="password (12+ chars)" style="flex:1;min-width:140px"><button class="btn sm gold" id="addAdmin">Add</button></div>
          <span id="adminMsg" class="muted" style="font-size:.85rem"></span>
        </div>
      </div>

      <div class="twocol">
        <div class="card panel">
          <h2>Webhooks</h2>
          <p class="hint">POST a JSON payload on each new lead.</p>
          <div class="rowact"><input id="hookUrl" placeholder="https://…" style="flex:1;min-width:160px"><button class="btn sm gold" id="addHook">Add</button></div>
          <ul class="mini" id="hookList"></ul>
        </div>
        <div class="card panel">
          <h2>Sessions</h2>
          <p class="hint">Active admin sign-ins.</p>
          <ul class="mini" id="sessList"></ul>
        </div>
      </div>

      <div class="twocol">
        <div class="card panel">
          <h2>Change password</h2>
          <p class="hint">Your own account.</p>
          <label>Current password</label><input id="pwCur" type="password" autocomplete="current-password">
          <label style="margin-top:10px">New password</label><input id="pwNew" type="password" autocomplete="new-password">
          <div class="rowact"><button class="btn sm gold" id="chPw">Change password</button><span id="pwMsg" class="muted" style="font-size:.85rem"></span></div>
        </div>
        <div class="card panel">
          <h2>Errors</h2>
          <p class="hint">Exceptions recorded by the API.</p>
          <ul class="mini">${errors}</ul>
        </div>
      </div>
    </div>
    ${drawers}
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
    /* stage + notes + fields */
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
      if(r.ok){b.closest('.drawer').remove();toast('Deleted',true);}else toast('Could not delete',false);
    }));
    $$('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.copy;
      const row=document.querySelector('#tbody tr[data-id="'+id+'"]');
      const drawer=document.querySelector('#d-'+id);
      const txt=(drawer?drawer.innerText:'')+'\\n\\n'+(row?row.innerText:'');
      toast('Copying...',true);
      try{
        if(!navigator.clipboard||!navigator.clipboard.writeText) throw new Error('no clipboard api');
        /* the clipboard promise can hang forever when permission is refused -
           race it against a timeout so the button always answers */
        await Promise.race([
          navigator.clipboard.writeText(txt),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),1500))
        ]);
        toast('Details copied',true);
      }catch(e){
        /* fallback: select the text and use the old copy command */
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
    $$('[data-rmadmin]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('Remove this admin user?'))return;
      const r=await api('/admin/admins/'+b.dataset.rmadmin,null,'DELETE');
      if(r.ok){ const li=b.closest('li'); if(li) li.remove(); toast('Removed',true); }
      else toast(r.error||'Could not remove',false);
    }));
    /* open rows */
    $$('[data-open]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();document.querySelector('#d-'+b.dataset.open).classList.toggle('open');}));
    $$('tr.row').forEach(tr=>tr.addEventListener('click',(ev)=>{
      if(ev.target && ev.target.closest('.pick')) return;
      const d=document.querySelector('#d-'+tr.dataset.id);
      if(d) d.classList.toggle('open');
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
      const body=document.querySelector('#tbody');
      if(body) body.scrollIntoView({block:'start',behavior:'smooth'});
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
      const r=await api('/admin/content',{headline:$('#c-headline').value,subheadline:$('#c-subheadline').value,cta_label:$('#c-cta_label').value,specialties:$('#c-specialties').value});
      toast(r.ok?'Copy saved - refresh the funnel to see it':'Could not save copy',r.ok);
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

function bar(label, value, color, max) {
  const pct = Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(max || 0))) * 100));
  return `<div class="fbar"><span class="fbar__l">${esc(label)}</span><span class="fbar__track"><i style="width:${Math.max(2, pct)}%;background:${color}"></i></span><span class="fbar__n">${esc(value || 0)}</span></div>`;
}

/**
 * Admin console design system (v3).
 *
 * Loaded AFTER the base stylesheet in index.js, so every rule is scoped under
 * `.app` and wins on specificity without touching the login page styles.
 *
 * The palette is the public funnel's own: ink, cream, paper and gold.
 * Flat plates with hairline borders - no heavy drop shadows on framed elements.
 */

export const DASH_CSS = `
.app{
  --ink:#17120D; --ink-2:#241C15;
  --cream:#FBF8F3; --cream-2:#F2ECE1; --paper:#FFFFFF;
  --gold:#CFA85F; --gold-lt:#F6D69C; --gold-dp:#7C5A26;
  --line:rgba(23,18,13,.10); --line-2:rgba(23,18,13,.055);
  --line-gold:rgba(207,168,95,.45);
  --muted:#6B6459; --muted-2:#938A7C;
  --teal:#1F6F6B; --violet:#5B43A0; --emerald:#2E7D4F; --stone:#9A938A;
  --c-new:#CFA85F; --c-contacted:#1F6F6B; --c-qualified:#5B43A0; --c-closed:#2E7D4F; --c-lost:#9A938A;
  --serif:'Fraunces',ui-serif,Georgia,serif;
  --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --ease:cubic-bezier(.22,.61,.36,1);
  --rail:252px;
  display:grid;grid-template-columns:var(--rail) minmax(0,1fr);
  min-height:100vh;background:var(--cream);color:var(--ink);
  font:400 15px/1.55 var(--sans);
}

/* ---------------- the rail ---------------- */
.app .rail{
  position:sticky;top:0;align-self:start;height:100vh;overflow:auto;
  display:flex;flex-direction:column;gap:6px;padding:22px 14px 16px;
  background:linear-gradient(180deg,#1A140E 0%,#241C15 55%,#1A140E 100%);
  color:#EFE6D6;border-right:1px solid rgba(207,168,95,.16);
}
.app .rail__brand{display:flex;align-items:center;gap:11px;padding:4px 8px 15px;border-bottom:1px solid rgba(207,168,95,.16)}
.app .rail__mark{width:36px;height:36px;border-radius:10px;background:rgba(246,214,156,.14);border:1px solid rgba(207,168,95,.42);display:grid;place-items:center;overflow:hidden;flex:0 0 auto}
.app .rail__mark img{width:22px;height:22px;border-radius:5px;display:block}
.app .rail__name{display:flex;flex-direction:column;gap:3px;min-width:0}
.app .rail__name b{font:600 1rem/1.1 var(--serif);letter-spacing:-.015em;color:#F7F0E3}
.app .rail__name em{font:600 .6rem/1 var(--sans);font-style:normal;letter-spacing:.18em;text-transform:uppercase;color:rgba(207,168,95,.85)}
.app .rail__label{margin:16px 10px 5px;font:600 .6rem/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:rgba(207,168,95,.55)}
.app .navi{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:11px;color:#C3B7A2;text-decoration:none;font:600 .9rem/1 var(--sans);transition:background .18s var(--ease),color .18s var(--ease)}
.app .navi:hover{background:rgba(207,168,95,.1);color:#F6EEDF}
.app .navi.is-on{background:linear-gradient(180deg,#F6D69C,#CFA85F);color:#1B140E}
.app .navi__n{margin-left:auto;font:700 .68rem/1 var(--mono);padding:4px 8px;border-radius:100px;background:rgba(207,168,95,.16);color:#E8D9BC}
.app .navi.is-on .navi__n{background:rgba(27,20,14,.15);color:#1B140E}
.app .rail__foot{margin-top:auto;padding-top:14px;border-top:1px solid rgba(207,168,95,.16);display:grid;gap:9px}
.app .rail__who{display:flex;align-items:center;gap:10px;padding:2px 6px}
.app .avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:700 .76rem/1 var(--sans);background:linear-gradient(160deg,#F6D69C,#CFA85F);color:#1B140E;flex:0 0 auto}
.app .rail__who b{display:block;font:600 .84rem/1.2 var(--sans);color:#F3EADB}
.app .rail__who span{display:block;font:500 .68rem/1.3 var(--sans);color:rgba(207,168,95,.72)}
.app .rail__link{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 12px;border-radius:100px;border:1px solid rgba(207,168,95,.3);color:#E3D5BC;text-decoration:none;font:600 .8rem/1 var(--sans);background:none;cursor:pointer;width:100%}
.app .rail__link:hover{background:rgba(207,168,95,.12);color:#FFF8EA}

/* ---------------- top bar ---------------- */
.app .main{min-width:0;display:flex;flex-direction:column}
.app .bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:16px;padding:12px 26px;background:rgba(251,248,243,.88);backdrop-filter:blur(16px) saturate(140%);border-bottom:1px solid var(--line)}
.app .bar__burger{display:none;width:42px;height:42px;border-radius:11px;border:1px solid var(--line);background:var(--paper);font-size:1.1rem;color:var(--ink);cursor:pointer}
.app .bar__title h1{font:600 1.3rem/1.15 var(--serif);letter-spacing:-.025em;margin:0}
.app .bar__title p{margin:3px 0 0;font-size:.82rem;color:var(--muted)}
.app .bar__actions{margin-left:auto;display:flex;align-items:center;gap:9px}
.app .omni{display:flex;align-items:center;gap:9px;padding:10px 13px;border-radius:100px;border:1px solid var(--line);background:var(--paper);color:var(--muted);font:500 .85rem/1 var(--sans);cursor:pointer;min-width:224px;text-align:left}
.app .omni:hover{border-color:var(--line-gold);color:var(--ink)}
.app .omni kbd{margin-left:auto;font:600 .66rem/1 var(--mono);border:1px solid var(--line);border-radius:5px;padding:4px 6px;background:var(--cream)}
.app .bar__link{padding:10px 16px;border-radius:100px;border:1px solid var(--line-gold);color:var(--gold-dp);text-decoration:none;font:600 .82rem/1 var(--sans);background:var(--paper)}
.app .bar__link:hover{background:#FBF3E4}

/* ---------------- canvas ---------------- */
.app .canvas{padding:26px 26px 90px;width:100%;max-width:1520px}
.app .view{display:none}
.app .view.is-on{display:block;animation:appFade .3s var(--ease)}
@keyframes appFade{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}

/* ---------------- hero signal band ---------------- */
.app .hero{position:relative;overflow:hidden;border-radius:20px;padding:28px 30px;margin-bottom:16px;color:#F7EFE0;border:1px solid rgba(207,168,95,.26);background:linear-gradient(135deg,#1A140E 0%,#2C2219 46%,#191309 100%)}
.app .hero::before{content:'';position:absolute;top:-170px;right:-100px;width:540px;height:540px;border-radius:50%;background:radial-gradient(circle,rgba(207,168,95,.26),transparent 62%);pointer-events:none}
.app .hero__grid{position:relative;display:grid;grid-template-columns:minmax(200px,1fr) auto minmax(240px,1.05fr);gap:30px;align-items:center}
.app .eyebrow{margin:0 0 10px;font:600 .62rem/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:rgba(207,168,95,.9)}
.app .hero__num{display:block;font:600 clamp(2.8rem,5.6vw,4rem)/.95 var(--serif);letter-spacing:-.04em;color:#FBF3E4}
.app .hero__cap{display:block;margin-top:9px;font-size:.85rem;color:rgba(247,239,224,.62)}
.app .hero__stats{display:flex;gap:34px}
.app .hero__stats b{display:block;font:600 1.5rem/1 var(--serif);color:#F6D69C}
.app .hero__stats span{display:block;margin-top:7px;font:600 .62rem/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:rgba(247,239,224,.52)}
.app .hero__spark svg{width:100%;height:74px;display:block}

/* ---------------- plates ---------------- */
.app .plates{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:14px;margin-bottom:20px}
.app .plate{position:relative;overflow:hidden;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px 20px 21px}
.app .plate::after{content:'';position:absolute;left:0;bottom:0;width:100%;height:3px;background:linear-gradient(90deg,var(--gold-lt),var(--gold))}
.app .plate b{display:block;font:600 2rem/1 var(--serif);letter-spacing:-.03em}
.app .plate span{display:block;margin-top:9px;font:600 .64rem/1 var(--sans);letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
.app .plate--hot{border-color:var(--line-gold);background:linear-gradient(180deg,#FDF6EA,#fff)}
.app .plate--hot b{color:var(--gold-dp)}
.app .plate--hot::after{background:linear-gradient(90deg,var(--gold),var(--gold-dp))}

/* ---------------- panels ---------------- */
.app .panel{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:22px 24px;margin-bottom:18px}
.app .panel__head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.app .panel__head h2{font:600 1.16rem/1.2 var(--serif);letter-spacing:-.02em;margin:0}
.app .panel__head p{margin:5px 0 0;font-size:.82rem;color:var(--muted)}
.app .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}

/* ---------------- funnel viz ---------------- */
.app .fn{display:grid;gap:13px}
.app .fn__row{display:grid;grid-template-columns:132px minmax(0,1fr) 74px;align-items:center;gap:14px}
.app .fn__l{font-size:.87rem;color:var(--muted)}
.app .fn__track{height:36px;border-radius:10px;background:var(--cream-2);overflow:hidden}
.app .fn__fill{display:block;height:100%;border-radius:10px;min-width:34px}
.app .fn__n{text-align:right;font:700 1rem/1 var(--mono)}
.app .fn__note{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:15px;border-top:1px solid var(--line-2)}
.app .fn__chip{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:100px;background:var(--cream);border:1px solid var(--line);font-size:.8rem;color:var(--muted)}
.app .fn__chip b{font:700 .82rem/1 var(--mono);color:var(--ink)}

/* ---------------- pipeline ---------------- */
.app .pipes{display:grid;gap:4px}
.app .pipe{display:grid;grid-template-columns:12px 92px minmax(0,1fr) 50px;align-items:center;gap:12px;width:100%;padding:10px;border-radius:12px;border:1px solid transparent;background:none;cursor:pointer;text-align:left}
.app .pipe:hover{background:var(--cream);border-color:var(--line)}
.app .pipe__dot{width:10px;height:10px;border-radius:50%}
.app .pipe__l{font:600 .88rem/1 var(--sans)}
.app .pipe__bar{height:9px;border-radius:100px;background:var(--cream-2);overflow:hidden}
.app .pipe__bar i{display:block;height:100%;border-radius:100px}
.app .pipe__n{text-align:right;font:700 .92rem/1 var(--mono)}

/* ---------------- chart ---------------- */
.app .chartbox svg{width:100%;height:auto;display:block;overflow:visible}
.app .legend{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:.8rem;color:var(--muted)}
.app .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px}
.app .spark i{display:block;height:100%;border-radius:100px}

/* ---------------- lists ---------------- */
.app .mini{list-style:none;margin:0;padding:0;font-size:.88rem}
.app .mini li{display:flex;gap:10px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--line-2);flex-wrap:wrap}
.app .mini li:last-child{border-bottom:0}
.app .mini li b{font-weight:600}
.app .srcrow{display:grid;grid-template-columns:104px minmax(0,1fr) 44px;align-items:center;gap:12px;padding:7px 0}
.app .srcrow__t{height:8px;border-radius:100px;background:var(--cream-2);overflow:hidden}
.app .srcrow__t i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-lt),var(--gold));border-radius:100px}
.app .srcrow__n{text-align:right;font:700 .85rem/1 var(--mono)}

/* ---------------- leads ---------------- */
.app .leads{display:grid;grid-template-columns:minmax(0,1fr) 424px;gap:18px;align-items:start}
.app .leads__list{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px 20px 22px;container-type:inline-size;container-name:leads}
.app .leads__detail{position:sticky;top:74px;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px 22px;max-height:calc(100vh - 96px);overflow:auto}
.app .detail__empty{text-align:center;padding:54px 18px;color:var(--muted)}
.app .leads__detail.has-lead .detail__empty{display:none}
.app .drawer__x{display:none;width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:var(--cream);color:var(--muted);font:600 .95rem/1 var(--sans);cursor:pointer;align-items:center;justify-content:center}
.app .drawer__head .drawer__x{display:inline-flex}
.app .detail__empty b{display:block;font:600 1.15rem/1.3 var(--serif);color:var(--ink);margin-bottom:6px}
.app .toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.app .chips{display:flex;gap:6px;flex-wrap:wrap}
.app .chip{border:1px solid var(--line);background:var(--cream);border-radius:100px;padding:8px 14px;font:600 .8rem/1 var(--sans);cursor:pointer;color:var(--muted)}
.app .chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.app .search{flex:1;min-width:170px}
.app .tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -6px;padding:0 6px}
.app table{width:100%;border-collapse:collapse;min-width:540px}
/* the lead table responds to the WIDTH OF THE LIST, not the window - with the
   detail panel open the list is much narrower than the viewport */
@container leads (max-width:780px){
  .app th.hide,.app td.hide{display:none}
  .app table{min-width:0}
  .app td,.app th{padding-left:8px;padding-right:8px}
  .app .toolbar{gap:8px}
  .app .search{min-width:140px}
}
/* on a narrow list the score and the Open button are dropped - the whole row
   is tappable, so the button is redundant and the name needs the room */
@container leads (max-width:540px){
  .app .col-score,.app .col-open{display:none}
  .app .who b{font-size:.95rem}
  .app .pill-cell{padding-left:0}
}
.app th{text-align:left;font:600 .64rem/1 var(--sans);letter-spacing:.15em;text-transform:uppercase;color:var(--muted);padding:0 12px 12px;border-bottom:1px solid var(--line)}
.app td{padding:13px 12px;border-bottom:1px solid var(--line-2);vertical-align:middle}
.app tr.row{cursor:pointer;transition:background .15s}
.app tr.row:hover{background:#FBF7EF}
.app tr.row.is-sel{background:#FBF3E4;box-shadow:inset 3px 0 0 var(--gold)}
.app .who{display:flex;align-items:center;gap:11px}
.app .who>div{min-width:0;flex:1}
.app .who__av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:700 .74rem/1 var(--sans);flex:0 0 auto;background:var(--cream-2);color:var(--gold-dp);border:1px solid var(--line)}
.app .who__av.hot{background:#FBE7D2;color:#8A4B12;border-color:#F0D6B4}
.app .who__av.warm{background:#F7EBD4;color:#8A6420;border-color:#EEDCB8}
.app .who__av.cool{background:#EDEFEA;color:#6B6459;border-color:#E1E4DE}
.app .who b{display:block;font-weight:600;line-height:1.25}
.app .who a{color:var(--muted);font-size:.8rem;text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app .who a:hover{text-decoration:underline}
.app .pill{display:inline-block;border-radius:100px;padding:5px 12px;font:600 .72rem/1 var(--sans)}
.app .pill.new{background:#F6EDDF;color:#8A6420;border:1px solid var(--line-gold)}
.app .pill.contacted{background:#E4F0EE;color:#1F6F6B;border:1px solid #BFDAD6}
.app .pill.qualified{background:#F0E9FA;color:#4A3080;border:1px solid #D6C7EE}
.app .pill.closed{background:#E9F3EC;color:#1F5C3A;border:1px solid #A9CFB7}
.app .pill.lost{background:#F3EFEA;color:#7A7168;border:1px solid #DED6CB}
.app .score{display:inline-block;min-width:38px;text-align:center;border-radius:100px;padding:4px 9px;font:700 .78rem/1 var(--mono)}
.app .score.hot{background:#FBE7D2;color:#8A4B12}
.app .score.warm{background:#F7EBD4;color:#8A6420}
.app .score.cool{background:#EDEFEA;color:#6B6459}
.app .tag{display:inline-block;border-radius:5px;padding:1px 6px;background:#F0E9FA;color:#4A3080;font:700 .6rem/1.5 var(--sans);text-transform:uppercase;letter-spacing:.05em}
.app .tag--warn{background:#FBF0D8;color:#8A6420}
.app .tag--bad{background:#F8E4E1;color:#8A2E22}
.app .empty{text-align:center;padding:52px 20px;color:var(--muted)}
.app .empty b{display:block;font:600 1.2rem/1.3 var(--serif);color:var(--ink);margin-bottom:6px}

/* ---------------- the lead detail ---------------- */
.app .drawer{display:none;background:none;border:0;border-radius:0;padding:0;margin:0}
.app .drawer.open{display:block}
.app .drawer__head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.app .drawer__head h3{font:600 1.22rem/1.2 var(--serif);letter-spacing:-.02em;margin:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.app .kv{display:grid;grid-template-columns:112px minmax(0,1fr);gap:9px 14px;font-size:.88rem;margin-bottom:18px}
.app .kv dt{color:var(--muted);font-weight:600}
.app .kv dd{margin:0;overflow-wrap:anywhere}
.app .kv a{color:var(--gold-dp)}
.app .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.app .rowact{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}
.app .notes{width:100%;min-height:84px;resize:vertical}

/* ---------------- forms ---------------- */
.app input,.app select,.app textarea{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:var(--cream);font:400 .92rem/1.4 var(--sans);color:var(--ink)}
.app input:focus,.app select:focus,.app textarea:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(207,168,95,.18)}
.app label{display:block;font:600 .68rem/1 var(--sans);letter-spacing:.11em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.app .btn{background:var(--ink);color:#fff;border-radius:100px}
.app .btn.gold{background:linear-gradient(180deg,var(--gold-lt),var(--gold) 58%,#BE9149);color:#1B140E}
.app .btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line-gold)}
.app .btn.ghost:hover{background:#FBF3E4}
.app .btn.sm{padding:8px 14px;font-size:.8rem}
.app .pre{background:var(--cream);border:1px solid var(--line);border-radius:10px;padding:12px;font:500 .76rem/1.5 var(--mono);white-space:pre-wrap;word-break:break-all;margin:12px 0 0}
.app .bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:11px 14px;margin-bottom:14px;background:#FBF6EA;border:1px solid var(--line-gold);border-radius:12px}
.app .bulk span{font:600 .84rem/1 var(--sans)}

/* ---------------- command palette ---------------- */
.app .palette{position:fixed;inset:0;z-index:80;display:none;align-items:flex-start;justify-content:center;padding:13vh 20px 20px;background:rgba(23,18,13,.44);backdrop-filter:blur(4px)}
.app .palette.is-on{display:flex}
.app .palette__box{width:100%;max-width:580px;background:var(--paper);border-radius:16px;border:1px solid var(--line);overflow:hidden;box-shadow:0 40px 80px -30px rgba(23,18,13,.55)}
.app .palette__box input{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:16px 18px;font-size:1rem;background:transparent}
.app .palette__box input:focus{box-shadow:none;border-color:var(--line)}
.app .palette__list{list-style:none;margin:0;padding:6px;max-height:54vh;overflow:auto}
.app .palette__list li{padding:11px 14px;border-radius:10px;cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center;gap:12px}
.app .palette__list li:hover,.app .palette__list li.is-on{background:var(--cream)}
.app .palette__list b{display:block;font-weight:600}
.app .palette__list span{color:var(--muted);font-size:.8rem}

/* ---------------- toast ---------------- */
.app .toast{background:#17120D;color:#F6EFE2}

/* ---------------- phone ---------------- */
@media(max-width:1180px){
  .app{grid-template-columns:1fr}
  .app .rail{position:fixed;left:0;top:0;width:272px;z-index:60;transform:translateX(-102%);transition:transform .3s var(--ease);box-shadow:0 0 0 100vmax rgba(23,18,13,0)}
  .app .rail.is-open{transform:none}
  .app .bar__burger{display:block}
  .app .leads{grid-template-columns:1fr}
  .app .leads__detail{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:70;max-height:84vh;border-radius:20px 20px 0 0;transform:translateY(102%);transition:transform .3s var(--ease);box-shadow:0 -24px 60px -30px rgba(23,18,13,.5)}
  .app.has-detail .leads__detail{transform:none}
  .app .hero__grid{grid-template-columns:1fr;gap:22px}
  .app .hero__stats{gap:26px}
}
@media(max-width:760px){
  .app .canvas{padding:18px 16px 80px}
  .app .bar{padding:11px 16px;gap:10px}
  .app .bar__title h1{font-size:1.1rem}
  .app .bar__title p{display:none}
  .app .omni{min-width:0;padding:11px 13px}
  .app .omni span{display:none}
  .app .omni kbd{margin-left:0}
  .app .bar__link{padding:11px 13px}
  .app .grid-2{grid-template-columns:1fr}
  .app .grid2{grid-template-columns:1fr}
  .app .plates{grid-template-columns:repeat(2,1fr)}
  .app .plate b{font-size:1.65rem}
  .app .fn__row{grid-template-columns:96px minmax(0,1fr) 54px;gap:10px}
  .app .fn__l{font-size:.78rem}
  .app .pipe{grid-template-columns:10px 74px minmax(0,1fr) 40px;gap:9px;min-height:44px}
  .app .pipe__l{font-size:.78rem}
  .app .kv{grid-template-columns:1fr;gap:3px}
  .app .kv dd{margin-bottom:8px}
  .app th.hide,.app td.hide{display:none}
  .app .panel{padding:18px 16px;border-radius:16px}
  .app .hero{padding:22px 20px;border-radius:18px}
  .app .hero__stats{gap:22px;flex-wrap:wrap}
  .app .detail__empty{padding:34px 10px}
}
`;

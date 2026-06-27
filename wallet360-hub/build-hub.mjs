#!/usr/bin/env node
// Builds wallet360-hub/hub.html — a single self-contained "war room" page that
// renders every project markdown file (hub + docs + decisions + root) with a
// dashboard (phase progress parsed from TODO.md, open items, quick links).
//
// Re-run after editing any .md to refresh:  npm run hub   (or node this file)
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { fileURLToPath } from 'node:url'

const HUB_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HUB_DIR, '..')

// ── Collect markdown sources, grouped ────────────────────────────
const groups = [
  { id: 'war', label: 'War Room', dir: HUB_DIR },
  { id: 'docs', label: 'Docs', dir: path.join(ROOT, 'docs') },
  { id: 'decisions', label: 'Decisões', dir: path.join(ROOT, 'docs', 'decisions') },
  { id: 'root', label: 'Raiz', dir: ROOT },
]

const mdInDir = (dir) => {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md')).map((f) => path.join(dir, f))
  } catch { return [] }
}

const titleOf = (text, fallback) => {
  const m = text.match(/^\s*#\s+(.+)$/m)
  return (m ? m[1] : fallback).replace(/[`*_]/g, '').trim()
}

const docs = []
const seen = new Set()
for (const g of groups) {
  for (const file of mdInDir(g.dir)) {
    if (g.id === 'root' && path.dirname(file) !== ROOT) continue
    if (seen.has(file)) continue
    seen.add(file)
    const raw = fs.readFileSync(file, 'utf8')
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    docs.push({
      id: rel.replace(/[^a-zA-Z0-9]/g, '-'),
      group: g.id,
      groupLabel: g.label,
      title: titleOf(raw, path.basename(file, '.md')),
      file: rel,
      md: raw,
    })
  }
}

// ── Parse TODO.md for phase progress + open items ────────────────
const todo = docs.find((d) => d.file.endsWith('TODO.md'))
const phases = []
const openItems = []
if (todo) {
  let cur = null
  for (const rawLine of todo.md.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const h = line.match(/^##\s+(.+)$/)
    if (h) { cur = { name: h[1].replace(/[`*]/g, '').trim(), done: 0, open: 0 }; phases.push(cur); continue }
    const done = /^\s*-\s*\[x\]/i.test(line)
    const open = /^\s*-\s*\[ \]/.test(line)
    if (done && cur) cur.done++
    if (open && cur) {
      cur.open++
      const txt = line.replace(/^\s*-\s*\[ \]\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').trim()
      openItems.push({ phase: cur.name, text: txt.slice(0, 140) })
    }
  }
}
const phasesWithItems = phases.filter((p) => p.done + p.open > 0)

// ── Fetch marked once to inline (self-contained, offline-capable) ─
function fetchText(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(res.headers.location))
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve(res.statusCode === 200 ? data : null))
    }).on('error', () => resolve(null))
  })
}

const MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js'
const markedJs = await fetchText(MARKED_URL)
const markedTag = markedJs
  ? `<script>${markedJs.replace(/<\/script>/gi, '<\\/script>')}</script>`
  : `<script src="${MARKED_URL}"></script>`

// ── Assemble HTML ────────────────────────────────────────────────
const data = { docs, phases: phasesWithItems, openItems, generatedAt: new Date().toISOString() }
// Escape < so a literal </script> inside any markdown can't close our data tag.
const dataJson = JSON.stringify(data).replace(/</g, '\\u003c')

const html = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Wallet360 — War Room</title>
<style>
  :root{
    --ink:#0D2740;--paper:#FAF9F7;--bg:#eef1f6;--card:#ffffff;--line:#e6e9f0;
    --txt:#e8edf6;--mut:#9fb0c7;--blue:#2F74D8;--green:#2FAA6A;--amber:#f59e0b;
    --muted:#5c6b80;--faint:#94a3b8;--shadow:0 1px 2px rgba(13,39,64,.05);
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;font-family:"Outfit",system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);display:flex;min-height:100vh;-webkit-font-smoothing:antialiased}
  a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}

  /* Sidebar */
  #side{width:270px;flex:none;background:linear-gradient(180deg,#0D2740,#0a1b2e);color:var(--txt);height:100vh;position:sticky;top:0;overflow-y:auto;border-right:1px solid #0a1a2b}
  .brand{display:flex;align-items:center;gap:11px;padding:20px 18px 14px}
  .brand .wm{font-size:18px;font-weight:700;color:#fff;letter-spacing:-.01em}
  .brand .wm b{color:var(--blue)} .brand .wm i{color:var(--green);font-style:normal}
  .brand .sub{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);font-weight:600;margin-top:2px}
  #search{width:calc(100% - 32px);margin:0 16px 6px;padding:10px 12px;border-radius:9px;border:1px solid #1c3a57;background:#0a1f33;color:#fff;font-size:13px;outline:none}
  #search:focus{border-color:var(--blue)}
  .searchhint{margin:0 16px 12px;font-size:10px;color:var(--mut)}
  .searchhint kbd{background:#13314c;border:1px solid #1c3a57;border-radius:4px;padding:0 5px;font-size:10px}
  .navtop{padding:4px 0}
  .navgroup{padding:0}
  .ghead{display:flex;align-items:center;gap:8px;margin:0;padding:10px 18px;font-size:10px;letter-spacing:.10em;text-transform:uppercase;color:var(--mut);cursor:pointer;user-select:none}
  .ghead:hover{color:#cdd9e8}
  .ghead .gchev{transition:transform .2s;font-size:9px}
  .ghead .gcount{margin-left:auto;font-size:10px;letter-spacing:0;background:#13314c;color:#9fb0c7;border-radius:99px;padding:1px 7px}
  .navgroup.open .ghead{color:#cdd9e8}
  .navgroup.open .ghead .gchev{transform:rotate(90deg)}
  .gitems{display:none;padding-bottom:6px}
  .navgroup.open .gitems{display:block}
  .navitem{display:flex;align-items:center;gap:8px;padding:8px 18px;color:#cdd9e8;font-size:13.5px;border-left:3px solid transparent;cursor:pointer;transition:background .12s}
  .navitem:hover{background:#13314c;text-decoration:none}
  .navitem.active{border-left-color:var(--blue);background:#13314c;color:#fff;font-weight:600}

  /* Main */
  main{flex:1;min-width:0;background:var(--bg)}
  .topbar{position:sticky;top:0;background:rgba(255,255,255,.82);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:13px 28px;display:flex;align-items:center;gap:14px;z-index:5}
  .topbar h1{font-size:16px;margin:0;font-weight:700}
  .topbar .meta{color:var(--faint);font-size:12px;margin-left:auto}
  .wrap{max-width:920px;margin:0 auto;padding:24px 28px 90px}

  /* Hero progress */
  .hero{background:linear-gradient(135deg,#0D2740,#16365a);color:#fff;border-radius:16px;padding:22px 24px;margin-bottom:18px;box-shadow:0 8px 24px rgba(13,39,64,.12)}
  .hero .top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
  .hero .pct{font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1}
  .hero .pct small{font-size:14px;font-weight:600;color:#9fc2ee;margin-left:7px}
  .hero .links{display:flex;gap:8px;flex-wrap:wrap}
  .hero .links a{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#dce9f8;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);padding:6px 12px;border-radius:99px}
  .hero .links a:hover{background:rgba(255,255,255,.18);text-decoration:none}
  .hero .htrack{height:10px;background:rgba(255,255,255,.14);border-radius:99px;overflow:hidden;margin:16px 0 7px}
  .hero .hfill{height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:99px;transition:width .5s ease}
  .hero .hsub{font-size:12px;color:#9fc2ee}

  /* Stat cards */
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px 17px;box-shadow:var(--shadow)}
  .card .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--faint)}
  .card .val{font-size:23px;font-weight:700;margin-top:4px}

  /* Sections */
  .sec{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:16px;box-shadow:var(--shadow)}
  .sec h2{font-size:13px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700}

  /* Phases (interactive accordion) */
  .phase{border-bottom:1px solid #f1f4f9}
  .phase:last-child{border-bottom:none}
  .phase .head{display:flex;align-items:center;gap:12px;padding:11px 0;cursor:pointer}
  .phase .chev{flex:none;width:12px;color:var(--faint);transition:transform .2s;font-size:10px}
  .phase.open .chev{transform:rotate(90deg)}
  .phase .nm{flex:1;font-size:13.5px;font-weight:600}
  .phase .ct{font-size:12px;color:var(--muted);flex:none;font-variant-numeric:tabular-nums}
  .phase .bar{height:7px;background:#eef1f6;border-radius:99px;overflow:hidden;width:120px;flex:none}
  .phase .bar > i{display:block;height:100%;background:var(--green);border-radius:99px;transition:width .4s}
  .phase .body{display:none;padding:0 0 12px 24px}
  .phase.open .body{display:block;animation:fade .2s ease}
  .phase .body .t{display:flex;gap:9px;padding:5px 0;font-size:13px;color:var(--muted)}
  .phase .body .t::before{content:"○";color:var(--amber);flex:none}
  .phase .body .t.done::before{content:"✓";color:var(--green)}
  @keyframes fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}

  /* Doc view */
  .filemeta{color:var(--faint);font-size:12px;margin:0 0 14px}
  .docwrap{display:flex;gap:24px;align-items:flex-start}
  .md{flex:1;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 28px 28px;box-shadow:var(--shadow)}
  .toc{position:sticky;top:70px;flex:none;width:200px;font-size:12.5px;max-height:calc(100vh - 100px);overflow:auto}
  .toc h5{margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--faint)}
  .toc a{display:block;padding:3px 0 3px 10px;color:var(--muted);border-left:2px solid var(--line);line-height:1.4}
  .toc a:hover{color:var(--blue);border-left-color:var(--blue);text-decoration:none}
  .toc a.h3{padding-left:22px;font-size:12px}
  @media(max-width:1080px){.toc{display:none}}
  .md h1{font-size:23px;border-bottom:1px solid var(--line);padding-bottom:8px}
  .md h2{font-size:18px;margin-top:26px;scroll-margin-top:70px}
  .md h3{font-size:15px;scroll-margin-top:70px}
  .md code{background:#f1f4f9;padding:2px 6px;border-radius:5px;font-size:13px;font-family:ui-monospace,Menlo,monospace}
  .md pre{background:#0D2740;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto}
  .md pre code{background:none;color:inherit;padding:0}
  .md table{border-collapse:collapse;width:100%;font-size:13.5px;margin:12px 0}
  .md th,.md td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
  .md th{background:#f8fafc}
  .md blockquote{border-left:3px solid var(--blue);margin:12px 0;padding:4px 16px;color:var(--muted);background:#f8fafc}
  .md ul{padding-left:22px}.md li{margin:4px 0}
  .md a{word-break:break-word}

  /* Mobile */
  .menubtn{display:none;align-items:center;border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer}
  @media(max-width:780px){#side{position:fixed;left:-280px;transition:left .2s;z-index:20}#side.open{left:0}.menubtn{display:inline-flex!important}}
</style>
</head>
<body>
<aside id="side">
  <div class="brand">
    <svg width="28" height="28" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <rect width="26" height="26" rx="7" fill="#16365a"/>
      <circle cx="9" cy="9" r="3" fill="#2F74D8"/>
      <circle cx="17" cy="9" r="3" fill="#2FAA6A"/>
      <path d="M9 9 L13 18 L17 9" stroke="#cfe0f5" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <div><span class="wm">wallet<b>3</b><i>6</i><b>0</b></span><span class="sub">War Room</span></div>
  </div>
  <input id="search" placeholder="Procurar título + conteúdo…" />
  <div class="searchhint">Pressiona <kbd>/</kbd> para procurar</div>
  <nav id="nav"></nav>
</aside>
<main>
  <div class="topbar">
    <button class="menubtn" id="menubtn">☰</button>
    <h1 id="title">Painel</h1>
    <span class="meta" id="meta"></span>
  </div>
  <div class="wrap" id="wrap"></div>
</main>
${markedTag}
<script>
const DATA = ${dataJson};
const PROD = "https://wallet360.pt";
const REPO = "https://github.com/tomasfmarques/wallet-app";
const LS = "w360hub:view";
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const groupsDef = [['war','War Room'],['docs','Docs'],['decisions','Decisões'],['root','Raiz']];

const openByPhase = {};
DATA.openItems.forEach(function(o){ (openByPhase[o.phase] = openByPhase[o.phase] || []).push(o.text); });

let currentId = '__dash';
function renderNav(filter){
  filter = (filter || '').toLowerCase();
  const activeDoc = DATA.docs.find(function(d){return d.id===currentId;});
  const activeGroup = activeDoc ? activeDoc.group : null;
  let html = '<div class="navtop"><a class="navitem" data-id="__dash">📊 Painel</a></div>';
  for(const gx of groupsDef){
    const items = DATA.docs.filter(function(d){
      if(d.group !== gx[0]) return false;
      if(!filter) return true;
      return d.title.toLowerCase().includes(filter) || d.file.toLowerCase().includes(filter) || d.md.toLowerCase().includes(filter);
    });
    if(!items.length) continue;
    const open = (filter !== '' || gx[0] === activeGroup);
    html += '<div class="navgroup'+(open?' open':'')+'" data-group="'+gx[0]+'">';
    html += '<h4 class="ghead"><span class="gchev">▶</span><span>'+gx[1]+'</span><span class="gcount">'+items.length+'</span></h4>';
    html += '<div class="gitems">';
    for(const d of items) html += '<a class="navitem" data-id="'+d.id+'">'+esc(d.title)+'</a>';
    html += '</div></div>';
  }
  document.getElementById('nav').innerHTML = html;
  setActive(currentId); // re-apply active highlight on the freshly rebuilt nav
}
function setActive(id){ currentId = id; document.querySelectorAll('.navitem').forEach(function(a){ a.classList.toggle('active', a.dataset.id===id); }); }
function card(lbl,val){ return '<div class="card"><div class="lbl">'+lbl+'</div><div class="val">'+val+'</div></div>'; }

function showDash(){
  setActive('__dash');
  try{ localStorage.setItem(LS,'__dash'); }catch(e){}
  document.getElementById('title').textContent = 'Painel';
  document.getElementById('meta').textContent = 'gerado ' + new Date(DATA.generatedAt).toLocaleString('pt-PT');
  const totalDone = DATA.phases.reduce(function(s,p){return s+p.done;},0);
  const totalOpen = DATA.phases.reduce(function(s,p){return s+p.open;},0);
  const total = totalDone + totalOpen;
  const pct = total ? Math.round(totalDone/total*100) : 0;
  let h = '';
  h += '<div class="hero"><div class="top">';
  h += '<div class="pct">'+pct+'%<small>concluído</small></div>';
  h += '<div class="links"><a href="'+PROD+'" target="_blank">🌐 wallet360.pt</a><a href="'+REPO+'" target="_blank">💻 GitHub</a></div>';
  h += '</div><div class="htrack"><div class="hfill" style="width:'+pct+'%"></div></div>';
  h += '<div class="hsub">'+totalDone+' de '+total+' tarefas concluídas · '+totalOpen+' em aberto</div></div>';
  h += '<div class="cards">';
  h += card('Documentos', DATA.docs.length);
  h += card('Fases', DATA.phases.length);
  h += card('Em aberto', totalOpen);
  h += '</div>';
  h += '<div class="sec"><h2>Progresso por fase — clica para abrir tarefas</h2>';
  DATA.phases.forEach(function(p,i){
    const tot = p.done + p.open, ppct = tot ? Math.round(p.done/tot*100) : 0;
    const items = openByPhase[p.name] || [];
    h += '<div class="phase" data-phase="'+i+'">';
    h += '<div class="head"><span class="chev">▶</span><span class="nm">'+esc(p.name)+'</span><span class="ct">'+p.done+'/'+tot+'</span><span class="bar"><i style="width:'+ppct+'%"></i></span></div>';
    h += '<div class="body">';
    if(items.length){ items.forEach(function(t){ h += '<div class="t">'+esc(t)+'</div>'; }); }
    else { h += '<div class="t done" style="color:var(--green)">Tudo concluído nesta fase</div>'; }
    h += '</div></div>';
  });
  h += '</div>';
  document.getElementById('wrap').innerHTML = h;
  document.getElementById('side').classList.remove('open');
  window.scrollTo(0,0);
}

function buildToc(){
  const md = document.querySelector('.md'); if(!md) return '';
  const hs = md.querySelectorAll('h2, h3');
  if(hs.length < 3) return '';
  let t = '<aside class="toc"><h5>Nesta página</h5>';
  hs.forEach(function(hd,i){
    const id = 'h-'+i; hd.id = id;
    t += '<a class="'+(hd.tagName==='H3'?'h3':'h2')+'" href="#'+id+'">'+esc(hd.textContent)+'</a>';
  });
  return t + '</aside>';
}
function showDoc(id){
  const d = DATA.docs.find(function(x){return x.id===id;}); if(!d) return;
  setActive(id);
  try{ localStorage.setItem(LS, id); }catch(e){}
  document.getElementById('title').textContent = d.title;
  document.getElementById('meta').textContent = d.file;
  const body = (window.marked ? marked.parse(d.md) : '<pre>'+esc(d.md)+'</pre>');
  document.getElementById('wrap').innerHTML = '<p class="filemeta">'+esc(d.file)+'</p><div class="docwrap"><div class="md">'+body+'</div></div>';
  const toc = buildToc();
  if(toc) document.querySelector('.docwrap').insertAdjacentHTML('beforeend', toc);
  document.getElementById('side').classList.remove('open');
  window.scrollTo(0,0);
}

document.getElementById('nav').addEventListener('click', function(e){
  const head = e.target.closest('.ghead');
  if(head){ head.parentElement.classList.toggle('open'); return; }
  const a = e.target.closest('.navitem'); if(!a) return;
  e.preventDefault();
  if(a.dataset.id === '__dash') showDash(); else showDoc(a.dataset.id);
});
document.getElementById('wrap').addEventListener('click', function(e){
  const head = e.target.closest('.phase .head'); if(!head) return;
  head.parentElement.classList.toggle('open');
});
const searchEl = document.getElementById('search');
searchEl.addEventListener('input', function(e){ renderNav(e.target.value); });
document.addEventListener('keydown', function(e){
  if(e.key === '/' && document.activeElement !== searchEl){ e.preventDefault(); searchEl.focus(); }
  else if(e.key === 'Escape' && document.activeElement === searchEl){ searchEl.value=''; renderNav(''); searchEl.blur(); }
});
document.getElementById('menubtn').addEventListener('click', function(){ document.getElementById('side').classList.toggle('open'); });

let initId = '__dash';
try{ const lv = localStorage.getItem(LS); if(lv && lv !== '__dash' && DATA.docs.some(function(d){return d.id===lv;})) initId = lv; }catch(e){}
currentId = initId;
renderNav();
if(initId === '__dash') showDash(); else showDoc(initId);
</script>
</body>
</html>`

const outFile = path.join(HUB_DIR, 'hub.html')
fs.writeFileSync(outFile, html)
console.log(`✔ Built ${path.relative(ROOT, outFile)} — ${docs.length} docs, ${phasesWithItems.length} phases, ${openItems.length} open items, marked ${markedJs ? 'inlined' : 'via CDN'} (${Math.round(html.length / 1024)} KB)`)

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
  :root{--bg:#0b1120;--panel:#0f172a;--line:#1e293b;--txt:#e2e8f0;--mut:#94a3b8;--blue:#3b82f6;--green:#22c55e;--amber:#f59e0b;--surface:#fff;--ink:#0f172a;}
  *{box-sizing:border-box}
  body{margin:0;font-family:"Outfit",system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink);display:flex;min-height:100vh}
  a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
  #side{width:280px;flex:none;background:var(--panel);color:var(--txt);height:100vh;position:sticky;top:0;overflow-y:auto;border-right:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:10px;padding:18px 18px 12px;font-size:18px;font-weight:600}
  .brand b{color:var(--blue)} .brand .g{color:var(--green)}
  #search{width:calc(100% - 32px);margin:0 16px 12px;padding:9px 12px;border-radius:8px;border:1px solid var(--line);background:#0b1120;color:var(--txt);font-size:13px}
  .navgroup{padding:8px 0}
  .navgroup h4{margin:0;padding:6px 18px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
  .navitem{display:block;padding:7px 18px;color:var(--txt);font-size:13.5px;border-left:3px solid transparent;cursor:pointer}
  .navitem:hover{background:#16213a;text-decoration:none}
  .navitem.active{border-left-color:var(--blue);background:#16213a;color:#fff}
  main{flex:1;min-width:0;background:#f1f5f9}
  .topbar{position:sticky;top:0;background:#ffffffee;backdrop-filter:blur(6px);border-bottom:1px solid #e2e8f0;padding:12px 28px;display:flex;align-items:center;gap:14px;z-index:5}
  .topbar h1{font-size:16px;margin:0;font-weight:600}
  .topbar .meta{color:#64748b;font-size:12px;margin-left:auto}
  .wrap{max-width:900px;margin:0 auto;padding:24px 28px 80px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:22px}
  .card{background:var(--surface);border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px}
  .card .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
  .card .val{font-size:24px;font-weight:600;margin-top:4px}
  .card a.val{font-size:16px}
  .sec{background:var(--surface);border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin-bottom:18px}
  .sec h2{font-size:15px;margin:0 0 14px}
  .phase{margin:10px 0}
  .phase .row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px}
  .bar{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden}
  .bar > i{display:block;height:100%;background:var(--green);border-radius:99px}
  .openlist{list-style:none;margin:0;padding:0}
  .openlist li{padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13.5px;display:flex;gap:10px}
  .openlist .ph{flex:none;font-size:11px;color:#fff;background:var(--amber);padding:2px 8px;border-radius:99px;align-self:flex-start}
  .md{background:var(--surface);border:1px solid #e2e8f0;border-radius:12px;padding:8px 28px 28px}
  .md h1{font-size:24px;border-bottom:1px solid #e2e8f0;padding-bottom:8px}
  .md h2{font-size:19px;margin-top:28px}.md h3{font-size:16px}
  .md code{background:#f1f5f9;padding:2px 6px;border-radius:5px;font-size:13px;font-family:ui-monospace,Menlo,monospace}
  .md pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto}
  .md pre code{background:none;color:inherit;padding:0}
  .md table{border-collapse:collapse;width:100%;font-size:13.5px;margin:12px 0}
  .md th,.md td{border:1px solid #e2e8f0;padding:7px 10px;text-align:left;vertical-align:top}
  .md th{background:#f8fafc}
  .md blockquote{border-left:3px solid var(--blue);margin:12px 0;padding:4px 16px;color:#475569;background:#f8fafc}
  .md ul{padding-left:22px}.md li{margin:4px 0}
  .md a{word-break:break-word}
  .filemeta{color:#94a3b8;font-size:12px;margin:0 0 16px}
  @media(max-width:780px){#side{position:fixed;left:-280px;transition:left .2s;z-index:20}#side.open{left:0}.menubtn{display:inline-flex!important}}
  .menubtn{display:none;align-items:center;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer}
</style>
</head>
<body>
<aside id="side">
  <div class="brand"><span>💳</span> <span>Wallet<b>3</b><span class="g">6</span><b>0</b> · War Room</span></div>
  <input id="search" placeholder="Procurar documento…" />
  <nav id="nav"></nav>
</aside>
<main>
  <div class="topbar">
    <button class="menubtn" onclick="document.getElementById('side').classList.toggle('open')">☰</button>
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
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function renderNav(filter){
  filter = filter || '';
  const nav = document.getElementById('nav');
  const groups = [['war','War Room'],['docs','Docs'],['decisions','Decisões'],['root','Raiz']];
  let html = '<div class="navgroup"><a class="navitem" data-id="__dash" onclick="showDash()">📊 Painel</a></div>';
  for(const gx of groups){
    const items = DATA.docs.filter(function(d){ return d.group===gx[0] && (d.title.toLowerCase().includes(filter)||d.file.toLowerCase().includes(filter)); });
    if(!items.length) continue;
    html += '<div class="navgroup"><h4>'+gx[1]+'</h4>';
    for(const d of items) html += '<a class="navitem" data-id="'+d.id+'" onclick="showDoc(\\''+d.id+'\\')">'+esc(d.title)+'</a>';
    html += '</div>';
  }
  nav.innerHTML = html;
}
function setActive(id){ document.querySelectorAll('.navitem').forEach(function(a){ a.classList.toggle('active', a.dataset.id===id); }); }
function card(lbl,val){ return '<div class="card"><div class="lbl">'+lbl+'</div><div class="val">'+val+'</div></div>'; }
function showDash(){
  setActive('__dash');
  document.getElementById('title').textContent = 'Painel';
  document.getElementById('meta').textContent = 'gerado ' + new Date(DATA.generatedAt).toLocaleString('pt-PT');
  const totalDone = DATA.phases.reduce(function(s,p){return s+p.done;},0);
  const totalOpen = DATA.phases.reduce(function(s,p){return s+p.open;},0);
  let h = '<div class="cards">';
  h += card('Produção', '<a class="val" href="'+PROD+'" target="_blank">wallet360.pt ↗</a>');
  h += card('Repositório', '<a class="val" href="'+REPO+'" target="_blank">GitHub ↗</a>');
  h += card('Concluído', totalDone+' / '+(totalDone+totalOpen)+' tarefas');
  h += card('Documentos', DATA.docs.length);
  h += '</div>';
  h += '<div class="sec"><h2>Progresso por fase</h2>';
  for(const p of DATA.phases){
    const tot=p.done+p.open, pct=tot?Math.round(p.done/tot*100):0;
    h += '<div class="phase"><div class="row"><span>'+esc(p.name)+'</span><span>'+p.done+'/'+tot+'</span></div><div class="bar"><i style="width:'+pct+'%"></i></div></div>';
  }
  h += '</div>';
  if(DATA.openItems.length){
    h += '<div class="sec"><h2>Em aberto ('+DATA.openItems.length+')</h2><ul class="openlist">';
    for(const o of DATA.openItems) h += '<li><span class="ph">'+esc(o.phase.split('—')[0].trim().slice(0,18))+'</span><span>'+esc(o.text)+'</span></li>';
    h += '</ul></div>';
  }
  document.getElementById('wrap').innerHTML = h;
  window.scrollTo(0,0);
}
function showDoc(id){
  const d = DATA.docs.find(function(x){return x.id===id;}); if(!d) return;
  setActive(id);
  document.getElementById('title').textContent = d.title;
  document.getElementById('meta').textContent = d.file;
  const body = (window.marked ? marked.parse(d.md) : '<pre>'+esc(d.md)+'</pre>');
  document.getElementById('wrap').innerHTML = '<p class="filemeta">'+esc(d.file)+'</p><div class="md">'+body+'</div>';
  document.getElementById('side').classList.remove('open');
  window.scrollTo(0,0);
}
document.getElementById('search').addEventListener('input', function(e){ renderNav(e.target.value.toLowerCase()); });
renderNav(); showDash();
</script>
</body>
</html>`

const outFile = path.join(HUB_DIR, 'hub.html')
fs.writeFileSync(outFile, html)
console.log(`✔ Built ${path.relative(ROOT, outFile)} — ${docs.length} docs, ${phasesWithItems.length} phases, ${openItems.length} open items, marked ${markedJs ? 'inlined' : 'via CDN'} (${Math.round(html.length / 1024)} KB)`)

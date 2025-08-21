/* Spotify-like karaoke engine (vanilla JS, ~120 linija)
   - Učitaj demo LRC ili importuj .lrc fajl
   - Autoscroll, aktivna linija, karaoke “fill”
   - Kontrole: play/pause, seek, volume
*/

const audio = document.getElementById('audio');
const playBtn = document.getElementById('play');
const seek = document.getElementById('seek');
const vol = document.getElementById('vol');
const cur = document.getElementById('cur');
const dur = document.getElementById('dur');
const lyricsEl = document.getElementById('lyrics');
const loadDemo = document.getElementById('loadDemo');
const loadFile = document.getElementById('loadFile');
const fileInput = document.getElementById('fileInput');

const demoLRC = `
[00:00.00] (Intro)
[00:07.00] I code the rhythm as it flows
[00:12.40] Lines of light and audio
[00:17.80] Watch the lyrics come alive
[00:23.10] This is T•Solutions vibe
[00:28.50] (Instrumental)
`;

// ===== Helpers =====
const z = s => s.toString().padStart(2,'0');
const fmt = t => `${Math.floor(t/60)}:${z(Math.floor(t%60))}`;

function parseLRC(text){
  const out=[];
  for(const raw of text.split(/\r?\n/)){
    const matches = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]\s*(.*)/g)];
    for(const m of matches){
      const min=+m[1], sec=+m[2], cs=+(m[3]||0);
      const time=min*60+sec+cs/100;
      const line=m[4].trim();
      out.push({time,line});
    }
  }
  out.sort((a,b)=>a.time-b.time);
  for(let i=0;i<out.length;i++){
    out[i].end = i<out.length-1 ? Math.max(out[i].time+0.4, out[i+1].time) : out[i].time+2.5;
  }
  return out;
}

function render(lines){
  lyricsEl.innerHTML='';
  const nodes = lines.map(({line})=>{
    const row = document.createElement('div');
    row.className='line';
    row.innerHTML = `<span class="base">${escapeHTML(line)}</span>
                     <span class="fill">${escapeHTML(line)}</span>`;
    lyricsEl.appendChild(row);
    return row;
  });
  return nodes;
}

function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}

// ===== State =====
let LINES = [];
let NODES = [];
let idx = 0;

// ===== Controls =====
playBtn.addEventListener('click', ()=>{
  if(audio.paused){ audio.play(); } else { audio.pause(); }
});
audio.addEventListener('play', ()=> playBtn.textContent='⏸');
audio.addEventListener('pause',()=> playBtn.textContent='▶');

audio.addEventListener('loadedmetadata', ()=>{
  seek.max = audio.duration || 0;
  dur.textContent = fmt(audio.duration || 0);
});
audio.addEventListener('timeupdate', ()=>{
  if(!seek.dragging){ seek.value = audio.currentTime; }
  cur.textContent = fmt(audio.currentTime || 0);
});
seek.addEventListener('input', ()=>{ seek.dragging=true; });
seek.addEventListener('change', ()=>{ audio.currentTime = +seek.value; seek.dragging=false; });
vol.addEventListener('input', ()=> audio.volume = +vol.value);

// ===== Loaders =====
loadDemo.addEventListener('click', ()=>{
  setLRC(demoLRC);
});
loadFile.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const text = await f.text();
  setLRC(text);
});

// ===== Karaoke core =====
function setLRC(text){
  LINES = parseLRC(text);
  if(!LINES.length){
    lyricsEl.innerHTML = `<div class="placeholder">No timed lines found.</div>`;
    return;
  }
  NODES = render(LINES);
  idx = 0;
}

function tick(){
  const t = audio.currentTime || 0;

  // find current line
  while(idx < LINES.length-1 && t >= LINES[idx+1].time - 0.01) idx++;
  while(idx > 0 && t < LINES[idx].time - 0.01) idx--;

  // highlight & scroll
  NODES.forEach((el,i)=> el.classList.toggle('active', i===idx));
  const active = NODES[idx];
  if(active){
    const box = lyricsEl.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    const delta = r.top - box.top - box.height*0.45;
    if(Math.abs(delta) > 2) lyricsEl.scrollBy({top: delta, behavior:'smooth'});

    // fill %
    const start = LINES[idx].time, end = LINES[idx].end;
    const p = Math.max(0, Math.min(1, (t - start) / (end - start)));
    const fill = active.querySelector('.fill');
    if(fill) fill.style.backgroundSize = (p*100).toFixed(1) + '% 100%';
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Init with demo so odmah izgleda živo i BEZ audio fajla
setLRC(demoLRC);

// Ako želiš da “svira” i bez audio.mp3: simuliraj vreme
// (otkomentariši ova 4 reda i nemoj play da koristiš)
/*
let fakeT=0; setInterval(()=>{ fakeT+=0.1; audio.currentTime=fakeT; }, 100);
Object.defineProperty(audio,'currentTime',{get(){return fakeT},set(v){fakeT=v}});
Object.defineProperty(audio,'duration',{get(){return 120}});
*/


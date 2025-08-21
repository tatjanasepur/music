/* Minimal karaoke engine:
   - učitava LRC (linijski tajming)
   - skroluje do aktivne linije
   - “puni” tekst levo→desno tokom trajanja linije
   - radi i bez spoljnog .lrc (dugme učita demo) */

const audio = document.getElementById('audio');
const lyricsEl = document.getElementById('lyrics');
const loadBtn = document.getElementById('loadExample');

// DEMO LRC (zameni svojim .lrc fajlom ili tekstom)
const demoLRC = `
[00:00.00]  (Intro)
[00:07.00]  I code the rhythm as it flows
[00:12.50]  Lines of light and audio
[00:18.00]  Watch the lyrics come alive
[00:23.40]  This is T•Solutions vibe
[00:28.50]  (Instrumental)
`;

// Ako imaš fajl "lyrics.lrc" u repo-u, odkomentariši sledeće dve linije
//window.addEventListener('load', () => fetchLRC('lyrics.lrc'));
loadBtn.addEventListener('click', () => setLRC(demoLRC.trim()));

// Parser LRC
function parseLRC(text){
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const matches = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]\s*(.*)/g)];
    for (const m of matches) {
      const min = +m[1], sec = +m[2], cs = +(m[3]||0);
      const time = min*60 + sec + cs/100;
      const line = m[4].trim();
      out.push({time, line});
    }
  }
  out.sort((a,b)=>a.time-b.time);
  // trajanje linije = do vremena sledeće (fallback 2.5s)
  for (let i=0;i<out.length;i++){
    out[i].end = (i<out.length-1 ? out[i+1].time : out[i].time+2.5);
    if (out[i].end <= out[i].time) out[i].end = out[i].time + 2.5;
  }
  return out;
}

function setLRC(text){
  const lines = parseLRC(text);
  if (!lines.length){
    lyricsEl.innerHTML = `<div class="placeholder">Nije nađen sadržaj u LRC-u.</div>`;
    return;
  }
  // Render
  lyricsEl.innerHTML = '';
  const nodes = lines.map(({line})=>{
    const el = document.createElement('div');
    el.className = 'line';
    el.innerHTML = `<span class="base">${escapeHTML(line)}</span>
                    <span class="fill">${escapeHTML(line)}</span>`;
    lyricsEl.appendChild(el);
    return el;
  });

  // Petlja
  let idx = 0;
  function frame(){
    const t = audio.currentTime || 0;
    // pronađi trenutnu liniju
    while (idx < lines.length-1 && t >= lines[idx+1].time - 0.01) idx++;
    while (idx > 0 && t < lines[idx].time - 0.01) idx--;

    nodes.forEach((el,i)=>el.classList.toggle('active', i===idx));
    // auto-scroll (centar)
    const active = nodes[idx];
    if (active){
      const box = lyricsEl.getBoundingClientRect();
      const elr = active.getBoundingClientRect();
      const delta = elr.top - box.top - box.height*0.45;
      if (Math.abs(delta) > 2) lyricsEl.scrollBy({top: delta, behavior:'smooth'});
      // karaoke “fill”: procenat od starta do kraja linije
      const start = lines[idx].time, end = lines[idx].end;
      const p = Math.max(0, Math.min(1, (t - start) / (end - start)));
      const fill = active.querySelector('.fill');
      if (fill) fill.style.backgroundSize = (p*100).toFixed(1) + '% 100%';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// (opciono) učitaj eksterni LRC fajl
async function fetchLRC(path){
  try{
    const res = await fetch(path);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    setLRC(text);
  }catch(e){
    lyricsEl.innerHTML = `<div class="placeholder">Ne mogu da učitam <code>${path}</code>. Klikni “Load demo LRC”.</div>`;
  }
}

function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}

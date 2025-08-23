/* Search & Play: YouTube + auto-lyrics (LRCLIB) + karaoke fill */

// ===== DOM =====
const audio = document.getElementById('audio'); // fallback (nije obavezno)
const playBtn = document.getElementById('play');
const seek = document.getElementById('seek');
const vol = document.getElementById('vol');
const cur = document.getElementById('cur');
const dur = document.getElementById('dur');
const lyricsEl = document.getElementById('lyrics');
const loadDemo = document.getElementById('loadDemo');
const loadFile = document.getElementById('loadFile');
const fileInput = document.getElementById('fileInput');

const q = document.getElementById('q');
const searchPlay = document.getElementById('searchPlay');
const songTitleEl = document.getElementById('songTitle');
const songArtistEl = document.getElementById('songArtist');
const coverEl = document.getElementById('cover');

// ===== CONFIG: ubaci svoj YouTube Data API key (https://console.cloud.google.com/apis/library/youtube.googleapis.com) =====
const YT_API_KEY = 'PASTE_YOUR_YOUTUBE_DATA_API_KEY_HERE'; // ← OBAVEZNO ako želiš pretragu samo po tekstu

// ===== Helpers =====
const z = s => s.toString().padStart(2,'0');
const fmt = t => `${Math.floor(t/60)}:${z(Math.floor(t%60))}`;
function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}

// Heuristika "Artist – Song"
function parseQueryForArtistTitle(input){
  let s = input.trim();
  try { new URL(s); return null; } catch {} // ako je URL, vrati null
  const sep = s.includes(' – ') ? ' – ' : (s.includes(' - ') ? ' - ' : null);
  if(!sep) return { artist:'', title:s };
  const [artist, title] = s.split(sep, 2).map(x=>x.trim());
  return { artist, title };
}

// LRC parsing
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

// Plain → meki tajming
function makeSoftTimedLines(plain){
  const lines = plain.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const base = 2.8;
  return lines.map((line,i)=>({ time: i*base, end: (i+1)*base, line }));
}
function toLRC(lines){
  return lines.map(x=>{
    const m = Math.floor(x.time/60), s = Math.floor(x.time%60), cs = Math.floor((x.time%1)*100);
    return `[${z(m)}:${z(s)}.${z(cs)}] ${x.line}`;
  }).join('\n');
}

// Render
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

// ===== State =====
let LINES = [];
let NODES = [];
let idx = 0;

// ===== YouTube adapter =====
let ytPlayer = null;
let ytReady = false;
let usingYouTube = true; // podrazumevano koristimo YT

window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player('yt', {
    videoId: null,
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1 },
    events: {
      onReady: () => { ytReady = true; },
      onStateChange: (e) => {
        if(e.data === YT.PlayerState.PLAYING){ audio.dispatchEvent(new Event('play')); }
        if(e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED){ audio.dispatchEvent(new Event('pause')); }
      }
    }
  });
};

const audioAdapter = {
  get paused(){ return usingYouTube ? (ytReady ? ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING : true) : audio.paused; },
  play(){ usingYouTube && ytReady ? ytPlayer.playVideo() : audio.play(); },
  pause(){ usingYouTube && ytReady ? ytPlayer.pauseVideo() : audio.pause(); },
  get currentTime(){ return usingYouTube && ytReady ? ytPlayer.getCurrentTime() : (audio.currentTime || 0); },
  set currentTime(v){ usingYouTube && ytReady ? ytPlayer.seekTo(v, true) : (audio.currentTime = v); },
  get duration(){ return usingYouTube && ytReady ? (ytPlayer.getDuration() || 0) : (audio.duration || 0); },
  set volume(v){ usingYouTube && ytReady ? ytPlayer.setVolume(Math.round(v*100)) : (audio.volume = v); }
};
function A(){ return audioAdapter; }

// ===== Controls =====
playBtn.addEventListener('click', ()=>{ if(A().paused){ A().play(); } else { A().pause(); }});
audio.addEventListener('play', ()=> playBtn.textContent='⏸');
audio.addEventListener('pause',()=> playBtn.textContent='▶');

audio.addEventListener('loadedmetadata', ()=>{
  seek.max = audio.duration || 0;
  dur.textContent = fmt(audio.duration || 0);
});

let lastDurSet = 0;
function syncUI(){
  const d = A().duration || 0;
  if(d && d !== lastDurSet){
    lastDurSet = d;
    seek.max = d;
    dur.textContent = fmt(d);
  }
}

seek.addEventListener('input', ()=>{ seek.dragging=true; });
seek.addEventListener('change', ()=>{ A().currentTime = +seek.value; seek.dragging=false; });
vol.addEventListener('input', ()=> A().volume = +vol.value);

// ===== Demo/file loaders =====
const demoLRC = `
[00:00.00] (Intro)
[00:07.00] I code the rhythm as it flows
[00:12.40] Lines of light and audio
[00:17.80] Watch the lyrics come alive
[00:23.10] This is T•Solutions vibe
[00:28.50] (Instrumental)
`;
loadDemo.addEventListener('click', ()=> setLRC(demoLRC));
loadFile.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const text = await f.text(); setLRC(text);
});

// ===== Search & Play (Enter + klik) =====
q.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') searchPlay.click(); });
searchPlay.addEventListener('click', async ()=>{
  const query = q.value.trim();
  if(!query){ return; }
  if(!ytReady){ alert('YouTube player se učitava, probaj za sekund.'); return; }

  // 1) Nadji video na YouTube (po nazivu)
  const video = await searchYouTubeFirstVideo(query);
  if(!video){ alert('Nije nađen video. Pokušaj precizniji naziv.'); return; }

  // 2) Pusti video + postavi trajanje + cover
  ytPlayer.loadVideoById(video.id);
  setTimeout(syncUI, 1200);
  applyMetaFromVideo(video);

  // 3) Automatski povuci lyrics (artist/title heuristika)
  const guess = parseQueryForArtistTitle(video.title || query) || {artist:'', title: video.title || query};
  const lrc = await fetchLyricsFromLRCLIB(guess);
  if(lrc){ setLRC(lrc); } else {
    // fallback: pokušaj sa onim što je korisnik upisao
    const at2 = parseQueryForArtistTitle(query) || {artist:'', title:query};
    const lrc2 = await fetchLyricsFromLRCLIB(at2);
    if(lrc2) setLRC(lrc2);
    else lyricsEl.innerHTML = `<div class="placeholder">Lyrics nisu nađeni za: ${escapeHTML(video.title)}</div>`;
  }

  // auto-play
  A().play();
});

// YouTube pretraga
async function searchYouTubeFirstVideo(query){
  // ako korisnik nalepi YouTube URL, izvuci ID i vrati "lažni" objekat
  const maybeId = extractYouTubeID(query);
  if(maybeId){
    const title = await fetchOEmbedTitle(maybeId).catch(()=>null);
    return {
      id: maybeId,
      title: title || query,
      thumb: `https://img.youtube.com/vi/${maybeId}/hqdefault.jpg`,
      channel: ''
    };
  }
  if(!YT_API_KEY || YT_API_KEY.includes('PASTE_YOUR')) return null;

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: '1',
    key: YT_API_KEY
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if(!r.ok) return null;
  const data = await r.json();
  const item = data.items?.[0];
  if(!item) return null;
  const id = item.id?.videoId;
  const sn = item.snippet || {};
  return {
    id,
    title: sn.title || query,
    thumb: sn.thumbnails?.high?.url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    channel: sn.channelTitle || ''
  };
}

function extractYouTubeID(url){
  try{
    const u = new URL(url);
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if(u.hostname === 'youtu.be') return u.pathname.substring(1);
  }catch{}
  return null;
}
async function fetchOEmbedTitle(id){
  const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
  if(!r.ok) return null;
  const j = await r.json();
  return j.title || null;
}

function applyMetaFromVideo(v){
  songTitleEl.textContent = v.title || 'YouTube';
  songArtistEl.textContent = v.channel || '—';
  coverEl.style.background = `
    linear-gradient(0deg, rgba(0,0,0,.3), rgba(0,0,0,.1)),
    url('${v.thumb}') center/cover no-repeat,
    linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))
  `;
  coverEl.style.boxShadow = '0 20px 50px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.06)';
  coverEl.style.borderRadius = '18px';
}

// LRCLIB fetch
async function fetchLyricsFromLRCLIB({artist, title}){
  try{
    const u = new URL('https://lrclib.net/api/get');
    u.searchParams.set('track_name', title);
    if(artist) u.searchParams.set('artist_name', artist);
    const r = await fetch(u.toString());
    if(!r.ok) return null;
    const data = await r.json();
    if(data?.syncedLyrics) return data.syncedLyrics;
    if(data?.plainLyrics){
      const soft = makeSoftTimedLines(data.plainLyrics);
      return toLRC(soft);
    }
  }catch(e){}
  return null;
}

// Karaoke core
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
  const t = A().currentTime || 0;
  if(!seek.dragging){ seek.value = t; }
  cur.textContent = fmt(t);
  syncUI();

  while(idx < LINES.length-1 && t >= LINES[idx+1].time - 0.01) idx++;
  while(idx > 0 && t < LINES[idx].time - 0.01) idx--;

  if(NODES.length){
    NODES.forEach((el,i)=> el.classList.toggle('active', i===idx));
    const active = NODES[idx];
    if(active){
      const box = lyricsEl.getBoundingClientRect();
      const r = active.getBoundingClientRect();
      const delta = r.top - box.top - box.height*0.45;
      if(Math.abs(delta) > 2) lyricsEl.scrollBy({top: delta, behavior:'smooth'});

      const start = LINES[idx].time, end = LINES[idx].end;
      const p = Math.max(0, Math.min(1, (t - start) / (end - start)));
      const fill = active.querySelector('.fill');
      if(fill) fill.style.backgroundSize = (p*100).toFixed(1) + '% 100%';
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Init demo
setLRC(demoLRC);


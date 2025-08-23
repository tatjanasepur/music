/************** 1) Tvoj YouTube API ključ **************/
const YT_API_KEY = 'AIzaSyA83EhnWEfgqd-ejMqT_NkZJ23kte8-MV8';

/************** 2) DOM **************/
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

const q = document.getElementById('q');
const clearBtn = document.getElementById('clear');
const searchPlay = document.getElementById('searchPlay');
const songTitleEl = document.getElementById('songTitle');
const songArtistEl = document.getElementById('songArtist');
const coverEl   = document.getElementById('cover');
const resultsEl = document.getElementById('results');

/************** 3) Helpers **************/
const z = s => s.toString().padStart(2,'0');
const fmt = t => `${Math.floor(t/60)}:${z(Math.floor(t%60))}`;
const escapeHTML = s => s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
function setButtonLoading(){ searchPlay.disabled = true; searchPlay.textContent = 'Loading…'; }
function setButtonIdle(){ searchPlay.disabled = false; searchPlay.textContent = 'Search'; }
function parseQueryForArtistTitle(input){
  let s = input.trim();
  try { new URL(s); return null; } catch {}
  const sep = s.includes(' – ') ? ' – ' : (s.includes(' - ') ? ' - ' : null);
  if(!sep) return { artist:'', title:s };
  const [artist, title] = s.split(sep, 2).map(x=>x.trim());
  return { artist, title };
}

/************** 4) LRC **************/
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
function makeSoftTimedLines(plain){
  const lines = plain.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const base = 2.8;
  return lines.map((line,i)=>({ time: i*base, end: (i+1)*base, line }));
}
const toLRC = lines => lines.map(x=>{
  const m = Math.floor(x.time/60), s = Math.floor(x.time%60), cs = Math.floor((x.time%1)*100);
  return `[${z(m)}:${z(s)}.${z(cs)}] ${x.line}`;
}).join('\n');
function render(lines){
  lyricsEl.innerHTML='';
  const nodes = lines.map(({line})=>{
    const row = document.createElement('div');
    row.className='line';
    row.innerHTML = `<span class="base">${escapeHTML(line)}</span><span class="fill">${escapeHTML(line)}</span>`;
    lyricsEl.appendChild(row); return row;
  });
  return nodes;
}

/************** 5) Karaoke state & loop **************/
let LINES = []; let NODES = []; let idx = 0;
function setLRC(text){
  LINES = parseLRC(text);
  if(!LINES.length){
    lyricsEl.innerHTML = `<div class="placeholder">No timed lines found.</div>`;
    return;
  }
  NODES = render(LINES); idx = 0;
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

/************** 6) YouTube player (robust + nocookie) **************/
let ytPlayer = null, ytReady = false, usingYouTube = true;
function initYTPlayer(){
  ytPlayer = new YT.Player('yt', {
    host: 'https://www.youtube-nocookie.com',
    videoId: null,
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1 },
    events: {
      onReady: () => { ytReady = true; setButtonIdle(); },
      onStateChange: (e) => {
        if(e.data === YT.PlayerState.PLAYING){ audio.dispatchEvent(new Event('play')); }
        if(e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED){ audio.dispatchEvent(new Event('pause')); }
      }
    }
  });
}
window.onYouTubeIframeAPIReady = ()=> initYTPlayer();

async function ensureYTAPI(timeout=15000){
  if (window.YT && YT.Player) return true;
  if(![...document.scripts].some(s=>s.src.includes('iframe_api'))){
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
  const start = Date.now();
  return await new Promise(res=>{
    const t = setInterval(()=>{
      if(window.YT && YT.Player){ clearInterval(t); if(!ytPlayer) initYTPlayer(); res(true); }
      else if(Date.now()-start>timeout){ clearInterval(t); res(false); }
    },120);
  });
}

const A = ()=>({
  get paused(){ return usingYouTube ? (ytReady ? ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING : true) : audio.paused; },
  play(){ usingYouTube && ytReady ? ytPlayer.playVideo() : audio.play(); },
  pause(){ usingYouTube && ytReady ? ytPlayer.pauseVideo() : audio.pause(); },
  get currentTime(){ return usingYouTube && ytReady ? ytPlayer.getCurrentTime() : (audio.currentTime || 0); },
  set currentTime(v){ usingYouTube && ytReady ? ytPlayer.seekTo(v,true) : (audio.currentTime=v); },
  get duration(){ return usingYouTube && ytReady ? (ytPlayer.getDuration() || 0) : (audio.duration || 0); },
  set volume(v){ usingYouTube && ytReady ? ytPlayer.setVolume(Math.round(v*100)) : (audio.volume=v); }
});

/************** 7) Transport **************/
playBtn.addEventListener('click', ()=>{ if(A().paused){ A().play(); } else { A().pause(); }});
audio.addEventListener('play', ()=> playBtn.textContent='⏸');
audio.addEventListener('pause',()=> playBtn.textContent='▶');
audio.addEventListener('loadedmetadata', ()=>{ seek.max = audio.duration || 0; dur.textContent = fmt(audio.duration || 0); });
let lastDurSet = 0;
function syncUI(){ const d = A().duration || 0; if(d && d !== lastDurSet){ lastDurSet = d; seek.max = d; dur.textContent = fmt(d); } }
seek.addEventListener('input', ()=>{ seek.dragging=true; });
seek.addEventListener('change', ()=>{ A().currentTime = +seek.value; seek.dragging=false; });
vol.addEventListener('input', ()=> A().volume = +vol.value);

/************** 8) Search — lista kao na YouTube **************/
q.addEventListener('keydown', e=>{ if(e.key === 'Enter') searchPlay.click(); });
clearBtn.addEventListener('click', ()=>{ q.value=''; q.focus(); });

searchPlay.addEventListener('click', async ()=>{
  const query = q.value.trim();
  if(!query) return;

  // 0) Ako je direkt YouTube link/ID — napravi "listu" sa jednim rezultatom
  const pasteId = extractYouTubeID(query);
  if(pasteId){
    renderResults([{ id: pasteId, title: query, channel: '', thumb: `https://img.youtube.com/vi/${pasteId}/mqdefault.jpg` }]);
    return;
  }

  setButtonLoading();

  // 1) Pokušaj YouTube Data API
  let list = await searchYouTubeList(query, 8);

  // 2) Ako nema/greška → fallback na Piped
  if(!list || list.length === 0){
    list = await searchPipedList(query, 8);
  }

  setButtonIdle();

  if(!list || list.length === 0){
    resultsEl.innerHTML = `<div class="msg">Nije nađen video (API i fallback nisu vratili rezultate). Pokušaj preciznije ili nalepi direkt YouTube link.</div>`;
    return;
  }
  renderResults(list);
});

function renderResults(list){
  resultsEl.innerHTML = '';
  for(const v of list){
    const card = document.createElement('div');
    card.className = 'result';
    card.innerHTML = `
      <img class="thumb" src="${v.thumb}" alt="">
      <div class="meta">
        <div class="title">${escapeHTML(v.title)}</div>
        <div class="chan">${escapeHTML(v.channel || '')}</div>
      </div>
    `;
    card.addEventListener('click', ()=> playVideo(v));
    resultsEl.appendChild(card);
  }
}

async function playVideo(v){ await playVideoById(v.id, v.title, v.channel, v.thumb); }
async function playVideoById(id, title='', channel='', thumb=''){
  const ok = await ensureYTAPI(15000);
  if(!ok){
    resultsEl.insertAdjacentHTML('afterbegin',
      `<div class="msg">YouTube player je blokiran (ad-block?). Isključi blokatore za <b>github.io</b> i osveži.</div>`);
    return;
  }
  ytPlayer.loadVideoById(id);
  setTimeout(syncUI, 1200);

  applyMetaFromVideo({id, title, channel, thumb});
  const guess = parseQueryForArtistTitle(title) || {artist:'', title};
  const lrc = await fetchLyricsFromLRCLIB(guess);
  if(lrc){ setLRC(lrc); }
  else{
    const at2 = parseQueryForArtistTitle(q.value.trim()) || {artist:'', title:q.value.trim()};
    const lrc2 = await fetchLyricsFromLRCLIB(at2);
    if(lrc2) setLRC(lrc2);
    else lyricsEl.innerHTML = `<div class="placeholder">Lyrics nisu nađeni za: ${escapeHTML(title || id)}</div>`;
  }
  A().play();
}

/************** 9) Pretrage **************/
async function searchYouTubeList(query, maxResults=8){
  try{
    if(!YT_API_KEY) return null;
    const params = new URLSearchParams({
      part:'snippet', q:query, type:'video', maxResults:String(maxResults), key:YT_API_KEY
    });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if(!r.ok){ console.warn('YT search error', r.status, await r.text()); return null; }
    const data = await r.json();
    return (data.items||[]).map(it=>{
      const id = it.id?.videoId;
      const sn = it.snippet || {};
      return {
        id,
        title: sn.title || '',
        channel: sn.channelTitle || '',
        thumb: sn.thumbnails?.medium?.url || (id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '')
      };
    });
  }catch(e){
    console.error('YT search exception', e);
    return null;
  }
}

// Fallback preko Piped (bez API ključa)
async function searchPipedList(query, maxResults=8){
  const hosts = [
    'https://piped.video',
    'https://piped.projectsegfau.lt',
    'https://piped.video' // ponovi kao rezerva
  ];
  for(const host of hosts){
    try{
      const r = await fetch(`${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video&region=RS`);
      if(!r.ok) continue;
      const arr = await r.json();
      const out = arr.slice(0, maxResults).map(it=>{
        const id = it.id || (it.url ? (new URL(it.url, host)).searchParams.get('v') : null);
        const thumb = it.thumbnail || (id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '');
        return { id, title: it.title || '', channel: it.uploaderName || '', thumb };
      }).filter(x=>x.id);
      if(out.length) return out;
    }catch(e){ /* probaj sledeći host */ }
  }
  return null;
}

function extractYouTubeID(url){
  try{
    const u = new URL(url);
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if(u.hostname === 'youtu.be') return u.pathname.substring(1);
  }catch{}
  return null;
}

function applyMetaFromVideo(v){
  songTitleEl.textContent = v.title || 'YouTube';
  songArtistEl.textContent = v.channel || '—';
  if(v.thumb){
    coverEl.style.background = `
      linear-gradient(0deg, rgba(0,0,0,.35), rgba(0,0,0,.1)),
      url('${v.thumb}') center/cover no-repeat,
      linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))
    `;
  }
}

/************** 10) LRCLIB **************/
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

/************** 11) Demo & file import **************/
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

/************** 12) Init **************/
setLRC(demoLRC);

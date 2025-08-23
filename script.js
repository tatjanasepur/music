/* Spotify-like karaoke engine + YouTube + LRCLIB
   - YouTube IFrame API za reprodukciju (URL ili pretraga)
   - LRCLIB API za lyrics (synced ili plain -> auto timing)
   - Tvoj UI/animacije ostaju
*/

// ===== DOM =====
const audio = document.getElementById('audio');          // fallback za lokalni mp3
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
const findPlay = document.getElementById('findPlay');
const getLyricsBtn = document.getElementById('getLyrics');
const songTitleEl = document.getElementById('songTitle');
const songArtistEl = document.getElementById('songArtist');
const coverEl = document.getElementById('cover');

// ===== Demo LRC =====
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
function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}

// Parse "Artist – Song" u {artist, title}
function parseQueryForArtistTitle(input){
  let s = input.trim();
  // ako je URL, vrati null (posebno se rešava)
  try { new URL(s); return null; } catch {}
  // razdvajanje po dash
  const sep = s.includes(' – ') ? ' – ' : (s.includes(' - ') ? ' - ' : null);
  if(!sep) return { artist:'', title:s };
  const [artist, title] = s.split(sep, 2).map(x=>x.trim());
  return { artist, title };
}

// ===== LRC parsing =====
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

// Ako imamo plain lyrics (bez tajminga), napravi "meki" timing:
function makeSoftTimedLines(plain){
  const lines = plain
    .split(/\r?\n/)
    .map(s=>s.trim())
    .filter(Boolean);
  const base = 2.8; // sekundi po liniji (pristojno za čitanje)
  return lines.map((line,i)=>({ time: i*base, end: (i+1)*base, line }));
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
let usingYouTube = false;

window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player('yt', {
    videoId: null,
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1 },
    events: {
      onReady: () => { ytReady = true; },
      onStateChange: (e) => {
        if(e.data === YT.PlayerState.PLAYING){
          audio.dispatchEvent(new Event('play'));
        }
        if(e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED){
          audio.dispatchEvent(new Event('pause'));
        }
      }
    }
  });
};

// Proxy sloj da naš engine koristi i YT i <audio>
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

// Za <audio> dobijamo metadata event; za YT ćemo postaviti trajanje kad učitamo video
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

// Seek/vol
seek.addEventListener('input', ()=>{ seek.dragging=true; });
seek.addEventListener('change', ()=>{ A().currentTime = +seek.value; seek.dragging=false; });
vol.addEventListener('input', ()=> A().volume = +vol.value);

// ===== Loaders (demo/file) =====
loadDemo.addEventListener('click', ()=> setLRC(demoLRC));
loadFile.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const text = await f.text(); setLRC(text);
});

// ===== YouTube: URL ili pretraga =====
findPlay.addEventListener('click', async ()=>{
  const query = q.value.trim();
  if(!query) return;

  const id = extractYouTubeID(query);
  if(id){
    await loadYouTube(id);
    // Pokušaj da povučeš naslov preko oEmbed (da popuniš meta)
    try{
      const info = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`).then(r=>r.json());
      applyMetaFromTitle(info.title);
    }catch{}
    return;
  }

  // (OPCIONO) pretraga preko YouTube Data API (ubaci svoj ključ dole)
  const YT_API_KEY = ''; // <<< ako želiš da kucaš samo "Artist - Song", ubaci ključ
  if(!YT_API_KEY){
    alert('Nalepi YouTube URL ili postavi YT Data API ključ u script.js (YT_API_KEY).');
    return;
  }
  const vid = await searchYouTubeVideoId(query, YT_API_KEY);
  if(vid){ await loadYouTube(vid); applyMetaFromTitle(query); }
  else { alert('Nisam našla video. Probaj preciznije ili nalepi URL.'); }
});

function extractYouTubeID(url){
  try{
    const u = new URL(url);
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if(u.hostname === 'youtu.be') return u.pathname.substring(1);
  }catch{}
  return null;
}
async function searchYouTubeVideoId(query, key){
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: '1',
    key
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if(!r.ok) return null;
  const data = await r.json();
  return data.items?.[0]?.id?.videoId || null;
}
async function loadYouTube(videoId){
  if(!ytReady){ alert('YouTube player se još učitava — probaj ponovo za sekund.'); return; }
  usingYouTube = true;
  ytPlayer.loadVideoById(videoId);
  // pokušaj da postaviš duration kasnije (YT ga daje tek kad krene)
  setTimeout(()=>{ syncUI(); }, 1200);
}

// Upis meta (naslov → Artist/Title heuristika)
function applyMetaFromTitle(title){
  songTitleEl.textContent = title || 'YouTube';
  const parts = parseQueryForArtistTitle(title || '');
  if(parts && parts.artist){
    songArtistEl.textContent = parts.artist || '—';
    songTitleEl.textContent = parts.title || title;
  }
  // vizuelni cover gradient "pomeri"
  coverEl.style.background = `
    conic-gradient(from ${Math.floor(Math.random()*360)}deg, rgba(65,210,255,.28), rgba(155,107,255,.28), rgba(65,210,255,.28)),
    linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))
  `;
}

// ===== LRCLIB lyrics =====
getLyricsBtn.addEventListener('click', async ()=>{
  const input = q.value.trim();
  if(!input){ alert('Upiši "Artist – Song" ili nalepi YouTube URL.'); return; }

  // Ako je URL, probaj da izvučeš naslov preko oEmbed da dobiješ artist/title
  let artist='', title='';
  const at = parseQueryForArtistTitle(input);
  if(at){ artist = at.artist; title = at.title; }
  else {
    // URL → oEmbed → title
    const id = extractYouTubeID(input);
    if(id){
      try{
        const info = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`).then(r=>r.json());
        const guess = parseQueryForArtistTitle(info.title || '');
        if(guess){ artist = guess.artist; title = guess.title; }
        songTitleEl.textContent = info.title || 'YouTube';
      }catch{}
    }
  }

  if(!title){
    alert('Za lyrics je najbolje da upišeš: "Artist – Song".');
    return;
  }

  const lrc = await fetchLyricsFromLRCLIB({artist, title});
  if(!lrc){
    alert('Nema nađenih lyrics-a za ovo. Pokušaj drugi naziv.');
    return;
  }
  setLRC(lrc);
  // meta
  if(artist) songArtistEl.textContent = artist;
  if(title)  songTitleEl.textContent = title;
});

async function fetchLyricsFromLRCLIB({artist, title}){
  // 1) probaj synced lyrics
  try{
    const u = new URL('https://lrclib.net/api/get');
    u.searchParams.set('track_name', title);
    if(artist) u.searchParams.set('artist_name', artist);
    const r = await fetch(u.toString());
    if(r.ok){
      const data = await r.json();
      if(data?.syncedLyrics){ return data.syncedLyrics; }
      if(data?.plainLyrics){
        const soft = makeSoftTimedLines(data.plainLyrics);
        return toLRC(soft);
      }
    }
  }catch(e){}
  return null;
}

// Pomoćna: iz soft-linija napravi "lažni" LRC (da engine ostane isti)
function toLRC(lines){
  return lines.map(x=>{
    const m = Math.floor(x.time/60), s = Math.floor(x.time%60), cs = Math.floor((x.time%1)*100);
    return `[${z(m)}:${z(s)}.${z(cs)}] ${x.line}`;
  }).join('\n');
}

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
  // vreme & UI
  const t = A().currentTime || 0;
  if(!seek.dragging){ seek.value = t; }
  cur.textContent = fmt(t);
  syncUI();

  // find current line
  while(idx < LINES.length-1 && t >= LINES[idx+1].time - 0.01) idx++;
  while(idx > 0 && t < LINES[idx].time - 0.01) idx--;

  // highlight & scroll
  if(NODES.length){
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
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Init
setLRC(demoLRC);

// === OPTIONAL: fake playback bez realnog audio/YT ===
// let fakeT=0; setInterval(()=>{ fakeT+=0.1; audio.currentTime=fakeT; }, 100);
// Object.defineProperty(audio,'currentTime',{get(){return fakeT},set(v){fakeT=v}});
// Object.defineProperty(audio,'duration',{get(){return 120}});


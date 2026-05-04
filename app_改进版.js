// ============ APP ============
mapboxgl.accessToken = window.MAPBOX_TOKEN || ''; 

const DATA = JSON.parse(document.getElementById('data-json').textContent);
const WORKS = JSON.parse(document.getElementById('works-json').textContent);
const CHAPTERS = DATA.chapters;

const TWEAKS = /*EDITMODE-BEGIN*/{
  "terrainExaggeration": 1.8,
  "weatherOn": true,
  "inkOn": true,
  "sealColor": "#A83A38"
}/*EDITMODE-END*/;

// KEY PLACES — derived from all chapter events (only places Su Shi visited)
const KEY_PLACES = new Set();
CHAPTERS.forEach(ch => ch.events.forEach(ev => KEY_PLACES.add(ev.name)));
['眉山市','开封','开封市','杭州市','黄冈','黄冈市','儋州市','惠州市','常州市','镇江'].forEach(n=>KEY_PLACES.add(n));

// All unique event coordinates in chronological order (for trajectory mask)
const ALL_EVENT_COORDS = (function(){
  const seen = new Set(); const out = [];
  CHAPTERS.forEach(ch => ch.events.forEach(ev => {
    const k = ev.lng.toFixed(3)+','+ev.lat.toFixed(3);
    if(!seen.has(k)){ seen.add(k); out.push([ev.lng, ev.lat]); }
  }));
  return out;
})();

// ============ CUSTOM ANCIENT MAP STYLE ============
// green mountains (via hillshade tinted), blue rivers, pale paper land,
// key toponyms bold, others faded
function buildAncientStyle(){
  return {
    version: 8,
    name: 'ancient',
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    sources: {
      streets: {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8'
      },
      terrain: {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-terrain-v2'
      },
      'mapbox-dem': {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512, maxzoom: 14
      }
    },
    terrain: { source: 'mapbox-dem', exaggeration: TWEAKS.terrainExaggeration },
    layers: [
      // Paper land base — warm xuan-paper
      { id: 'bg', type: 'background',
        paint: { 'background-color': '#E8D9B6' } },

      // Subtle vegetation tint — only forests, gentle, won't muddy the topography
      { id: 'landcover-wood', type: 'fill', source: 'streets', 'source-layer': 'landcover',
        filter: ['==',['get','class'],'wood'],
        paint: {
          'fill-color': '#9DB37A',
          'fill-opacity': 0.32
        }
      },

      // Primary hillshade — clear, warm, v4-style topo shading
      { id: 'hillshade', type: 'hillshade', source: 'mapbox-dem',
        paint: {
          'hillshade-exaggeration': 0.5,
          'hillshade-shadow-color': '#4F6643',
          'hillshade-highlight-color': '#F1E5C5',
          'hillshade-accent-color': '#6F8F5D',
          'hillshade-illumination-direction': 315,
          'hillshade-illumination-anchor': 'viewport'
        }
      },

      // Secondary hillshade — soft greenish accent on shaded slopes (gives terrain colour without obscuring)
      { id: 'hillshade-tint', type: 'hillshade', source: 'mapbox-dem',
        paint: {
          'hillshade-exaggeration': 0.2,
          'hillshade-shadow-color': 'rgba(50,84,48,0.58)',
          'hillshade-highlight-color': 'rgba(0,0,0,0)',
          'hillshade-accent-color': 'rgba(92,132,75,0.42)',
          'hillshade-illumination-direction': 315,
          'hillshade-illumination-anchor': 'viewport'
        }
      },

      // Contour lines — subtle elevation
      { id: 'contour', type: 'line', source: 'terrain', 'source-layer': 'contour',
        paint: {
          'line-color': '#7F8C58',
          'line-width': ['interpolate',['linear'],['zoom'],6,0.15,10,0.4,14,0.7],
          'line-opacity': 0.22
        }
      },

      // Historic river surfaces only — major waters tied to Su Shi's route
      { id: 'water-historic-fill', type: 'fill', source: 'streets', 'source-layer': 'water',
        filter: ['any',
          ['in','长江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','黄河', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','Yangtze', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Yellow River', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Min Jiang', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Jialing', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Han River', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Qiantang', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Huai', ['coalesce',['get','name_en'],['get','name'],'']]
        ],
        paint: {
          'fill-color': '#5F9FC0',
          'fill-opacity': ['interpolate',['linear'],['zoom'],3,0.38,8,0.5,12,0.62]
        }
      },

      // Historic river lines — Yangtze, Yellow River, and route-region rivers
      { id: 'waterway-historic-rivers', type: 'line', source: 'streets', 'source-layer': 'waterway',
        filter: ['all', ['in', ['get','class'], ['literal',['river','canal']]], ['any',
          ['in','长江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','黄河', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','岷江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','嘉陵江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','汉江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','汉水', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','汴河', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','淮河', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','钱塘江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','富春江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','Yangtze', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Chang Jiang', ['coalesce',['get','name'],['get','name_en'],'']],
          ['in','Jinsha', ['coalesce',['get','name'],['get','name_en'],'']],
          ['in','Yellow River', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Huang He', ['coalesce',['get','name'],['get','name_en'],'']],
          ['in','Min Jiang', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Jialing', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Han River', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Han Shui', ['coalesce',['get','name'],['get','name_en'],'']],
          ['in','Huai', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Qiantang', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Fuchun', ['coalesce',['get','name_en'],['get','name'],'']]
        ]],
        paint: {
          'line-color': ['interpolate',['linear'],['zoom'],3,'#6BA9C7',7,'#3E87AA',12,'#2F6F94'],
          'line-width': ['interpolate',['linear'],['zoom'],3,1.3,6,2.4,9,4.6,12,6.2],
          'line-opacity': 0.9
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      },

      // National boundary
      { id: 'admin-boundary', type: 'line', source: 'streets', 'source-layer': 'admin',
        filter: ['all', ['==',['get','admin_level'],0], ['==',['get','maritime'],'false']],
        paint: {
          'line-color': '#6B4A2E',
          'line-width': ['interpolate',['linear'],['zoom'],3,0.6,8,1.1,12,1.6],
          'line-opacity': 0.45,
          'line-dasharray': [3,2]
        }
      },
      { id: 'admin-subnational', type: 'line', source: 'streets', 'source-layer': 'admin',
        filter: ['==',['get','admin_level'],1],
        paint: {
          'line-color': '#8F7D5E',
          'line-width': ['interpolate',['linear'],['zoom'],4,0.2,10,0.5],
          'line-opacity': 0.3,
          'line-dasharray': [1,3]
        }
      },

      // No place_label layers — labels come only from custom event markers,
      // so unrelated regions still show terrain but no toponyms.
    ]
  };
}

let map;
let currentChapter = -1;
let navigating = false;
let visited = new Set();
let markers = [];
let utaiShown = false;
let firstLoad = true;
let ribbonHitPoints = [];

function start(){
  document.getElementById('title-stage').classList.add('gone');
  setTimeout(()=>{
    document.getElementById('stage').classList.add('on');
    currentChapter = -1; // ensure goto(0) doesn't short-circuit
    goto(0, true);
  }, 800);
}
function restart(){
  document.getElementById('ending').classList.remove('on');
  document.getElementById('title-stage').classList.remove('gone');
  document.getElementById('stage').classList.remove('on');
  document.getElementById('goto-ending').classList.remove('on');
  currentChapter = -1; visited.clear(); utaiShown=false;
  hideAllPoems();
  document.querySelectorAll('.w-layer').forEach(l=>l.classList.remove('on'));
  document.getElementById('ink-layer').innerHTML='';
}

function initMap(){
  map = new mapboxgl.Map({
    container:'map',
    style: buildAncientStyle(),
    center:[112,32],
    zoom:4.3,
    pitch:0,
    bearing:0,
    projection:'mercator',
    attributionControl:false,
    logoPosition:'bottom-right'
  });

  map.addControl(new mapboxgl.AttributionControl({compact:true}), 'bottom-right');

  let mapReady = false;
  const finishMapLoad = ()=>{
    if(mapReady) return;
    mapReady = true;
    try{ addTrailSources(); }catch(e){ console.warn('trail init skipped', e); }
    document.getElementById('loader').classList.add('gone');
  };

  map.on('load', finishMapLoad);
  map.on('idle', finishMapLoad);
  map.on('error', e=>{
    console.warn('map resource error', e && e.error ? e.error : e);
    setTimeout(finishMapLoad, 800);
  });
  setTimeout(finishMapLoad, 5000);
  map.on('style.load', ()=>{
    try{ map.setTerrain({source:'mapbox-dem', exaggeration:TWEAKS.terrainExaggeration}); }catch(e){}
  });
}

function addTrailSources(){
  if(!map.getSource('trail')){
    map.addSource('trail',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'trail-glow',type:'line',source:'trail',
      paint:{'line-color':'#C89B5E','line-width':6,'line-blur':6,'line-opacity':0.5},
      layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:'trail-line',type:'line',source:'trail',
      paint:{'line-color':'#A83A38','line-width':2,'line-opacity':0.92,'line-dasharray':[2,1.5]},
      layout:{'line-cap':'round','line-join':'round'}});
  }
  if(!map.getSource('past-trail')){
    map.addSource('past-trail',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'past-line',type:'line',source:'past-trail',
      paint:{'line-color':'#8F7D5E','line-width':1.2,'line-opacity':0.42,'line-dasharray':[1,2]},
      layout:{'line-cap':'round','line-join':'round'}}, 'trail-glow');
  }
}

function restyleForChapter(idx){
  const ch = CHAPTERS[idx];
  const veil = document.getElementById('map-veil');
  let tint = 'rgba(120,80,30,.18)';
  if(ch.weather.includes('rain')) tint='rgba(15,20,35,.45)';
  else if(ch.weather.includes('moon')) tint='rgba(5,10,25,.50)';
  else if(ch.weather.includes('heat')) tint='rgba(140,60,20,.22)';
  else if(ch.weather.includes('sea')) tint='rgba(30,60,80,.28)';
  veil.style.background = `radial-gradient(ellipse 110% 80% at 50% 50%, transparent 55%, ${tint} 100%),
    repeating-linear-gradient(0deg, rgba(120,95,50,.022) 0 2px, transparent 2px 5px),
    repeating-linear-gradient(90deg, rgba(120,95,50,.018) 0 2px, transparent 2px 6px)`;
}

function goto(idx, instant=false){
  if(idx<0 || idx>=CHAPTERS.length) return;
  if(idx === currentChapter && !instant) return;
  if(navigating && !instant) return;
  navigating = true;
  const prev = currentChapter;
  currentChapter = idx;
  visited.add(idx);

  if(idx===3 && prev<3 && !utaiShown){
    showUtai(()=>{ utaiShown=true; doGoto(idx, instant); });
    return;
  }
  doGoto(idx, instant);

  // show ending trigger on last chapter
  if(idx === CHAPTERS.length-1){
    setTimeout(()=>document.getElementById('goto-ending').classList.add('on'), 3200);
  } else {
    document.getElementById('goto-ending').classList.remove('on');
  }
}

function doGoto(idx, instant){
  const ch = CHAPTERS[idx];
  restyleForChapter(idx);

  hideAllPoems();
  const plate = document.getElementById('plate');
  plate.style.opacity=0; plate.style.transform='translateX(12px)';
  setTimeout(()=>{
    document.getElementById('pl-eyebrow').textContent = `CHAPTER ${ch.en}`;
    document.getElementById('pl-chapter').innerHTML = `<span class="numeral">${ch.numeral}</span>${ch.title}`;
    document.getElementById('pl-period').textContent = ch.period;
    document.getElementById('pl-narrative').textContent = ch.narrative;
    document.getElementById('tri-ru').style.transform = `scaleX(${ch.ru})`;
    document.getElementById('tri-dao').style.transform = `scaleX(${ch.dao})`;
    document.getElementById('tri-fo').style.transform = `scaleX(${ch.fo})`;
    plate.style.opacity=1; plate.style.transform='translateX(0)';
  }, 400);

  const seal = document.getElementById('stage-seal');
  const sealBox = document.getElementById('stage-seal-box');
  seal.classList.remove('on');
  setTimeout(()=>{
    sealBox.textContent = ch.seal;
    sealBox.style.background = TWEAKS.sealColor;
    seal.classList.add('on');
  }, 900);

  flyToChapter(ch, instant);
  applyWeather(ch.weather);
  applyInk(ch.ink);
  drawChapterMarkers(idx);
  drawPastTrails(idx);
  updateRail(idx);
  updateNavBtns();

  // POEMS — delayed but not dependent on map load state
  const poemDelay = instant ? 2800 : 3600;
  setTimeout(()=>showPoems(ch.poems), poemDelay);

  drawRibbon(idx);
  setTimeout(()=>{ navigating=false; }, instant?3500:4400);
}

// Song dynasty wide view — every chapter opens here before flying in
const SONG_OVERVIEW = { center:[113, 32], zoom:3.6, pitch:15, bearing:0 };

function flyToChapter(ch, instant){
  // Free zoom + free panning at all times (mouse wheel works without restriction)
  map.setMaxBounds(null);
  map.setMinZoom(2);
  map.setMaxZoom(14);

  if(instant){
    // First show the wide Song map, then ease in to the chapter region
    map.jumpTo(SONG_OVERVIEW);
    setTimeout(()=>{
      map.flyTo({
        center:ch.center, zoom:ch.zoom, pitch:ch.pitch, bearing:ch.bearing,
        duration:2600, essential:true, curve:1.6
      });
    }, 700);
  } else {
    // Pull back to overview first, hold briefly, then fly in
    map.flyTo({
      ...SONG_OVERVIEW,
      duration:1600, essential:true, curve:1.4
    });
    setTimeout(()=>{
      map.flyTo({
        center:ch.center, zoom:ch.zoom, pitch:ch.pitch, bearing:ch.bearing,
        duration:2600, essential:true, curve:1.6
      });
    }, 1700);
  }
}

function applyWeather(types){
  document.querySelectorAll('.w-layer').forEach(l=>l.classList.remove('on'));
  if(!TWEAKS.weatherOn) return;
  types.forEach(t=>{
    const el = document.getElementById('w-'+t);
    if(el) setTimeout(()=>el.classList.add('on'), 300);
  });
}

function applyInk(inks){
  const layer = document.getElementById('ink-layer');
  layer.innerHTML='';
  if(!TWEAKS.inkOn || !inks) return;
  inks.forEach((ink,i)=>{
    const el = document.createElement('div');
    el.className = 'ink-brush' + (ink.v?' v':'');
    el.textContent = ink.c;
    el.style.left = ink.x;
    el.style.top = ink.y;
    el.style.fontSize = ink.size;
    el.style.transform = `rotate(${ink.rot}deg)`;
    el.style.color = `rgba(26,21,12,${ink.o})`;
    layer.appendChild(el);
    setTimeout(()=>el.classList.add('show'), 900 + i*400);
  });
}

function hideAllPoems(){
  document.querySelectorAll('.poem-col').forEach(p=>p.classList.remove('show'));
  setTimeout(()=>{
    const wrap = document.getElementById('poem-floats');
    if(wrap && !document.querySelector('.poem-col.show')) wrap.innerHTML='';
  }, 1400);
}
function showPoems(poems){
  const wrap = document.getElementById('poem-floats');
  wrap.innerHTML='';
  if(!poems) return;
  // Triangle layout: primary on the left, secondary upper-right, tertiary lower-right.
  // Positioning is purely controlled by .primary/.secondary/.tertiary CSS.
  poems.forEach((p,i)=>{
    const el = document.createElement('div');
    el.className = 'poem-col ' + p.r;
    el.innerHTML = `<div class="pc-title">${p.t}</div><div class="pc-body">${p.b}</div>`;
    wrap.appendChild(el);
    void el.offsetWidth;
    setTimeout(()=>el.classList.add('show'), i*650 + 100);
  });
}

function drawChapterMarkers(idx){
  markers.forEach(m=>m.remove()); markers=[];
  const ch = CHAPTERS[idx];
  const coords = [];
  ch.events.forEach(ev=>{
    coords.push([ev.lng, ev.lat]);
    const wrap = document.createElement('div');
    wrap.className = 'evt-wrap';
    const dot = document.createElement('div');
    dot.className = 'evt-dot';
    const lbl = document.createElement('div');
    lbl.className = 'evt-label';
    lbl.textContent = ev.name;
    wrap.appendChild(dot); wrap.appendChild(lbl);
    const popup = new mapboxgl.Popup({offset:20, closeButton:false}).setHTML(
      `<div class="pop"><div class="pop-year">${ev.year}</div><div class="pop-name">${ev.name}</div><div class="pop-desc">${ev.desc}</div></div>`
    );
    const marker = new mapboxgl.Marker({element:wrap, anchor:'left'})
      .setLngLat([ev.lng, ev.lat]).setPopup(popup).addTo(map);
    markers.push(marker);
  });
  if(coords.length>1 && map.getSource('trail')){
    map.getSource('trail').setData({
      type:'FeatureCollection',
      features:[curvedFeature(coords)]
    });
  } else if(map.getSource('trail')) {
    map.getSource('trail').setData({type:'FeatureCollection',features:[]});
  }
}

// Curve a polyline so it doesn't look like ruler-straight legs
function curvedFeature(coords){
  if(coords.length < 2) return {type:'Feature',geometry:{type:'LineString',coordinates:coords}};
  // Add small lateral perturbations between points to simulate real terrain-following routes
  const enriched = [coords[0]];
  for(let i=1;i<coords.length;i++){
    const a = coords[i-1], b = coords[i];
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const dist = Math.hypot(dx,dy);
    if(dist > 0.5){
      // perpendicular unit
      const px = -dy/dist, py = dx/dist;
      // alternating sway, scaled by distance, capped
      const sway = Math.min(dist*0.18, 0.9) * (i%2===0 ? 1 : -1);
      enriched.push([
        a[0] + dx*0.33 + px*sway*0.6,
        a[1] + dy*0.33 + py*sway*0.6
      ]);
      enriched.push([
        a[0] + dx*0.66 + px*sway*0.4,
        a[1] + dy*0.66 + py*sway*0.4
      ]);
    }
    enriched.push(b);
  }
  try {
    const line = turf.lineString(enriched);
    const curved = turf.bezierSpline(line, {sharpness:0.85, resolution:10000});
    return curved;
  } catch(e){
    return {type:'Feature',geometry:{type:'LineString',coordinates:enriched}};
  }
}

function drawPastTrails(idx){
  const feats = [];
  for(let i=0;i<idx;i++){
    const coords = CHAPTERS[i].events.map(ev=>[ev.lng,ev.lat]);
    if(coords.length>1) feats.push(curvedFeature(coords));
  }
  if(map.getSource('past-trail'))
    map.getSource('past-trail').setData({type:'FeatureCollection',features:feats});
}

function buildRail(){
  const rail = document.getElementById('rail-chapters');
  rail.innerHTML = '';
  CHAPTERS.forEach((ch,i)=>{
    const rc = document.createElement('div');
    rc.className = 'rc';
    rc.innerHTML = `<div class="rc-dot"></div><div class="rc-label">${ch.numeral}　${ch.title}</div>`;
    rc.onclick = ()=>goto(i);
    rail.appendChild(rc);
  });
}
function updateRail(idx){
  document.querySelectorAll('.rc').forEach((el,i)=>{
    el.classList.remove('active','visited');
    if(i===idx) el.classList.add('active');
    else if(visited.has(i)) el.classList.add('visited');
  });
}
function updateNavBtns(){
  document.getElementById('btn-prev').disabled = currentChapter<=0;
  document.getElementById('btn-next').disabled = currentChapter>=CHAPTERS.length-1;
}

function showUtai(cb){
  const u = document.getElementById('utai');
  u.classList.add('on');
  setTimeout(()=>{
    u.classList.remove('on');
    setTimeout(cb, 1200);
  }, 6200);
}

function showEnding(){
  const end = document.getElementById('ending');
  end.classList.add('on');
  // DRAW IMMEDIATELY — no delay
  requestAnimationFrame(()=>drawStarMap());
  setTimeout(()=>document.getElementById('end-epitaph').classList.add('show'), 400);
  setTimeout(()=>document.getElementById('end-thesis').classList.add('show'), 1000);
  setTimeout(()=>document.getElementById('end-restart').classList.add('show'), 1600);
}

function drawStarMap(){
  const c = document.getElementById('ending-canvas');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  const W = c.width = c.clientWidth*dpr;
  const H = c.height = c.clientHeight*dpr;
  const lats = WORKS.map(w=>w.lat), lngs = WORKS.map(w=>w.lng);
  const minLng=Math.min(...lngs)-2, maxLng=Math.max(...lngs)+2;
  const minLat=Math.min(...lats)-2, maxLat=Math.max(...lats)+2;
  const pad = 140*dpr;
  const proj = (lng,lat)=>[
    pad + (lng-minLng)/(maxLng-minLng) * (W-pad*2),
    pad + (1-(lat-minLat)/(maxLat-minLat)) * (H-pad*2)
  ];
  ctx.fillStyle = 'rgba(242,232,207,0.5)';
  for(let i=0;i<380;i++){
    const x = Math.random()*W, y=Math.random()*H;
    ctx.globalAlpha = Math.random()*0.5+0.1;
    ctx.beginPath();ctx.arc(x,y,Math.random()*0.9*dpr,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle='rgba(168,58,56,0.28)'; ctx.lineWidth=1.2*dpr;
  ctx.setLineDash([4*dpr,6*dpr]); ctx.beginPath();
  CHAPTERS.forEach((ch,i)=>{
    const [x,y] = proj(ch.center[0], ch.center[1]);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke(); ctx.setLineDash([]);
  WORKS.forEach(w=>{
    const [x,y] = proj(w.lng, w.lat);
    const total = w.ru+w.dao+w.fo;
    let col = '#F2E8CF';
    if(total>0){
      if(w.ru>=w.dao && w.ru>=w.fo) col = '#B8763E';
      else if(w.dao>=w.fo) col = '#6EB3A0';
      else col = '#6A85B8';
    }
    const r = (2 + Math.min(total,6)*0.6)*dpr;
    const grad = ctx.createRadialGradient(x,y,0,x,y,r*5);
    grad.addColorStop(0, col); grad.addColorStop(0.3, col+'80'); grad.addColorStop(1, col+'00');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x,y,r*5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#FFF5DE'; ctx.beginPath(); ctx.arc(x,y,r*0.7,0,Math.PI*2); ctx.fill();
  });
  ctx.font = `${14*dpr}px 'ZCOOL XiaoWei', serif`;
  const highlights = [
    {n:'眉山',lng:103.85,lat:30.08},{n:'汴京',lng:114.35,lat:34.80},
    {n:'黄州',lng:114.87,lat:30.45},{n:'惠州',lng:114.42,lat:23.11},
    {n:'儋州',lng:109.58,lat:19.52},{n:'常州',lng:119.97,lat:31.77}
  ];
  highlights.forEach(h=>{
    const [x,y] = proj(h.lng, h.lat);
    ctx.fillStyle = 'rgba(168,58,56,0.95)';
    ctx.beginPath(); ctx.arc(x,y,4*dpr,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(242,232,207,0.88)';
    ctx.fillText(h.n, x+8*dpr, y+5*dpr);
  });
}

function drawRibbon(currentIdx){
  const c = document.getElementById('rb-canvas');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  const W = c.width = c.clientWidth*dpr;
  const H = c.height = c.clientHeight*dpr;
  const pad = 30*dpr;
  const pts = CHAPTERS.map((ch,i)=>({
    i, lat:ch.center[1], spirit:ch.dao*0.5+ch.fo*1.0, title:ch.title
  }));
  const maxLat=31, minLat=18, maxSp=1.0;
  const x = i => pad + (i/(CHAPTERS.length-1))*(W-pad*2);
  const yLat = l => pad + ((maxLat-l)/(maxLat-minLat))*(H-pad*2);
  const ySp  = s => (H-pad) - (s/maxSp)*(H-pad*2);
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='rgba(242,232,207,0.08)'; ctx.lineWidth=1;
  for(let i=0;i<CHAPTERS.length;i++){
    ctx.beginPath(); ctx.moveTo(x(i),pad); ctx.lineTo(x(i),H-pad); ctx.stroke();
  }
  ctx.strokeStyle='rgba(168,58,56,0.85)'; ctx.lineWidth=2.4*dpr; ctx.beginPath();
  pts.forEach((p,i)=>{ const xx=x(i), yy=yLat(p.lat); if(i===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); });
  ctx.stroke();
  ctx.fillStyle='rgba(168,58,56,0.10)'; ctx.beginPath();
  pts.forEach((p,i)=>{ const xx=x(i), yy=yLat(p.lat); if(i===0)ctx.moveTo(xx,H-pad); ctx.lineTo(xx,yy); });
  ctx.lineTo(x(pts.length-1), H-pad); ctx.closePath(); ctx.fill();
  const grad = ctx.createLinearGradient(pad,0,W-pad,0);
  grad.addColorStop(0,'#B8763E'); grad.addColorStop(0.5,'#3F7A6A'); grad.addColorStop(1,'#33486E');
  ctx.strokeStyle=grad; ctx.lineWidth=2.4*dpr; ctx.beginPath();
  pts.forEach((p,i)=>{ const xx=x(i), yy=ySp(p.spirit); if(i===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); });
  ctx.stroke();
  pts.forEach((p,i)=>{
    ctx.fillStyle = i===currentIdx?'#F2E8CF':'rgba(168,58,56,0.95)';
    ctx.beginPath(); ctx.arc(x(i), yLat(p.lat), (i===currentIdx?5.5:3.5)*dpr, 0, Math.PI*2); ctx.fill();
    if(i===currentIdx){ ctx.strokeStyle='#A83A38'; ctx.lineWidth=2*dpr; ctx.stroke(); }
    ctx.fillStyle = i===currentIdx?'#F2E8CF':'rgba(242,232,207,0.92)';
    ctx.beginPath(); ctx.arc(x(i), ySp(p.spirit), (i===currentIdx?5.5:3.5)*dpr, 0, Math.PI*2); ctx.fill();
    if(i===currentIdx){ ctx.strokeStyle='#3F7A6A'; ctx.lineWidth=2*dpr; ctx.stroke(); }
    ctx.fillStyle='rgba(242,232,207,0.72)';
    ctx.font = `${11*dpr}px 'ZCOOL XiaoWei',serif`; ctx.textAlign='center';
    ctx.fillText(p.title, x(i), H-6*dpr);
  });
  ctx.textAlign='left';
}

function ribbonIndexAtEvent(ev){
  const c = document.getElementById('rb-canvas');
  const rect = c.getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;
  if(px < 0 || px > rect.width || py < -18 || py > rect.height + 26) return -1;
  if(ribbonHitPoints.length){
    let best = null;
    ribbonHitPoints.forEach(p=>{
      const d = Math.hypot(px-p.x, py-p.y);
      if(d <= 26 && (!best || d < best.d)) best = {...p, d};
    });
    if(best) return best.i;
  }
  const pad = 30;
  const usable = Math.max(1, rect.width - pad*2);
  const raw = Math.round(((px - pad) / usable) * (CHAPTERS.length - 1));
  return Math.max(0, Math.min(CHAPTERS.length - 1, raw));
}
function bindRibbonClicks(){
  const ribbon = document.getElementById('ribbon');
  const canvas = document.getElementById('rb-canvas');
  const handle = ev=>{
    const idx = ribbonIndexAtEvent(ev);
    if(idx >= 0){ ev.preventDefault(); goto(idx); }
  };
  const updateCursor = ev=>{
    const active = ribbonIndexAtEvent(ev) >= 0;
    canvas.style.cursor = active ? 'pointer' : 'default';
    ribbon.style.cursor = active ? 'pointer' : 'default';
  };
  ribbon.addEventListener('click', handle);
  ribbon.addEventListener('mousemove', updateCursor);
}

function overview(){
  if(navigating) return;
  navigating=true;
  map.setMaxBounds(null); map.setMinZoom(2); map.setMaxZoom(14);
  map.flyTo({center:[113,27], zoom:3.8, pitch:20, bearing:0, duration:2800});
  const feats = CHAPTERS.map(ch=>curvedFeature(ch.events.map(e=>[e.lng,e.lat])));
  if(map.getSource('past-trail'))
    map.getSource('past-trail').setData({type:'FeatureCollection',features:feats});
  setTimeout(()=>{ navigating=false; }, 3200);
}

window.addEventListener('keydown', e=>{
  if(!document.getElementById('title-stage').classList.contains('gone')) return;
  if(document.getElementById('ending').classList.contains('on')) return;
  if(e.key==='ArrowRight'||e.key==='ArrowDown') { e.preventDefault(); goto(currentChapter+1); }
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp') { e.preventDefault(); goto(currentChapter-1); }
  else if(e.key==='Escape') restart();
  else if(e.key==='t'||e.key==='T') toggleTweaks();
});

function toggleTweaks(){ document.getElementById('tweaks').classList.toggle('on'); }
window.addEventListener('message', (ev)=>{
  if(!ev.data) return;
  if(ev.data.type==='__activate_edit_mode') document.getElementById('tweaks').classList.add('on');
  if(ev.data.type==='__deactivate_edit_mode') document.getElementById('tweaks').classList.remove('on');
});
window.addEventListener('load', ()=>{
  try{ window.parent.postMessage({type:'__edit_mode_available'}, '*'); }catch(e){}
});
function persist(k,v){
  TWEAKS[k]=v;
  try{ window.parent.postMessage({type:'__edit_mode_set_keys', edits:{[k]:v}}, '*'); }catch(e){}
}

document.getElementById('tw-terrain').addEventListener('input', e=>{
  const v = parseFloat(e.target.value);
  persist('terrainExaggeration', v);
  try{ map.setTerrain({source:'mapbox-dem', exaggeration:v}); }catch(err){}
});
document.getElementById('tw-weather').addEventListener('change', e=>{
  persist('weatherOn', e.target.checked);
  if(currentChapter>=0) applyWeather(CHAPTERS[currentChapter].weather);
});
document.getElementById('tw-ink').addEventListener('change', e=>{
  persist('inkOn', e.target.checked);
  if(currentChapter>=0) applyInk(CHAPTERS[currentChapter].ink);
});
document.getElementById('tw-seal').addEventListener('input', e=>{
  persist('sealColor', e.target.value);
  document.getElementById('stage-seal-box').style.background = e.target.value;
  document.documentElement.style.setProperty('--seal', e.target.value);
});

buildRail();
bindRibbonClicks();
initMap();

window.addEventListener('resize', ()=>{
  if(currentChapter>=0) drawRibbon(currentChapter);
  if(document.getElementById('ending').classList.contains('on')) drawStarMap();
});

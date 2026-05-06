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

      // Mapbox natural water surfaces keep oceans, lakes, and shore boundaries visible
      { id: 'water-natural-fill', type: 'fill', source: 'streets', 'source-layer': 'water',
        paint: {
          'fill-color': '#6FA8C8',
          'fill-opacity': ['interpolate',['linear'],['zoom'],3,0.36,7,0.48,12,0.6]
        }
      },
      // River lines are limited to Yangtze and Yellow River
      { id: 'water-natural-way', type: 'line', source: 'streets', 'source-layer': 'waterway',
        filter: ['all', ['in', ['get','class'], ['literal',['river','canal']]], ['any',
          ['in','长江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','長江', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','黄河', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','黃河', ['coalesce',['get','name_zh-Hans'],['get','name_zh-Hant'],['get','name'],'']],
          ['in','Yangtze', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Chang Jiang', ['coalesce',['get','name'],['get','name_en'],'']],
          ['in','Yellow River', ['coalesce',['get','name_en'],['get','name'],'']],
          ['in','Huang He', ['coalesce',['get','name'],['get','name_en'],'']]
        ]],
        paint: {
          'line-color': ['interpolate',['linear'],['zoom'],3,'#7CB9D2',7,'#4F99BA',12,'#327DA2'],
          'line-width': ['interpolate',['linear'],['zoom'],3,0.6,6,1.2,9,2.6,12,4.4],
          'line-opacity': ['interpolate',['linear'],['zoom'],3,0.5,7,0.66,12,0.78]
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

// ============ DIGITAL DONGPO + GUIDE ============
const API_URL = '/.netlify/functions/dongpo-chat';
const CATEGORY_PREFIX = {poetry:'[poetry]',life:'[life]',daily:'[daily]',friends:'[friends]',philosophy:'[philosophy]'};
const CATEGORY_LABELS = {poetry:'\u8bd7\u8bcd',life:'\u4eba\u751f',daily:'\u65e5\u5e38',friends:'\u6545\u53cb',philosophy:'\u54f2\u601d'};
let narrationList=[]; let currentNarrationAudio=null; let dongpoPersona=''; let dongpoKb=null; let askCategory='life'; let askTurns=[]; let askBusy=false; let currentQuickPrompt=''; let tourIndex=0; let tourActive=false;
const tourSteps=[
  {target:'#rail',title:'\u7ae0\u8282\u5bfc\u822a',body:'\u70b9\u51fb\u5de6\u4fa7\u5706\u70b9\uff0c\u8df3\u8f6c\u82cf\u8f7c\u7684\u4eba\u751f\u9636\u6bb5\u3002'},
  {target:'#plate',title:'\u7ae0\u8282\u5361\u7247',body:'\u8fd9\u91cc\u5c55\u793a\u6bcf\u7ae0\u7684\u65f6\u95f4\u3001\u5730\u7406\u3001\u53d9\u4e8b\u4e0e\u7cbe\u795e\u72b6\u6001\u3002'},
  {target:'#poem-floats',title:'\u8bd7\u8bcd\u6d6e\u5c42',body:'\u5bf9\u5e94\u7ae0\u8282\u7684\u4ee3\u8868\u8bd7\u8bcd\u4f1a\u4ee5\u7ad6\u6392\u65b9\u5f0f\u6d6e\u73b0\u3002'},
  {target:'#ribbon',title:'\u4eba\u751f\u8d77\u4f0f\u56fe',body:'\u5e95\u90e8\u56fe\u8868\u5c55\u793a\u7eac\u5ea6\u4e0b\u79fb\u4e0e\u7cbe\u795e\u4e0a\u5347\uff0c\u4e5f\u53ef\u70b9\u51fb\u8df3\u8f6c\u7ae0\u8282\u3002'},
  {target:'.pl-narrate-btn',title:'\u4e1c\u5761\u81ea\u8ff0',body:'\u70b9\u51fb\u8fd9\u91cc\uff0c\u542c\u4e1c\u5761\u4ee5\u7b2c\u4e00\u4eba\u79f0\u8bb2\u8ff0\u8fd9\u6bb5\u4eba\u751f\u3002'}
];
const askPrompts=['\u4f60\u6700\u5f97\u610f\u7684\u4e00\u9996\u8bd7\u662f\u4ec0\u4e48\uff1f','\u9ec4\u5dde\u5230\u5e95\u6539\u53d8\u4e86\u4f60\u4ec0\u4e48\uff1f','\u4eba\u751f\u4f4e\u8c37\u65f6\u8be5\u600e\u4e48\u529e\uff1f','\u4f60\u5982\u4f55\u770b\u5f85\u5f97\u5931\uff1f','\u4f60\u6700\u60f3\u5ff5\u54ea\u4f4d\u6545\u53cb\uff1f'];
const fallbackReplies=['\u8001\u592b\u6b64\u523b\u8fde\u4e0d\u4e0a\u8fdc\u65b9\u4e66\u4fe1\uff0c\u4fbf\u5148\u8bf4\u4e00\u53e5\uff1a\u4eba\u751f\u98ce\u96e8\uff0c\u672a\u5fc5\u7686\u662f\u574f\u4e8b\u3002','\u6b64\u95ee\u751a\u597d\u3002\u82e5\u53ea\u770b\u4e00\u65f6\u5f97\u5931\uff0c\u4eba\u4fbf\u56f0\u5728\u4e00\u65f6\uff1b\u82e5\u80af\u628a\u8eab\u5b50\u653e\u5230\u5c71\u6c34\u4e4b\u95f4\uff0c\u5fc3\u4e2d\u4fbf\u591a\u4e00\u6761\u8def\u3002','\u6211\u5728\u4e1c\u5761\u79cd\u5730\u65f6\u660e\u767d\u4e00\u4e8b\uff1a\u5929\u5730\u4e0d\u6b20\u6211\u529f\u540d\uff0c\u5374\u65f6\u65f6\u7ed9\u6211\u996d\u9999\u3001\u96e8\u58f0\u4e0e\u6708\u8272\u3002'];
function initDigitalFeatures(){fetch('data/narration.json').then(function(r){return r.json();}).then(function(d){narrationList=Array.isArray(d)?d:[];}).catch(function(e){console.warn('narration load failed',e);});fetch('data/dongpo_kb.json').then(function(r){return r.json();}).then(function(d){dongpoKb=d;}).catch(function(e){console.warn('kb load failed',e);});fetch('data/dongpo_persona.js').then(function(r){return r.text();}).then(function(t){dongpoPersona=t.replace('export default DONGPO_SYSTEM_PROMPT;','');}).catch(function(e){console.warn('persona load failed',e);});bindNarrationUI();bindAskUI();bindTourUI();}
function bindNarrationUI(){var modal=document.getElementById('narration-modal');document.getElementById('narration-close').addEventListener('click',closeNarration);modal.addEventListener('click',function(e){if(e.target===modal)closeNarration();});document.getElementById('narration-play').addEventListener('click',toggleNarrationAudio);document.getElementById('narration-range').addEventListener('input',function(e){if(!currentNarrationAudio||!currentNarrationAudio.duration)return;currentNarrationAudio.currentTime=(parseFloat(e.target.value)/1000)*currentNarrationAudio.duration;});}
function getNarration(idx){return narrationList.find(function(n){return Number(n.chapter)===idx+1;})||narrationList[idx];}
function openNarration(idx){if(idx===undefined)idx=currentChapter;if(idx<0||idx>=CHAPTERS.length)return;var item=getNarration(idx)||{title:CHAPTERS[idx].title,narration:CHAPTERS[idx].narrative};closeNarration(false);document.getElementById('narration-title').textContent=item.title||CHAPTERS[idx].title;document.getElementById('narration-text').textContent=item.narration||CHAPTERS[idx].narrative;document.getElementById('narration-kicker').textContent='CHAPTER '+(idx+1)+' / '+(item.title_en||CHAPTERS[idx].en);currentNarrationAudio=new Audio('audio/ch'+(idx+1)+'.mp3');currentNarrationAudio.addEventListener('timeupdate',updateNarrationAudio);currentNarrationAudio.addEventListener('loadedmetadata',updateNarrationAudio);currentNarrationAudio.addEventListener('ended',function(){document.getElementById('narration-play').textContent='\u25b6';});document.getElementById('narration-range').value=0;document.getElementById('narration-time').textContent='00:00';document.getElementById('narration-play').textContent='\u25b6';document.getElementById('narration-modal').classList.add('on');document.getElementById('narration-modal').setAttribute('aria-hidden','false');}
function closeNarration(hide){if(hide===undefined)hide=true;if(currentNarrationAudio){currentNarrationAudio.pause();currentNarrationAudio=null;}if(hide){document.getElementById('narration-modal').classList.remove('on');document.getElementById('narration-modal').setAttribute('aria-hidden','true');}}
function toggleNarrationAudio(){if(!currentNarrationAudio)return;if(currentNarrationAudio.paused){currentNarrationAudio.play().catch(function(){});document.getElementById('narration-play').textContent='II';}else{currentNarrationAudio.pause();document.getElementById('narration-play').textContent='\u25b6';}}
function updateNarrationAudio(){if(!currentNarrationAudio)return;var dur=currentNarrationAudio.duration||0;var cur=currentNarrationAudio.currentTime||0;document.getElementById('narration-range').value=dur?Math.round(cur/dur*1000):0;document.getElementById('narration-time').textContent=formatTime(cur)+' / '+formatTime(dur);}function formatTime(sec){if(!isFinite(sec)||sec<0)sec=0;return Math.floor(sec/60).toString().padStart(2,'0')+':'+Math.floor(sec%60).toString().padStart(2,'0');}
function bindAskUI(){var chips=document.getElementById('ask-chips');chips.innerHTML=Object.keys(CATEGORY_LABELS).map(function(k){return '<button class="ask-chip'+(k===askCategory?' active':'')+'" type="button" data-cat="'+k+'">'+CATEGORY_LABELS[k]+'</button>';}).join('');chips.addEventListener('click',function(e){var btn=e.target.closest('.ask-chip');if(!btn)return;askCategory=btn.dataset.cat;document.querySelectorAll('.ask-chip').forEach(function(b){b.classList.toggle('active',b===btn);});updateAskHint();});document.getElementById('ask-close').addEventListener('click',closeAskDongpo);document.getElementById('ask-modal').addEventListener('click',function(e){if(e.target.id==='ask-modal')closeAskDongpo();});document.getElementById('ask-send').addEventListener('click',function(){sendAskMessage();});document.getElementById('ask-input').addEventListener('keydown',function(e){if(e.key==='Enter')sendAskMessage();});document.getElementById('ask-hint').addEventListener('click',function(e){var btn=e.target.closest('.ask-quick');if(btn)sendAskMessage(btn.textContent);});updateAskHint();}
function openAskDongpo(){document.getElementById('ask-modal').classList.add('on');document.getElementById('ask-modal').setAttribute('aria-hidden','false');if(!askTurns.length){appendAskMessage('bot','\u8001\u592b\u5728\u6b64\u3002\u4f60\u53ef\u95ee\u8bd7\u8bcd\uff0c\u4e5f\u53ef\u95ee\u98ce\u96e8\u3001\u6545\u53cb\u4e0e\u4e00\u751f\u5f97\u5931\u3002');}updateAskHint();setTimeout(function(){document.getElementById('ask-input').focus();},80);}function closeAskDongpo(){document.getElementById('ask-modal').classList.remove('on');document.getElementById('ask-modal').setAttribute('aria-hidden','true');}
function updateAskHint(){currentQuickPrompt=askPrompts[0];document.getElementById('ask-hint').innerHTML=askPrompts.map(function(p){return '<button class="ask-quick" type="button">'+p+'</button>';}).join('');document.getElementById('ask-input').placeholder=currentQuickPrompt;}function appendAskMessage(role,text){var log=document.getElementById('ask-log');var el=document.createElement('div');el.className='ask-msg '+(role==='user'?'user':'bot');el.textContent=text;log.appendChild(el);log.scrollTop=log.scrollHeight;return el;}
async function sendAskMessage(forcedText){if(askBusy)return;var input=document.getElementById('ask-input');var text=(forcedText||input.value).trim();if(!text)return;if(!forcedText)input.value='';appendAskMessage('user',text);askTurns.push({role:'user',content:text});var bot=appendAskMessage('bot','');askBusy=true;try{await streamDongpoAnswer(text,bot);}catch(e){bot.textContent=fallbackReplies[Math.floor(Math.random()*fallbackReplies.length)];}finally{askTurns.push({role:'assistant',content:bot.textContent});askTurns=askTurns.slice(-8);askBusy=false;}}
function kbSummary(){if(!dongpoKb)return '';try{var timeline=(dongpoKb.biography_timeline||[]).slice(0,36).map(function(x){return x.year+':'+x.event;}).join('\n');var works=(dongpoKb.major_works||dongpoKb.works||[]).slice(0,18).map(function(x){return (x.title||x.t||'')+':'+(x.context||x.event||'');}).join('\n');return (timeline+'\n'+works).slice(0,5000);}catch(e){return JSON.stringify(dongpoKb).slice(0,5000);}}
async function streamDongpoAnswer(text,bot){var system=dongpoPersona+'\n\nreference:\n'+kbSummary();var messages=[{role:'system',content:system}].concat(askTurns.slice(-6),[{role:'user',content:CATEGORY_PREFIX[askCategory]+'\n'+text}]);var res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:messages})});if(!res.ok)throw new Error('api failed');var data=await res.json();bot.textContent=(data&&data.content)||'';document.getElementById('ask-log').scrollTop=document.getElementById('ask-log').scrollHeight;if(!bot.textContent)throw new Error('empty');}
function bindTourUI(){document.getElementById('tour-next').addEventListener('click',nextTourStep);document.getElementById('tour-skip').addEventListener('click',finishTour);var help=document.getElementById('tour-help');if(help)help.addEventListener('click',function(){startTour(true);});}function maybeStartTour(){startTour(true);}function startTour(force){tourIndex=0;tourActive=true;document.getElementById('tour-shade').classList.add('on');showTourStep();}
function showTourStep(){if(!tourActive)return;var step=tourSteps[tourIndex];var target=document.querySelector(step.target);if(!target){nextTourStep();return;}var rect=target.getBoundingClientRect();var pad=8;var hi=document.getElementById('tour-highlight');hi.style.left=Math.max(8,rect.left-pad)+'px';hi.style.top=Math.max(8,rect.top-pad)+'px';hi.style.width=Math.min(window.innerWidth-16,rect.width+pad*2)+'px';hi.style.height=Math.min(window.innerHeight-16,rect.height+pad*2)+'px';document.getElementById('tour-step-title').textContent=(tourIndex+1)+'/'+tourSteps.length+' '+step.title;document.getElementById('tour-step-body').textContent=step.body;var tip=document.getElementById('tour-tip');var left=rect.left+rect.width+22<window.innerWidth-340?rect.left+rect.width+22:Math.max(18,rect.left-340);var top=Math.min(window.innerHeight-220,Math.max(18,rect.top));tip.style.left=left+'px';tip.style.top=top+'px';document.getElementById('tour-next').textContent=tourIndex===tourSteps.length-1?'\u5b8c\u6210':'\u4e0b\u4e00\u6b65';}
function nextTourStep(){if(tourIndex>=tourSteps.length-1){finishTour();return;}tourIndex+=1;showTourStep();}function finishTour(){tourActive=false;document.getElementById('tour-shade').classList.remove('on');}function clearTour(){tourActive=false;document.getElementById('tour-shade').classList.remove('on');}
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
  closeNarration();
  closeAskDongpo();
  clearTour();
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
  closeNarration();
  closeAskDongpo();
  clearTour();
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
  if(idx===0) setTimeout(function(){ if(currentChapter===0) maybeStartTour(); }, instant?5200:4600);
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
  setTimeout(()=>document.getElementById('ask-open').classList.add('show'), 1300);
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
initDigitalFeatures();
initMap();

window.addEventListener('resize', ()=>{
  if(currentChapter>=0) drawRibbon(currentChapter);
  if(document.getElementById('ending').classList.contains('on')) drawStarMap();
  if(tourActive) showTourStep();
});

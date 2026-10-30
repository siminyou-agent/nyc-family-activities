import {REGIONS,DEFAULT_FILTERS,areaKey,nyDate,dateRange,filterEvents,formatDate,filtersFromSearch,filtersToSearch} from './lib.js';
import {COPY,localizedEvent} from './i18n.js';
import {eventSource,sourceCount} from './sources.js';

// Replace this endpoint with a scheduled API using the same JSON contract.
const EVENTS_ENDPOINT=new URL('./data/events.json',import.meta.url);
const SOURCES_ENDPOINT=new URL('./data/sources.json',import.meta.url);
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
let data,filters=filtersFromSearch(location.search),map,markers,tileErrors=0,selected=null;
const venueMarkers=new Map();
const desktop=window.matchMedia('(min-width:1001px)');
if(!new URLSearchParams(location.search).has('lang')) {
  try{const saved=localStorage.getItem('nyc-weekend-language');if(['zh','en'].includes(saved))filters.lang=saved;}catch{}
}
const copy=()=>COPY[filters.lang];
const mapVisible=()=>desktop.matches || filters.view==='map';
function optionButtons(values,key){return Object.entries(values).map(([value,label])=>`<button data-${key}="${value}" aria-pressed="false">${esc(label)}</button>`).join('');}
function translate() {
  const t=copy();
  document.documentElement.lang=filters.lang==='en'?'en':'zh-CN';
  document.title=t.pageTitle;document.querySelector('meta[name=description]').content=t.metaDescription;
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t[el.dataset.i18n];});
  $('search').placeholder=t.searchPlaceholder;$('search').setAttribute('aria-label',t.search);
  for(const [selector,key] of [['.filters','filtersLabel'],['#date-presets','dateRangeLabel'],['#times','time'],['#results','resultsLabel'],['.view-switch','viewLabel'],['#map','mapLabel'],['.language-switch','languageLabel']])document.querySelector(selector).setAttribute('aria-label',t[key]);
  document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===filters.lang)));
  $('regions').innerHTML=optionButtons({...REGIONS,all:filters.lang==='en'?'All areas':'全部地区'},'region');
  $('categories').innerHTML=optionButtons(t.categories,'category');
  if(data){$('updated-label').textContent=t.updated(data.edition);renderSources();}
  if(map){const controls=document.querySelectorAll('.leaflet-control-zoom a');controls.forEach((b,i)=>{b.title=i?t.zoomOut:t.zoomIn;b.setAttribute('aria-label',b.title);});}
}
function renderSources() {
  const t=copy(),sources=data.sources;
  const grouped={all:t.sourceAll,...t.sourceKinds};
  $('source-filter').innerHTML=Object.entries(grouped).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')+sources.filter(s=>sourceCount(data,s.id)>0).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('source-filter').setAttribute('aria-label',t.sourceLabel);
  $('coverage-summary').textContent=t.coverageSummary(sources.filter(s=>sourceCount(data,s.id)>0).length,sources.length);
  $('source-list').innerHTML=sources.map(s=>{
    const count=sourceCount(data,s.id);
    return `<div class="source-row"><div><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><span class="source-status ${s.status}">${t.sourceStatuses[s.status]}</span>${count?`<button data-filter-source="${s.id}">${t.sourceEvents(count)}</button>`:''}${s.auditPath?`<a href="${esc(new URL(s.auditPath,import.meta.url).href)}" target="_blank" rel="noopener noreferrer">${t.collectionAudit}</a>`:''}</div><p>${esc(s.note[filters.lang])} <span>${s.checkedOn?`${t.sourceChecked} ${s.checkedOn}`:t.notChecked}</span></p></div>`;
  }).join('');
}
function syncControls() {
  for(const [id,key] of [['date-presets','preset'],['regions','region'],['ages','age'],['times','time'],['categories','category']])$(id).querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[key]===filters[key])));
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===filters.view)));
  $('free-only').checked=filters.free;$('indoor-only').checked=filters.indoor;$('search').value=filters.q;
  $('start-date').value=filters.start || data.edition.start;$('end-date').value=filters.end || data.edition.end;
  $('custom-dates').hidden=filters.preset!=='custom';
  $('source-filter').value=filters.source;
  renderAreas();
}
function renderAreas(){
  const t=copy();$('nassau-areas').hidden=filters.region!=='nassau';
  const venues=Object.values(data.venues).filter(v=>v.region==='nassau');
  const options=(values,label)=>`<option value="all">${esc(label)}</option>`+[...new Set(values.filter(Boolean))].sort().map(v=>`<option value="${esc(areaKey(v))}">${esc(v)}</option>`).join('');
  $('town-filter').innerHTML=options(venues.map(v=>v.town),t.allTowns);
  $('community-filter').innerHTML=options(venues.filter(v=>filters.town==='all' || areaKey(v.town)===filters.town).map(v=>v.community || v.city),t.allCommunities);
  $('town-filter').value=filters.town;$('community-filter').value=filters.community;
  $('town-filter').setAttribute('aria-label',t.townLabel);$('community-filter').setAttribute('aria-label',t.communityLabel);
}
function session(s){const status=copy().availability[s.availability];return `<div class="session">${s.sourceUrl?`<a href="${esc(safeUrl(s.sourceUrl))}" target="_blank" rel="noopener noreferrer" title="${copy().officialLink}">${formatDate(s.date,filters.lang)}</a>`:`<span>${formatDate(s.date,filters.lang)}</span>`}<span>${s.start}–${s.end}${status?` <strong class="availability ${esc(s.availability)}">${esc(status)}</strong>`:''}</span></div>`;}
function card(event) {
  const t=copy(),v=event.venue,e=localizedEvent(event,data,filters.lang),source=eventSource(data,event);
  return `<article class="card${selected===e.id?' selected':''}" data-event="${esc(e.id)}">
    <div class="card-top"><span class="region">${esc(REGIONS[v.region])}${v.city===REGIONS[v.region]?'':` · ${esc(v.city)}`}</span><span class="price-short">${esc(e.price.label)}</span></div>
    <h3><button class="event-select" data-select="${esc(e.id)}">${esc(e.title)}</button></h3><p class="venue">${esc(v.name)}</p><p class="description">${esc(e.description)}</p>
    <div class="schedule">${e.sessions.slice(0,2).map(session).join('')}${e.sessions.length>2?`<details class="more-sessions"><summary>${t.more(e.sessions.length-2)}</summary>${e.sessions.slice(2).map(session).join('')}</details>`:''}</div>
    <div class="tags"><span class="tag" title="${e.ages.basis==='official'?t.officialAge:e.ages.basis==='unknown'?t.unknownAge:t.editorialAge}">${esc(e.ages.label)}</span><span class="tag">${t.settings[e.setting]}</span><span class="tag">${t.bookings[e.booking]}</span>${e.eligibility?.card?`<span class="tag">${t.cardRule}</span>`:''}${e.eligibility?.residents?`<span class="tag">${t.residentRule}</span>`:''}</div>
    <div class="card-footer"><a class="source-link" href="${esc(safeUrl(e.source.url))}" target="_blank" rel="noopener noreferrer" title="${t.officialLink}">${esc(source.name)} ↗</a><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(`${v.name}, ${v.address}`)}" target="_blank" rel="noopener noreferrer">${t.directions}</a><span class="source-verified">${t.sourceChecked} ${source.checkedOn}</span></div>
    <details class="card-details"><summary>${t.details}</summary><p class="tip">${esc(e.tip)}</p><address>${esc(v.address)}</address></details>
  </article>`;
}
function selectEvent(id,{fromMap=false}={}) {
  selected=id;
  if(fromMap && !desktop.matches){filters.view='list';render();}
  document.querySelectorAll('.card').forEach(el=>el.classList.toggle('selected',el.dataset.event===id));
  const event=data.events.find(e=>e.id===id),marker=venueMarkers.get(event.venueId);
  for(const [venueId,pin] of venueMarkers)pin.getElement()?.classList.toggle('active',venueId===event.venueId);
  if(!fromMap && marker){const show=()=>{marker.getElement()?.classList.add('active');map.panTo(marker.getLatLng(),{animate:false});marker.openPopup();};if(markers.zoomToShowLayer)markers.zoomToShowLayer(marker,show);else show();}
  if(fromMap){const el=document.querySelector(`[data-event="${id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.querySelector('button').focus({preventScroll:true});}}
}
function renderMap(events) {
  const t=copy();
  if(!window.L){$('map').textContent=t.mapFail;return;}
  if(!map) {
    map=L.map('map',{scrollWheelZoom:false,zoomControl:false}).setView([40.75,-73.85],10);
    L.control.zoom({position:'topright',zoomInTitle:t.zoomIn,zoomOutTitle:t.zoomOut}).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).on('tileerror',()=>{if(++tileErrors>=4)document.querySelector('.map-note').textContent=copy().mapTilesFail;}).addTo(map);
    markers=L.markerClusterGroup?L.markerClusterGroup({animate:false,showCoverageOnHover:false,maxClusterRadius:32,iconCreateFunction:cluster=>{
      const children=cluster.getAllChildMarkers(),count=children.reduce((n,m)=>n+m.options.activityCount,0),label=copy().mapCluster(children.length,count);
      return L.divIcon({className:'map-cluster',html:`<span title="${esc(label)}" aria-label="${esc(label)}">${count}</span>`,iconSize:[35,35],iconAnchor:[17,17]});
    }}).addTo(map):L.layerGroup().addTo(map);
  }
  markers.clearLayers();venueMarkers.clear();
  const grouped=new Map();events.forEach(e=>{if(!grouped.has(e.venueId))grouped.set(e.venueId,[]);grouped.get(e.venueId).push(e);});
  $('map').dataset.locationCount=String(grouped.size);$('map').setAttribute('aria-label',`${t.mapLabel} · ${t.mapLocations(grouped.size)}`);
  document.querySelector('.map-note').textContent=`${t.mapLocations(grouped.size)} · ${t.mapNote}`;
  const points=[];
  for(const entries of grouped.values()) {
    const v=entries[0].venue;points.push(v.coordinates);
    const icon=L.divIcon({className:`map-pin${entries.some(e=>e.id===selected)?' active':''}`,html:String(entries.length),iconSize:[29,29],iconAnchor:[14,14]});
    const marker=L.marker(v.coordinates,{icon,title:v.name,activityCount:entries.length}).addTo(markers);venueMarkers.set(entries[0].venueId,marker);
    const popup=document.createElement('div'),title=document.createElement('div');title.className='popup-title';title.textContent=v.name;popup.append(title);
    for(const event of entries) {
      const e=localizedEvent(event,data,filters.lang),link=document.createElement('a');link.className='popup-event';link.href=`#event-${e.id}`;link.textContent=e.title;
      link.addEventListener('click',ev=>{ev.preventDefault();selectEvent(e.id,{fromMap:true});});popup.append(link);
      const info=document.createElement('div');info.className='popup-official';info.textContent=`${formatDate(e.sessions[0].date,filters.lang)} ${e.sessions[0].start} · ${e.price.label}`;popup.append(info);
      const official=document.createElement('a');official.className='popup-official';official.href=safeUrl(e.source.url);official.target='_blank';official.rel='noopener noreferrer';official.textContent=t.officialLink;popup.append(official);
    }
    marker.bindPopup(popup);
  }
  requestAnimationFrame(()=>{map.invalidateSize();if(points.length)map.fitBounds(points,{padding:[35,35],maxZoom:13,animate:false});});
}
function render({writeUrl=true}={}) {
  syncControls();
  const t=copy(),events=filterEvents(data,filters),[start,end]=dateRange(filters,data.edition);
  $('range-label').textContent=`${formatDate(start).split(' ')[0]} – ${formatDate(end).split(' ')[0]} · ${start.slice(0,4)}`;
  $('count').textContent=events.length;$('session-count').textContent=t.sessions(events.reduce((n,e)=>n+e.sessions.length,0));
  $('cards').innerHTML=events.map(card).join('');$('empty').hidden=events.length>0;
  const message=start>end?t.invalidDates:start>data.edition.end || end<data.edition.start?t.outside(data.edition):nyDate()>data.edition.end?t.archived:filters.preset==='custom' && (start<data.edition.start || end>data.edition.end)?t.partial(data.edition):'';
  $('notice').textContent=message;$('notice').hidden=!message;
  $('map-panel').hidden=!mapVisible();document.querySelector('.explorer').classList.toggle('with-map',mapVisible());if(mapVisible())renderMap(events);
  if(writeUrl){const search=filtersToSearch(filters);history.replaceState(null,'',`${location.pathname}${search?'?'+search:''}${location.hash}`);}
}
function reset(){filters={...DEFAULT_FILTERS,lang:filters.lang};selected=null;render();}
function changeLanguage(language) {
  filters.lang=language;try{localStorage.setItem('nyc-weekend-language',language);}catch{}
  translate();if(data)render();
}
async function init() {
  translate();
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>changeLanguage(b.dataset.lang)));
  const [response,sourceResponse]=await Promise.all([fetch(EVENTS_ENDPOINT,{cache:'no-cache'}),fetch(SOURCES_ENDPOINT,{cache:'no-cache'})]);if(!response.ok || !sourceResponse.ok)throw new Error(`HTTP ${response.status}/${sourceResponse.status}`);data=await response.json();data.sources=(await sourceResponse.json()).sources;
  if(data.schemaVersion!==1 || !Array.isArray(data.events) || !data.translations?.en)throw new Error('Unsupported bilingual data schema');
  translate();
  for(const [id,key] of [['date-presets','preset'],['regions','region'],['ages','age'],['times','time'],['categories','category']])$(id).addEventListener('click',e=>{const b=e.target.closest('button');if(b){filters[key]=b.dataset[key];if(key==='region'){filters.town='all';filters.community='all';}selected=null;render();}});
  for(const [id,key] of [['town-filter','town'],['community-filter','community']])$(id).addEventListener('change',e=>{filters[key]=e.target.value;if(key==='town')filters.community='all';selected=null;render();});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{filters.view=b.dataset.view;render();}));
  for(const [id,key] of [['free-only','free'],['indoor-only','indoor']])$(id).addEventListener('change',e=>{filters[key]=e.target.checked;render();});
  for(const [id,key] of [['start-date','start'],['end-date','end']])$(id).addEventListener('change',e=>{filters[key]=e.target.value;render();});
  $('search').addEventListener('input',e=>{filters.q=e.target.value;render();});
  $('cards').addEventListener('click',e=>{const b=e.target.closest('[data-select]');if(b)selectEvent(b.dataset.select);});
  $('source-filter').addEventListener('change',e=>{filters.source=e.target.value;render();});
  $('source-list').addEventListener('click',e=>{const b=e.target.closest('[data-filter-source]');if(b){filters.source=b.dataset.filterSource;render();$('source-coverage').open=false;}});
  $('reset').addEventListener('click',reset);$('empty-reset').addEventListener('click',reset);
  window.addEventListener('popstate',()=>{filters=filtersFromSearch(location.search);translate();render({writeUrl:false});});
  desktop.addEventListener('change',()=>render({writeUrl:false}));
  render();
}
init().catch(error=>{console.error(error);const t=copy();$('cards').textContent=t.loadError;$('count').textContent='0';$('notice').hidden=false;$('notice').textContent=t.loadErrorTip;});

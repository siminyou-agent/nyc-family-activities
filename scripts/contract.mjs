import assert from 'node:assert/strict';
import {eventSource} from '../public/sources.js';
const regions=['manhattan','brooklyn','queens','bronx','staten-island','nassau'];
const isDate=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0,10)===s;
const isTime=s=>typeof s==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
const text=s=>typeof s==='string' && s.trim().length>0;
export function validate(data) {
  assert.equal(data.schemaVersion,1,'schemaVersion must be 1');
  const edition=data.edition;
  for(const key of ['id','title','scope'])assert(text(edition[key]),`edition.${key} required`);
  assert.equal(edition.timezone,'America/New_York');
  assert(['manual','scheduled'].includes(edition.mode));
  for(const key of ['start','end','verifiedOn'])assert(isDate(edition[key]),`invalid edition.${key}`);
  assert(edition.start<=edition.end,'edition start must precede end');
  assert(data.venues && Object.keys(data.venues).length>0,'venues required');
  for(const [id,v] of Object.entries(data.venues)) {
    for(const key of ['name','city','address'])assert(text(v[key]),`${id}.${key} required`);
    assert(regions.includes(v.region),`${id}: unknown region`);
    if(v.town)assert(v.region==='nassau' && ['Hempstead','North Hempstead','Oyster Bay','Glen Cove','Long Beach'].includes(v.town),`${id}: invalid Nassau town/city`);
    assert(Array.isArray(v.coordinates) && v.coordinates.length===2 && v.coordinates.every(Number.isFinite));
    assert(v.coordinates[0]>40.45 && v.coordinates[0]<41 && v.coordinates[1]>-74.3 && v.coordinates[1]<-73.4,`${id}: coordinates outside NYC/Nassau`);
  }
  assert(Array.isArray(data.events),'events must be an array');
  assert(data.translations?.en?.edition && data.translations.en.events,'English translations required');
  for(const key of ['title','scope'])assert(text(data.translations.en.edition[key]),`English edition.${key} required`);
  const ids=new Set();
  for(const e of data.events) {
    assert(/^[a-z0-9-]+$/.test(e.id),`invalid id: ${e.id}`);assert(!ids.has(e.id),`duplicate id: ${e.id}`);ids.add(e.id);
    for(const key of ['title','description','tip'])assert(text(e[key]),`${e.id}.${key} required`);
    const english=data.translations.en.events[e.id];
    assert(english,`${e.id}: English translation required`);
    for(const key of ['title','description','tip','price','ages'])assert(text(english[key]),`${e.id}: English ${key} required`);
    assert(data.venues[e.venueId],`${e.id}: unknown venue`);
    assert(['nature','art','festival','discovery'].includes(e.category));
    assert(['indoor','outdoor','mixed'].includes(e.setting));
    assert(['ticket','advance','members','drop-in','walk-up','registration','check'].includes(e.booking));
    assert(Number.isInteger(e.ages.min) && e.ages.min>=0);
    assert(e.ages.max===null || Number.isInteger(e.ages.max) && e.ages.max>=e.ages.min);
    assert(['official','editorial','unknown'].includes(e.ages.basis));assert(text(e.ages.label));
    assert(['free','paid','included','members','unknown'].includes(e.price.kind));assert(text(e.price.label));
    assert(e.price.kind!=='free' || e.booking!=='members','membership is not free admission');
    assert(e.source.url.startsWith('https://'));new URL(e.source.url);assert(text(e.source.evidence),`${e.id}: source evidence required`);
    assert(Array.isArray(e.sessions) && e.sessions.length>0,`${e.id}: sessions required`);
    let previous='';
    for(const s of e.sessions) {
      assert(isDate(s.date) && s.date>=edition.start && s.date<=edition.end,`${e.id}: session outside edition`);
      assert(isTime(s.start) && isTime(s.end) && s.start<s.end,`${e.id}: invalid times`);
      if(s.sourceUrl)assert(s.sourceUrl.startsWith('https://'),`${e.id}: session source must be HTTPS`);
      if(s.availability)assert(['unknown','open','closed','full','waitlist'].includes(s.availability),`${e.id}: invalid availability`);
      const key=`${s.date}T${s.start}`;assert(key>previous,`${e.id}: sessions must be unique and sorted`);previous=key;
    }
  }
  assert.deepEqual(Object.keys(data.translations.en.events).sort(),[...ids].sort(),'English and Chinese event IDs must match');
  return {events:data.events.length,sessions:data.events.reduce((n,e)=>n+e.sessions.length,0),venues:Object.keys(data.venues).length};
}
export function validateSources(data,catalog) {
  assert(isDate(catalog.checkedOn));assert(Array.isArray(catalog.sources));
  const ids=new Set(),hosts=new Set();
  for(const s of catalog.sources){
    assert(text(s.id) && !ids.has(s.id),'unique source IDs required');ids.add(s.id);
    assert(text(s.name));assert(['parks','library','venue'].includes(s.kind));
    assert(['partial','scanned','reviewed','limited','pending'].includes(s.status));
    assert(s.status==='pending'?s.checkedOn===null:isDate(s.checkedOn));
    assert(s.url.startsWith('https://'));new URL(s.url);
    assert(text(s.note.zh) && text(s.note.en));assert(Array.isArray(s.hosts));
    for(const host of s.hosts){assert(!hosts.has(host),`source host is ambiguous: ${host}`);hosts.add(host);}
  }
  const enriched={...data,sources:catalog.sources};
  for(const e of data.events){const s=eventSource(enriched,e);assert(s,`missing source registry entry for ${e.id}`);assert(['partial','scanned'].includes(s.status),`${s.id}: invalid contributing source status`);}
  return {sources:ids.size};
}

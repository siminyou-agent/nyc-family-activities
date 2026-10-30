import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_FILTERS as D,dateRange,filterEvents,filtersFromSearch,filtersToSearch,nyDate} from '../public/lib.js';
import {validate,validateSources} from '../scripts/contract.mjs';
import {COPY,localizedEvent} from '../public/i18n.js';
const data=JSON.parse(await readFile(new URL('../datasets/2026-10-24/events.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await readFile(new URL('../datasets/2026-10-24/sources.json',import.meta.url),'utf8'));data.sources=catalog.sources;
test('edition has complete provenance, unique sorted sessions and six regions',()=>{
  assert.equal(validate(data).events,534);assert.equal(validateSources(data,catalog).sources,75);
  assert.equal(new Set(Object.values(data.venues).map(v=>v.region)).size,6);
});
test('NY calendar handles UTC midnight, Sunday and DST weekend',()=>{
  assert.equal(nyDate(new Date('2026-10-25T01:00:00Z')),'2026-10-24');
  assert.deepEqual(dateRange({...D,preset:'this'},data.edition,'2026-10-25'),['2026-10-24','2026-10-25']);
  assert.deepEqual(dateRange({...D,preset:'next'},data.edition,'2026-10-25'),['2026-10-31','2026-11-01']);
  assert.deepEqual(dateRange({...D,preset:'this'},data.edition,'2026-11-01'),['2026-10-31','2026-11-01']);
});
test('free excludes included-admission and membership; Queens Farm 10/31 is not free',()=>{
  const free=filterEvents(data,{...D,free:true});assert(free.length>=161);
  assert(free.every(e=>e.price.kind==='free'));
  assert(!filterEvents(data,{...D,free:true,region:'queens',preset:'custom',start:'2026-10-31',end:'2026-10-31'}).some(e=>e.id==='queens-halloween'));
});
test('date and time filters apply to occurrences, not just activity',()=>{
  const result=filterEvents(data,{...D,preset:'custom',start:'2026-10-31',end:'2026-10-31',time:'evening'});
  assert(result.some(e=>e.id==='bcm-halloween'));assert(!result.some(e=>e.id==='bronx-boo'));
  assert(result.every(e=>e.sessions.every(s=>s.date==='2026-10-31' && s.end>'18:00')));
  const invalid=filterEvents(data,{...D,preset:'custom',start:'2026-11-01',end:'2026-10-24'});assert.equal(invalid.length,0);
});
test('combined age, region and indoor filters and search match real data',()=>{
  const result=filterEvents(data,{...D,region:'nassau',indoor:true,age:'school'});
  assert(result.length>100);assert(result.every(e=>e.venue.region==='nassau' && e.setting==='indoor' && e.ages.basis!=='unknown' && e.ages.min<=12 && (e.ages.max??Infinity)>=6));
  assert(filterEvents(data,{...D,q:'Garden City'}).length>3);
  assert.equal(filterEvents(data,{...D,q:'不存在的活动'}).length,0);
});
test('sources distinguish parks, libraries and unreviewed coverage',()=>{
  assert.equal(filterEvents(data,{...D,source:'nyc-parks'}).length,168);
  assert.equal(filterEvents(data,{...D,source:'library'}).length,340);
  assert.equal(filterEvents(data,{...D,source:'venue'}).length,24);
  assert.equal(filterEvents(data,{...D,source:'nypl'}).length,8);
  assert.equal(data.sources.find(s=>s.id==='nypl').status,'partial');
  assert.equal(data.sources.find(s=>s.id==='nassau-library-bethpage').status,'limited');
  const bad=structuredClone(catalog);bad.sources.find(s=>s.id==='nyc-parks').hosts=[];assert.throws(()=>validateSources(data,bad));
});
test('URL state round-trips and rejects invalid enums/dates',()=>{
  const f={...D,preset:'custom',region:'nassau',town:'north-hempstead',community:'great-neck',q:'亲子',free:true,start:'2026-10-24',end:'2026-11-01',view:'map'};
  assert.deepEqual(filtersFromSearch(filtersToSearch(f)),f);
  assert.deepEqual(filtersFromSearch('?region=invalid&time=oops&start=2026-02-31'),D);
});
test('import contract rejects missing evidence, duplicate IDs and invalid times',()=>{
  for(const mutate of [d=>d.events[0].source.evidence='',d=>d.events.push(d.events[0]),d=>d.events[0].sessions[0].end='25:00',d=>delete d.translations.en.events['bronx-boo']]){
    const d=structuredClone(data);mutate(d);assert.throws(()=>validate(d));
  }
});
test('both languages have complete UI copy and translated activity content',()=>{
  assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.zh).sort());
  for(const event of data.events){
    const en=localizedEvent(event,data,'en');
    assert(!/[\u3400-\u9fff]/u.test([en.title,en.description,en.tip,en.price.label,en.ages.label].join(' ')));
    assert.equal(en.id,event.id);assert.deepEqual(en.sessions,event.sessions);
  }
  assert.equal(filterEvents(data,{...D,q:'Paper Feast',lang:'zh'})[0].id,'sicm-foodscapes');
  assert.equal(filterEvents(data,{...D,q:'紫色',lang:'en'})[0].id,'sicm-purple');
});

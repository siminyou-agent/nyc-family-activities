import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_FILTERS as D,filterEvents,filtersFromSearch,areaKey} from '../public/lib.js';
const data=JSON.parse(await readFile(new URL('../datasets/2026-10-24/events.json',import.meta.url),'utf8'));
data.sources=JSON.parse(await readFile(new URL('../datasets/2026-10-24/sources.json',import.meta.url),'utf8')).sources;
const audit=JSON.parse(await readFile(new URL('../datasets/2026-10-24/nassau_coverage.json',import.meta.url),'utf8'));
test('Nassau coverage reconciles candidates and lists inaccessible calendars honestly',()=>{
  assert.equal(audit.memberLibraries,54);assert.equal(audit.calendarReadable,48);assert.equal(audit.calendarRecords,1382);
  assert.equal(audit.candidateGroups,audit.imported.length+audit.excluded.length+audit.merged.length);
  assert.equal(audit.libraryScopes.filter(s=>s.status!=='ok').length,6);
  assert.equal(audit.showcase.pages,3);assert.equal(audit.showcase.records,140);
  assert(audit.excluded.some(e=>e.reason.includes('cancelled')));
  assert(!data.events.some(e=>['greatneck-book-buddies','syosset-chess','port-creative-readers'].includes(e.id)));
  for(const {id} of audit.imported){const e=data.events.find(e=>e.id===id);assert(e);assert(e.sessions.every(s=>s.sourceUrl));}
});
test('town and community filters use physical branch boundaries and compose with dates',()=>{
  const greatNeck=filterEvents(data,{...D,region:'nassau',town:'north-hempstead',community:'great-neck'});
  assert(greatNeck.length>10);assert(greatNeck.every(e=>e.venue.town==='North Hempstead' && e.venue.community==='Great Neck'));
  const parkville=filterEvents(data,{...D,region:'nassau',town:'north-hempstead',community:'new-hyde-park'});
  assert(parkville.some(e=>e.venue.name.includes('Parkville')));
  const lookout=filterEvents(data,{...D,region:'nassau',town:'hempstead',community:'point-lookout'});
  assert(lookout.length>0);assert(lookout.every(e=>e.venue.town==='Hempstead'));
  const day=filterEvents(data,{...D,region:'nassau',town:'oyster-bay',preset:'custom',start:'2026-10-31',end:'2026-10-31'});
  assert(day.length>0);assert(day.every(e=>e.venue.town==='Oyster Bay' && e.sessions.every(s=>s.date==='2026-10-31')));
  assert.equal(filterEvents(data,{...D,region:'nassau',town:'long-beach',community:'great-neck'}).length,0);
  assert.equal(filtersFromSearch('?region=queens&town=long-beach').town,'all');
  assert.equal(areaKey('North Hempstead'),'north-hempstead');
});
test('availability, age ambiguity, actual free admission and membership prices remain distinct',()=>{
  const nassau=filterEvents(data,{...D,region:'nassau'});
  for(const state of ['closed','full','waitlist'])assert(nassau.some(e=>e.sessions.some(s=>s.availability===state)));
  const unknown=nassau.find(e=>e.ages.basis==='unknown');assert(!filterEvents(data,{...D,age:'preschool'}).some(e=>e.id===unknown.id));
  const fragrance=nassau.filter(e=>/fragrance free event/i.test(e.source.evidence));assert(fragrance.length>0);assert(fragrance.every(e=>e.price.kind!=='free'));
  assert.equal(data.events.find(e=>e.id==='nassau-cradle-stemx').price.kind,'free');
  const art=data.events.find(e=>e.id==='nassau-ncma-family-saturday');assert.equal(art.price.kind,'paid');assert(art.price.label.includes('会员免费'));
  const spanish=nassau.find(e=>e.source.url.includes('hispanic-heritage'));assert(spanish);assert.equal(spanish.ages.max,null,'malformed dropdown bucket must not become a three-month age ceiling');
  const freeport=nassau.filter(e=>e.venue.name==='Freeport Memorial Library' && /Fall Festival/i.test(data.translations.en.events[e.id].title));assert.equal(freeport.length,1);
});

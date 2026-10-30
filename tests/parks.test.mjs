import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseListing,parseDetail} from '../scripts/parks-crawl.mjs';
import {DEFAULT_FILTERS,filterEvents} from '../public/lib.js';
const data=JSON.parse(await readFile(new URL('../datasets/2026-10-24/events.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await readFile(new URL('../datasets/2026-10-24/sources.json',import.meta.url),'utf8'));data.sources=catalog.sources;
const audit=JSON.parse(await readFile(new URL('../datasets/2026-10-24/parks_coverage.json',import.meta.url),'utf8'));

test('all calendar and category pages reconcile independently of published counts',()=>{
  assert.deepEqual(audit.allCalendar,{pages:12,reportedOccurrences:557,parsedUniqueOccurrences:557});
  for(const [category,expected] of Object.entries({kids:156,urbanparkrangers:36,halloween:70,'fall-festivals':27})){
    const cross=audit.crossChecks[category];assert.equal(cross.reported,expected);assert.equal(cross.parsed,expected);assert.deepEqual(cross.missing,[]);
  }
  assert.equal(audit.detailsVerified,174);
  assert.equal(audit.candidateGroups-audit.excluded.length-audit.merged.length,audit.includedActivities);
  assert.equal(audit.includedSessions+audit.excluded.reduce((n,e)=>n+e.occurrences,0)+audit.duplicates.length,audit.candidateOccurrences);
});
test('expanded park records preserve per-occurrence provenance and have no closed registration imports',()=>{
  const parks=filterEvents(data,{...DEFAULT_FILTERS,source:'nyc-parks'});
  assert.equal(parks.length,168);assert.equal(parks.reduce((n,e)=>n+e.sessions.length,0),263);
  for(const event of parks){for(const s of event.sessions){assert(s.sourceUrl.startsWith('https://www.nycgovparks.org/events/'+s.date.replaceAll('-','/')+'/'));}assert(event.source.collection==='nyc-parks-20261024');}
  for(const event of parks){const v=data.venues[event.venueId];assert(!/Location Details:|Directions to this location|©/.test(v.name));assert(v.name.length>0);}
  const urls=parks.flatMap(e=>e.source.relatedUrls);
  for(const omitted of audit.excluded)assert(!urls.includes(omitted.url));
  assert.equal(parks.flatMap(e=>e.sessions).filter(s=>![0,6].includes(new Date(s.date+'T12:00:00Z').getUTCDay())).length,90);
});
test('paid, membership, approximate ages and conflicting duplicate times remain explicit',()=>{
  const park=title=>data.events.find(e=>data.translations.en.events[e.id].title.includes(title));
  assert.equal(park('Haunted Carousel').price.kind,'paid');
  assert.equal(park('Web Weavers').price.kind,'included');
  assert.equal(park('BE BOLD').price.kind,'members');
  assert.equal(park('Spooktacular Party').price.kind,'paid');
  const unknown=park('Spooky Snug Harbor');assert.equal(unknown.ages.basis,'unknown');
  assert(!filterEvents(data,{...DEFAULT_FILTERS,age:'preschool'}).some(e=>e.id===unknown.id));
  const candy=park('Halloween Candy Giveaway');assert.equal(candy.sessions.length,1);assert.equal(candy.sessions[0].start,'16:00');assert.equal(candy.sessions[0].sourceUrls.length,2);assert(candy.tip.includes('17:00'));
});
test('listing parser respects midnight/noon and does not count pagination/category links as events',()=>{
  const parsed=parseListing({url:'https://www.nycgovparks.org/events/f2026-10-24/t2026-11-01',markdown:'Currently viewing 1–2 out of 2 events\n### [Night]'+
  '(https://www.nycgovparks.org/events/2026/10/24/night)\n#### at Park, Queens\n**12:00 a.m.**– **1:00 a.m.**\nNight program.\n**Category:** [Best for Kids](https://www.nycgovparks.org/events/kids)\n**Free!**\n'+
  '### [Noon](https://www.nycgovparks.org/events/2026/10/24/noon)\n#### at Park, Queens\n**12:00 p.m.**– **1:00 p.m.**\nNoon program.\n**Pages:** [2](https://www.nycgovparks.org/events/f2026-10-24/t2026-11-01/p2)'});
  assert.equal(parsed.total,2);assert.equal(parsed.events.length,2);assert.equal(parsed.events[0].start,'00:00');assert.equal(parsed.events[1].start,'12:00');assert.equal(parsed.pageCount,2);
});
test('detail parser does not misread included admission or generic account boilerplate',()=>{
  const d=parseDetail({url:'https://www.nycgovparks.org/events/2026/10/24/example',markdown:'# Family Art\n**Saturday, October 24, 2026**\n**10:00 a.m.**– **1:00 p.m.**\nMake art with family.\n### Location\n**Wave Hill**\nBronx\n[Directions](https://maps.google.com/maps?q=loc:40.8987,-73.9125)\n### Cost\nFree with admission to the grounds\n#### Create an Account\nCreate an account to register.\n### Categories\nArt'});
  assert.equal(d.cost,'Free with admission to the grounds');assert.equal(d.registration,'');assert.equal(d.region,'bronx');assert.deepEqual(d.coordinates,[40.8987,-73.9125]);assert.equal(d.body,'Make art with family.');
});

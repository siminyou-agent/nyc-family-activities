import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate,validateSources} from '../scripts/contract.mjs';
const data=JSON.parse(await readFile(new URL('../public/data/events.json',import.meta.url),'utf8'));
const sources=JSON.parse(await readFile(new URL('../public/data/sources.json',import.meta.url),'utf8'));
test('current edition and source registry satisfy the publishing contract',()=>{
  validate(data);validateSources(data,sources);
});
test('current coverage audits use the edition range and verification date',async()=>{
  for(const name of ['parks_coverage.json','nassau_coverage.json']){
    const audit=JSON.parse(await readFile(new URL('../public/data/'+name,import.meta.url),'utf8'));
    assert.deepEqual(audit.range,{start:data.edition.start,end:data.edition.end});
    assert.equal(audit.verifiedOn||audit.checkedOn,data.edition.verifiedOn);
  }
});
test('scheduled contract rejects a short window, stale verification and missing occurrence provenance',()=>{
  const fixture=structuredClone(data);
  fixture.edition.mode='scheduled';
  fixture.edition.end=fixture.edition.start;
  assert.throws(()=>validate(fixture),/14 inclusive dates/);
  fixture.edition.end=new Date(Date.parse(fixture.edition.start)+13*86400000).toISOString().slice(0,10);
  fixture.edition.verifiedOn='2000-01-01';
  assert.throws(()=>validate(fixture),/verification must match/);
  fixture.edition.verifiedOn=fixture.edition.start;
  delete fixture.events[0].sessions[0].sourceUrl;
  assert.throws(()=>validate(fixture),/official source URL/);
});
test('scheduled source registry rejects historical checked dates',()=>{
  const fixture=structuredClone(data),catalog=structuredClone(sources);
  fixture.edition.mode='scheduled';catalog.checkedOn=fixture.edition.verifiedOn;
  catalog.sources[0].checkedOn='2000-01-01';
  assert.throws(()=>validateSources(fixture,catalog),/stale source checked date/);
});
test('scheduled coverage reconciles the actual calendars and every mapped venue has provenance',async()=>{
  if(data.edition.mode!=='scheduled')return;
  const load=async name=>JSON.parse(await readFile(new URL('../public/data/'+name,import.meta.url),'utf8'));
  const parks=await load('parks_coverage.json'),nassau=await load('nassau_coverage.json'),geo=await load('geocodes.json');
  assert.equal(nassau.memberLibraries,54);
  assert.equal(nassau.libraryScopes.length,54);
  assert.equal(new Set(nassau.libraryScopes.map(l=>l.id)).size,54);
  assert.equal(nassau.libraryScopes.filter(l=>l.status==='ok').length,nassau.calendarReadable);
  assert(parks.audits.length>1);
  for(const audit of parks.audits){
    assert(audit.complete,`incomplete calendar: ${audit.url}`);
    assert.equal(audit.pagesReceived,audit.pagesExpected);
    assert.equal(audit.rows,audit.total);
    assert.deepEqual(audit.missingFromAll,[]);
    assert(audit.url.includes('f'+data.edition.start+'/t'+data.edition.end));
  }
  const included=data.events.filter(e=>e.source.collection?.startsWith('nyc-parks-'));
  assert.equal(included.length,parks.includedActivities);
  assert.equal(included.reduce((n,e)=>n+e.sessions.length,0),parks.includedSessions);
  const seen=new Set();
  for(const e of data.events)for(const s of e.sessions){
    const key=[e.venueId,s.sourceUrl,s.date,s.start,s.end].join('|');
    assert(!seen.has(key),`duplicate occurrence: ${key}`);seen.add(key);
  }
  for(const [id,venue]of Object.entries(data.venues)){
    const evidence=geo.venues[id];assert(evidence,`missing coordinate provenance: ${id}`);
    assert.deepEqual(evidence.coordinates,venue.coordinates);
    assert(evidence.source.startsWith('https://'));
    assert(['US-government-public-domain','ODbL-1.0','publicly-published-factual-coordinates'].includes(evidence.license));
  }
});

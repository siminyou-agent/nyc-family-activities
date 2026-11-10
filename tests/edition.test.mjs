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

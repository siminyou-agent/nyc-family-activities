import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractNYPL} from '../scripts/nypl.mjs';

test('NYPL extraction uses confirmed structured occurrences and handles New York DST',()=>{
  const state={
    'Event:series':{title:'Family program',meta:{canonical:'https://www.nypl.org/events/programs/2026/10/03/example'},body:'Official details',locations:[{__ref:'EventLocation:branch'}],dates:[{__ref:'EventDate:old'},{__ref:'EventDate:first'},{__ref:'EventDate:canceled'},{__ref:'EventDate:dst'}],registration:{type:'none'}},
    'EventLocation:branch':{location:{name:'South Beach Library'}},
    'EventDate:old':{timeStart:'2026-10-03T16:00:00Z',timeEnd:'2026-10-03T17:00:00Z',status:'confirmed'},
    'EventDate:first':{timeStart:'2026-10-24T16:00:00Z',timeEnd:'2026-10-24T17:00:00Z',status:'confirmed'},
    'EventDate:canceled':{timeStart:'2026-10-31T16:00:00Z',timeEnd:'2026-10-31T17:00:00Z',status:'canceled'},
    'EventDate:dst':{timeStart:'2026-11-01T17:00:00Z',timeEnd:'2026-11-01T18:00:00Z',status:'confirmed'}
  };
  const html=`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{initialApolloState:state}}})}</script>`;
  const result=extractNYPL(html);
  assert.deepEqual(result.sessions,[{date:'2026-10-24',start:'12:00',end:'13:00',endDate:'2026-10-24'},{date:'2026-11-01',start:'12:00',end:'13:00',endDate:'2026-11-01'}]);
  assert.equal(result.locations[0].location.name,'South Beach Library');
  assert.throws(()=>extractNYPL('<html>Loading events...</html>'),/No public Next.js data/);
});

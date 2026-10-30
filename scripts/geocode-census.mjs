// Replace third-party geocoder results with US Census public-domain coordinates.
// Only public venue addresses are sent. Failed/ambiguous matches are not applied.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const file=new URL('../public/data/events.json',import.meta.url);
const data=JSON.parse(await readFile(file,'utf8'));
const results={};
for(const [id,venue] of Object.entries(data.venues).filter(([,v])=>v.region==='nassau')) {
  const url=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.search=new URLSearchParams({address:venue.address,benchmark:'Public_AR_Current',format:'json'});
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const matches=(await response.json()).result.addressMatches;
    if(matches.length!==1)throw new Error(`${matches.length} matches`);
    const match=matches[0],{x,y}=match.coordinates;
    if(y<40.45 || y>41 || x< -74.3 || x> -73.4)throw new Error('Out of bounds');
    results[id]={address:venue.address,matchedAddress:match.matchedAddress,coordinates:[y,x],source:url.href};
    console.log(`${id}: matched`);
  } catch(error) {
    results[id]={address:venue.address,error:error.message};
    console.log(`${id}: ${error.message}`);
  }
}
await mkdir(new URL('../staging/',import.meta.url),{recursive:true});
await writeFile(new URL('../staging/census-geocodes.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(`Matched ${Object.values(results).filter(r=>r.coordinates).length}/${Object.keys(results).length}. Review staging/census-geocodes.json before applying.`);

import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function plain(value='') {
  return value.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}
export function parseListing(result) {
  const text=result.markdown || '';
  const pattern=/^### \[([^\n]+)\]\((https:\/\/www\.nycgovparks\.org\/events\/\d{4}\/\d{2}\/\d{2}\/[^)]+)\)/gm;
  const matches=[...text.matchAll(pattern)],events=[];
  for(let i=0;i<matches.length;i++) {
    const match=matches[i],block=text.slice(match.index,matches[i+1]?.index ?? text.length).split(/^## (?:Related Information|Search Events|Filter )/m)[0];
    const url=match[2],dateParts=url.match(/\/events\/(\d{4})\/(\d{2})\/(\d{2})\//);
    const times=[...block.matchAll(/(\d{1,2}):(\d{2})\s*([ap])\.m\./gi)].slice(0,2).map(m=>`${String(Number(m[1])%12+(m[3].toLowerCase()==='p'?12:0)).padStart(2,'0')}:${m[2]}`);
    const location=plain(block.match(/^####\s+at\s+(.+)$/m)?.[1] || '');
    const categories=[...block.matchAll(/\[([^\]]+)\]\(https:\/\/www\.nycgovparks\.org\/events\/(?!\d{4})[^)]+\)/g)].map(m=>plain(m[1]));
    const timeLine=block.split('\n').findIndex(line=>/\d:\d{2}\s*[ap]\.m\./i.test(line));
    const description=plain(block.split('\n').slice(timeLine+1).join('\n').split(/\*\*Category:|\*\*Free!|\*\*Pages:|Best For|Must See/)[0]);
    events.push({url,title:plain(match[1]),date:`${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`,start:times[0] || null,end:times[1] || null,location,categories,free:/Free!/i.test(block),description,listing:result.url,raw:block.trim()});
  }
  const total=Number(text.match(/out of ([\d,]+) events/)?.[1]?.replaceAll(',','') || text.match(/Currently viewing ([\d,]+) events/)?.[1]?.replaceAll(',','')) || null;
  const pages=[...text.matchAll(/\/p(\d+)\)/g)].map(m=>Number(m[1]));
  return {url:result.url,total,pageCount:Math.max(1,...pages),events};
}
export function parseDetail(result) {
  const markdown=result.markdown || '',metadata=result.metadata || {};
  const main=markdown.slice(markdown.search(/^# /m)).split(/^## Related Information/m)[0];
  const section=name=>main.match(new RegExp(`^### ${name}\\s*\\n([\\s\\S]*?)(?=^#{2,4} |$(?![\\s\\S]))`,'m'))?.[1]?.trim() || '';
  const location=section('Location'),cost=plain(section('Cost')),registration=plain(section('Registration'));
  const beforeLocation=main.split(/^### Location/m)[0];
  const body=beforeLocation.split('\n').filter(line=>!/^# |^\*\*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),|^\*\*\d{1,2}:/.test(line.trim()) && !/^(?:Please note: This event has already taken place|Please use the Search options|This event repeats)/.test(plain(line))).join('\n');
  const combined=`${markdown} ${result.html || ''}`;
  const match=combined.match(/(?:loc:|loc%3A)(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i);
  const lat=metadata.latitude,lng=metadata.longitude;
  const coordinates=match?[Number(match[1]),Number(match[2])]:Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat!==undefined && lng!==undefined?[Number(lat),Number(lng)]:null;
  const place=plain(location).replace(/^© City of New York © OpenStreetMap contributors\s*/,'');
  const borough=place.match(/\b(Manhattan|Brooklyn|Queens|Bronx|Staten Island)\b/)?.[1];
  const address=Array.isArray(metadata.streetAddress)?metadata.streetAddress[0]:metadata.streetAddress;
  const venueName=plain(location.match(/\*\*([^*]+)\*\*/)?.[1] || '');
  return {url:result.url,title:plain(main.match(/^# (.+)$/m)?.[1]),body:plain(body),venueName,location:place,address:address || '',region:borough==='Staten Island'?'staten-island':borough?.toLowerCase() || (/New York,? NY|Manhattan/.test(place)?'manhattan':null),coordinates,cost,registration,organizer:plain(section('Event Organizer')),contact:plain(section('Contact Number')),statusCode:metadata.statusCode || 200,raw:main};
}
export async function reviewDetails(directory) {
  const index=JSON.parse(await readFile(resolve(directory,'index.json'),'utf8'));
  const details=new Map();
  for(const file of (await readdir(directory)).filter(n=>/^details_.*\.json$/.test(n))){const payload=JSON.parse(await readFile(resolve(directory,file),'utf8'));for(const result of payload.data.results || [])if(result.markdown)details.set(result.url,parseDetail(result));}
  let previous=[];try{previous=JSON.parse(await readFile(resolve(directory,'review.json'),'utf8'));}catch{}
  const existingNumbers=new Map(previous.map(row=>[row.representative,row.n]));let last=Math.max(0,...previous.map(row=>row.n));
  const rows=index.familyGroupsToReview.map(group=>({n:existingNumbers.get(group.representative) || ++last,...group,detail:details.get(group.representative)})).sort((a,b)=>a.n-b.n);
  await writeFile(resolve(directory,'review.json'),JSON.stringify(rows,null,2)+'\n');
  const compact=rows.map(row=>({n:row.n,title:row.occurrences[0].title,venue:row.detail?.venueName,region:row.detail?.region,body:row.detail?.body.slice(0,650),restrictions:[...row.detail.body.matchAll(/[^.!?]*(?:ages?\s*\d|\d\s*(?:years? old|and (?:up|older|over))|grades?\s|under \d|membership|members.only|lottery|cancelled|canceled|must be accompanied|fee|ticket)[^.!?]*[.!?]?/gi)].map(m=>m[0].trim()),cost:row.detail?.cost,registration:row.detail?.registration}));
  await writeFile(resolve(directory,'review_table.jsonl'),compact.map(r=>JSON.stringify(r)).join('\n')+'\n');
  console.log(JSON.stringify({groups:rows.length,missingGeo:rows.filter(r=>!r.detail.coordinates).map(r=>r.n),missingRegion:rows.filter(r=>!r.detail.region).map(r=>r.n),missingDetail:rows.filter(r=>!r.detail).length,review:'review_table.jsonl'}));
}
function isFamily(event) {
  const cats=event.categories.join(' '),copy=`${event.title} ${event.description}`;
  if(/^NYRR Open Run:/i.test(event.title))return true;
  if(/Best for Kids|Urban Park Rangers|Halloween|Fall Festivals|Festivals/i.test(cats))return true;
  return /\b(?:family|families|kids|children|toddler|preschool|youth|all ages)\b/i.test(copy);
}
export async function indexListings(directory,start,end) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start>end)throw new Error('Explicit START END dates required');
  const files=(await readdir(directory)).filter(n=>/^listing.*\.json$/.test(n));
  const pages=new Map();
  for(const file of files){const payload=JSON.parse(await readFile(resolve(directory,file),'utf8'));for(const result of payload.data?.results || [])if(result.markdown)pages.set(result.url,parseListing(result));}
  const all=[...pages.values()].filter(p=>new RegExp(`^https://www\\.nycgovparks\\.org/events/f${start}/t${end}(?:/p\\d+)?$`).test(p.url));
  const unique=new Map();for(const page of all)for(const event of page.events)unique.set(event.url,event);
  const events=[...unique.values()].sort((a,b)=>`${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  const family=events.filter(isFamily);
  // Group only identical titles and meeting-location labels. Details are still
  // checked before merging occurrences, particularly programs with age limits.
  const grouped=new Map();for(const event of family){const key=`${event.title.toLowerCase()}|${event.location.toLowerCase()}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(event);}
  const categoryAudit=[...pages.values()].filter(p=>/\/events\/(?:kids|urbanparkrangers|halloween|fall-festivals)\//.test(p.url)).map(p=>({url:p.url,reportedTotal:p.total,pageCount:p.pageCount,rows:p.events.length,missingFromAll:p.events.filter(e=>!unique.has(e.url)).map(e=>e.url)}));
  const report={snapshot:start,range:{start,end},allPages:all.map(p=>({url:p.url,total:p.total,rows:p.events.length})),advertisedTotal:all[0]?.total,uniqueOccurrences:events.length,familyOccurrences:family.length,familyGroups:grouped.size,categoryAudit,events,familyGroupsToReview:[...grouped].map(([key,occurrences])=>({key,representative:occurrences[0].url,occurrences}))};
  await writeFile(resolve(directory,'index.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
async function collectDetails(directory) {
  const index=JSON.parse(await readFile(resolve(directory,'index.json'),'utf8'));
  if(!index.advertisedTotal || index.uniqueOccurrences!==index.advertisedTotal || !index.allPages.length)throw new Error('Calendar pagination is incomplete; do not collect from a partial index');
  const allFiles=await readdir(directory),done=new Set();
  for(const file of allFiles.filter(n=>/^details_.*\.json$/.test(n))){const data=JSON.parse(await readFile(resolve(directory,file),'utf8'));for(const r of data.data?.results || [])if(r.markdown)done.add(r.url);}
  const urls=index.familyGroupsToReview.map(g=>g.representative).filter(u=>!done.has(u));
  for(let i=0;i<urls.length;i+=8){
    const batch=urls.slice(i,i+8),out=resolve(directory,`details_${Date.now()}_${i}.json`);
    if(!process.env.EXTRACT_COMMAND)throw new Error('Set EXTRACT_COMMAND to a compatible Markdown extraction CLI executable');
    const code=await new Promise((resolveCode,reject)=>{const p=spawn(process.env.EXTRACT_COMMAND,['extract',...batch,'--output',out],{stdio:'inherit'});p.on('error',reject);p.on('close',resolveCode);});
    if(code!==0)throw new Error(`Firecrawl batch exited ${code}; inspect partial results before continuing`);
    const payload=JSON.parse(await readFile(out,'utf8'));
    console.log(JSON.stringify({batch:i/8+1,processed:Math.min(i+8,urls.length),total:urls.length,success:payload.data.result_count,failed:payload.data.failed_count}));
    if(payload.data.failed_count)throw new Error('Some details failed; rerun resumes only missing URLs');
    if(i+8<urls.length)await new Promise(resolve=>setTimeout(resolve,65000));
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
   const [command,directory,start,end]=process.argv.slice(2);if(!directory)throw new Error('Usage: node scripts/parks-crawl.mjs index DIRECTORY START END | details DIRECTORY | review DIRECTORY');
   if(command==='index'){const r=await indexListings(resolve(directory),start,end);console.log(JSON.stringify({allPages:r.allPages,advertisedTotal:r.advertisedTotal,uniqueOccurrences:r.uniqueOccurrences,familyOccurrences:r.familyOccurrences,familyGroups:r.familyGroups,categoryAudit:r.categoryAudit},null,2));}
  else if(command==='details')await collectDetails(resolve(directory));else if(command==='review')await reviewDetails(resolve(directory));else throw new Error('Unknown command');
}

import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {validate,validateSources} from './contract.mjs';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check');
const data=JSON.parse(await readFile(new URL('public/data/events.json',root),'utf8'));
validate(data);
validateSources(data,JSON.parse(await readFile(new URL('public/data/sources.json',root),'utf8')));
if(!/^[a-z0-9][a-z0-9-]*$/.test(data.edition.id))throw new Error('Unsafe edition ID');
const cell=value=>{if(typeof value==='number')return String(value);let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
const rows=[['edition','event_id','title_en','title_zh','date','start','end','timezone','venue','region','city','address','latitude','longitude','price_kind','price_en','booking','availability','official_url','verified_on']];
for(const e of data.events){const v=data.venues[e.venueId],en=data.translations.en.events[e.id];for(const s of e.sessions)rows.push([data.edition.id,e.id,en.title,e.title,s.date,s.start,s.end,data.edition.timezone,v.name,v.region,v.city,v.address,...v.coordinates,e.price.kind,en.price,e.booking,s.availability||'unknown',s.sourceUrl||e.source.url,data.edition.verifiedOn]);}
const csv=rows.map(row=>row.map(cell).join(',')).join('\n')+'\n';
async function generated(url,content,immutable=false){
  let existing;try{existing=await readFile(url,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing===content)return;
  if(check)throw new Error(`Generated file missing or stale: ${url.pathname.split('/').slice(-3).join('/')}`);
  if(immutable && existing!==undefined)throw new Error('Edition archive is immutable. Use a new edition ID for corrected data.');
  await writeFile(url,content);
}
await generated(new URL('public/data/sessions.csv',root),csv);
const archive=new URL(`datasets/${data.edition.id}/`,root);
if(!check)await mkdir(archive,{recursive:true});
for(const name of (await readdir(new URL('public/data/',root))).filter(n=>/\.(json|csv)$/.test(n) && n!=='release.json'))await generated(new URL(name,archive),await readFile(new URL(`public/data/${name}`,root),'utf8'),true);
console.log(`Edition ${data.edition.id}: ${rows.length-1} CSV rows and snapshot ${check?'verified':'exported'}.`);

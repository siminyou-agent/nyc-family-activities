import {pathToFileURL} from 'node:url';

// NYPL's calendar can remain on a loading skeleton while official event pages
// still contain their complete public Apollo state in server-rendered HTML.
export function extractNYPL(html,{start='2026-10-24',end='2026-11-01'}={}) {
  const match=html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if(!match)throw new Error('No public Next.js data found on NYPL page');
  const state=JSON.parse(match[1]).props?.pageProps?.initialApolloState;
  if(!state)throw new Error('No public Apollo state found');
  const event=Object.entries(state).find(([key])=>key.startsWith('Event:'))?.[1];
  if(!event)throw new Error('No NYPL Event entity on page');
  const parts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  const local=value=>{const p=parts(value);return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};};
  const sessions=event.dates.map(ref=>state[ref.__ref]).filter(d=>d && d.status==='confirmed').map(d=>{
    const a=local(d.timeStart),b=local(d.timeEnd);
    return {date:a.date,start:a.time,end:b.time,endDate:b.date};
  }).filter(s=>s.date>=start && s.date<=end).sort((a,b)=>`${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  return {title:event.title,url:event.meta.canonical,body:event.body,format:event.eventFormat,audiences:event.audienceInterest,registration:event.registration,locations:event.locations.map(ref=>state[ref.__ref]),sessions};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),options={},urls=[];
  while(args.length){const arg=args.shift();if(arg==='--start' || arg==='--end')options[arg.slice(2)]=args.shift();else urls.push(arg);}
  if(!urls.length || !/^\d{4}-\d{2}-\d{2}$/.test(options.start) || !/^\d{4}-\d{2}-\d{2}$/.test(options.end) || options.start>options.end)throw new Error('Usage: node scripts/nypl.mjs OFFICIAL_URL --start YYYY-MM-DD --end YYYY-MM-DD');
  for(const url of urls){
    const u=new URL(url);if(u.origin!=='https://www.nypl.org' || !u.pathname.startsWith('/events/programs/'))throw new Error('Use an official NYPL event-page URL');
    const response=await fetch(u,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`NYPL returned ${response.status}`);
    console.log(JSON.stringify(extractNYPL(await response.text(),options),null,2));
  }
}

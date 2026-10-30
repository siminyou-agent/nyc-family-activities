export const REGIONS = {all:'全部地区',manhattan:'Manhattan',brooklyn:'Brooklyn',queens:'Queens',bronx:'Bronx','staten-island':'Staten Island',nassau:'Nassau County'};
export const CATEGORIES = {all:'全部类型',nature:'自然与动物',art:'音乐与手作',festival:'节庆与市集',discovery:'探索与体验'};
export const ICONS = {nature:'♧',art:'♫',festival:'✧',discovery:'◎'};
export const DEFAULT_FILTERS = {preset:'edition',region:'all',town:'all',community:'all',age:'all',time:'all',category:'all',free:false,indoor:false,q:'',view:'list',start:'',end:'',lang:'en',source:'all'};
export const areaKey=value=>String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export function nyDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0,10);
}
export function dateRange(filters, edition, today = nyDate()) {
  if(filters.preset === 'custom') return [filters.start || edition.start,filters.end || edition.end];
  if(filters.preset === 'edition') return [edition.start,edition.end];
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  // A Sunday still belongs to the weekend that began yesterday.
  const saturday = shiftDate(today,weekday === 0 ? -1 : 6-weekday);
  const start = shiftDate(saturday,filters.preset === 'next' ? 7 : 0);
  return [start,shiftDate(start,1)];
}
export function overlapsTime(session,time) {
  const ranges = {morning:['00:00','12:00'],afternoon:['12:00','18:00'],evening:['18:00','24:00']};
  return time === 'all' || (session.start < ranges[time][1] && session.end > ranges[time][0]);
}
export function filterEvents(data, filters, today) {
  const [start,end] = dateRange(filters,data.edition,today);
  if(start > end) return [];
  const ageRange = filters.age === 'preschool' ? [0,5] : [6,12];
  return data.events.flatMap(event => {
    const venue = data.venues[event.venueId];
    const source=data.sources?eventSource(data,event):null;
    if(filters.source && filters.source!=='all' && filters.source!==source?.kind && filters.source!==source?.id)return [];
    if(filters.region !== 'all' && venue.region !== filters.region) return [];
    if(filters.region==='nassau' && filters.town && filters.town!=='all' && areaKey(venue.town)!==filters.town)return [];
    if(filters.region==='nassau' && filters.community && filters.community!=='all' && areaKey(venue.community || venue.city)!==filters.community)return [];
    if(filters.category !== 'all' && event.category !== filters.category) return [];
    if(filters.free && event.price.kind !== 'free') return [];
    if(filters.indoor && event.setting !== 'indoor') return [];
    if(filters.age !== 'all' && (event.ages.min > ageRange[1] || (event.ages.max ?? Infinity) < ageRange[0])) return [];
    if(filters.age !== 'all' && event.ages.basis==='unknown')return [];
    const english=data.translations?.en?.events?.[event.id];
    const haystack = `${event.title} ${event.description} ${english?.title || ''} ${english?.description || ''} ${venue.name} ${venue.city} ${venue.town || ''} ${venue.address} ${REGIONS[venue.region]}`.toLowerCase();
    if(filters.q.trim() && !haystack.includes(filters.q.trim().toLowerCase())) return [];
    const sessions = event.sessions.filter(s => s.date >= start && s.date <= end && overlapsTime(s,filters.time));
    return sessions.length ? [{...event,venue,sessions}] : [];
  }).sort((a,b) => `${a.sessions[0].date}T${a.sessions[0].start}`.localeCompare(`${b.sessions[0].date}T${b.sessions[0].start}`) || a.id.localeCompare(b.id));
}
export function formatDate(date,language='zh') {
  const d = new Date(`${date}T12:00:00Z`);
  return `${d.getUTCMonth()+1}/${d.getUTCDate()} ${language==='en'?['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]:`周${'日一二三四五六'[d.getUTCDay()]}`}`;
}
export function filtersFromSearch(search) {
  const p = new URLSearchParams(search), f = {...DEFAULT_FILTERS};
  const enums = {preset:['edition','this','next','custom'],region:Object.keys(REGIONS),age:['all','preschool','school'],time:['all','morning','afternoon','evening'],category:Object.keys(CATEGORIES),view:['list','map'],lang:['zh','en']};
  for(const [key,values] of Object.entries(enums)) if(values.includes(p.get(key))) f[key]=p.get(key);
  for(const key of ['start','end']) {
    const value = p.get(key);
    if(/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value) f[key]=value;
  }
  f.free=p.get('free')==='1';f.indoor=p.get('indoor')==='1';f.q=p.get('q') || '';
  if(/^[a-z][a-z0-9-]{0,50}$/.test(p.get('source') || ''))f.source=p.get('source');
  if(f.region==='nassau')for(const key of ['town','community'])if(/^[a-z][a-z0-9-]{0,60}$/.test(p.get(key) || ''))f[key]=p.get(key);
  return f;
}
export function filtersToSearch(filters) {
  const p = new URLSearchParams();
  for(const [key,value] of Object.entries(filters)) if(value !== DEFAULT_FILTERS[key]) p.set(key,typeof value === 'boolean' ? (value?'1':'0') : value);
  return p.toString();
}
import {eventSource} from './sources.js';

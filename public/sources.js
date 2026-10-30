export function eventSource(data,event) {
  const host=new URL(event.source.url).hostname;
  return data.sources.find(s=>s.hosts.includes(host));
}
export function sourceCount(data,id) {
  return data.events.filter(e=>eventSource(data,e)?.id===id).length;
}

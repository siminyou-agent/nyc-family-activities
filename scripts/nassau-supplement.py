"""Cache the NLS showcase REST pagination for a cross-check, not a full calendar."""
import json
import argparse
import sys
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--start', required=True)
parser.add_argument('--end', required=True)
args = parser.parse_args()
D = args.directory
events = []
page = 1
while True:
    path = D / f"nls_showcase_{page}.json"
    url = f"https://events.nassaulibrary.org/wp-json/tribe/events/v1/events?start_date={args.start}&end_date={args.end}T23:59:59&per_page=50&page={page}"
    if path.exists():
        value = json.loads(path.read_text())
    else:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            value = json.load(response)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    path.with_suffix('.status.json').write_text(json.dumps({'url': url, 'status': 200, 'checkedOn': args.start}))
    events.extend(value["events"])
    print(json.dumps({"page": page, "records": len(value["events"]), "total": value.get("total")}))
    if page >= value.get('total_pages', 1): break
    page += 1
in_range = [e for e in events if args.start <= e["start_date"][:10] <= args.end]
(D / 'showcase_audit.json').write_text(json.dumps({'checkedOn': args.start, 'range': {'start': args.start, 'end': args.end}, 'pages': page, 'records': len(events), 'inRange': len(in_range), 'supplementaryOnly': True}, indent=2))
print(json.dumps({"records": len(events), "in_range": len(in_range)}))
for e in in_range:
    venue = e.get("venue") or {}
    print(json.dumps({"title": e["title"], "date": e["start_date"], "website": e.get("website"), "venue": venue.get("venue") if isinstance(venue, dict) else None, "categories": [c["name"] for c in e.get("categories", [])]}, ensure_ascii=False))

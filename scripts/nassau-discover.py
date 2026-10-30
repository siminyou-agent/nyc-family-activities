"""Discover official Nassau library calendar endpoints from the NLS directory."""
import argparse
import concurrent.futures
import html
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
args = parser.parse_args()
directory = args.directory
directory.mkdir(parents=True, exist_ok=True)

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.current = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self.current = {"href": a["href"], "text": ""}; self.links.append(self.current)
    def handle_data(self, data):
        if self.current is not None: self.current["text"] += data
    def handle_endtag(self, tag):
        if tag == "a": self.current = None

def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "NYCFamilyActivities/0.1 (+https://nyc-family-weekend.pages.dev/)"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.geturl(), response.read().decode("utf8", errors="replace")

source = "https://nassaulibrary.org/members/"
final, document = get(source)
(directory / "member_directory.html").write_text(document)
libraries = []
for article in re.findall(r"<article\b[^>]*>.*?</article>", document, re.S):
    name = re.search(r'aria-label="([^"]+)"', article)
    link = re.search(r'class="card-header-title"\s+href="([^"]+)"', article)
    address = re.search(r'<a class="directions"[^>]*>(.*?)</a>', article, re.S)
    if not name or not link: continue
    name = html.unescape(name.group(1)); url = html.unescape(link.group(1))
    url = re.sub(r"^http:", "https:", url)
    address = html.unescape(re.sub(r"<[^>]+>", "\n", address.group(1))) if address else ""
    address = re.sub(r"\s*\n\s*", ", ", address).strip()
    city_match = re.search(r",\s*([^,]+),\s*NY\s+\d{5}", address)
    libraries.append({"id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), "name": name, "url": url, "address": address, "city": city_match.group(1) if city_match else ""})

def inspect(library):
    record = dict(library); cache = directory / (library["id"] + "_home.html")
    try:
        if cache.exists(): final, text = library["url"], cache.read_text()
        else:
            final, text = get(library["url"]); cache.write_text(text)
        links = Links(); links.feed(text)
        calendar = []
        for link in links.links:
            u = urllib.parse.urljoin(final, html.unescape(link["href"]))
            label = re.sub(r"\s+", " ", link["text"]).strip()
            if not u.startswith("https://"): continue
            if re.search(r"librarycalendar\.com|libcal\.com|assabetinteractive\.com|eventkeeper\.com|events\.getlocalhop\.com", u) or re.search(r"\bcalendar\b|events|program registration", label, re.I):
                if u not in [x["url"] for x in calendar]: calendar.append({"url": u, "label": label[:100]})
        record.update({"homeStatus": "ok", "finalURL": final, "calendars": calendar})
    except Exception as error: record.update({"homeStatus": "limited", "error": str(error), "calendars": []})
    return record

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(inspect, libraries))
output = {"source": source, "directoryEntries": len(libraries), "libraries": results}
(directory / "discovery.json").write_text(json.dumps(output, ensure_ascii=False, indent=2))
for library in results:
    print(json.dumps({"name": library["name"], "city": library["city"], "status": library["homeStatus"], "calendars": library["calendars"][:5]}, ensure_ascii=False), flush=True)
print(json.dumps({"directory_entries": len(results), "accessible_homepages": sum(r["homeStatus"] == "ok" for r in results)}))

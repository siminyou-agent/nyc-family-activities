# /// script
# requires-python = ">=3.11"
# dependencies = ["beautifulsoup4>=4.13,<5", "icalendar>=6,<7", "python-dateutil>=2.9,<3"]
# ///
"""Collect dated public library feeds, preserving complete responses and scope."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup
from icalendar import Calendar
from dateutil.rrule import rrulestr

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
parser.add_argument("--start", required=True)
parser.add_argument("--end", required=True)
args = parser.parse_args()
D = args.directory
NY = ZoneInfo("America/New_York")
START = dt.date.fromisoformat(args.start)
END = dt.date.fromisoformat(args.end)
if END < START: parser.error("end precedes start")
CHILD = re.compile(r"children|\bchild\b|\bkids\b|\bbab(?:y|ies)\b|toddler|preschool|pre.school|pre.?k\b|early childhood|\bfamil(?:y|ies)\b|tweens?|jr\.? levels|\bgrades?\s*(?:k|[1-6])\b", re.I)

def text(node):
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True) if hasattr(node, "get_text") else str(node)).strip()

def fetch(url):
    file = D / ("http_" + hashlib.sha256(url.encode()).hexdigest()[:18] + ".txt")
    if file.exists(): return file.read_text()
    req = urllib.request.Request(url, headers={"User-Agent": "NYCFamilyActivities/0.1 (+https://nyc-family-weekend.pages.dev/)"})
    evidence = {"url": url, "checkedOn": START.isoformat()}
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            result = response.read().decode("utf8", errors="replace")
            evidence.update(status=response.status, finalURL=response.geturl())
    except Exception as error:
        evidence.update(status=getattr(error, "code", None), error=str(error))
        file.with_suffix(".status.json").write_text(json.dumps(evidence, indent=2))
        raise
    file.with_suffix(".status.json").write_text(json.dumps(evidence, indent=2))
    file.write_text(result)
    return result

def calendar_links(document, base):
    soup = BeautifulSoup(document, "html.parser")
    urls = []
    for tag in soup.find_all(["a", "iframe", "script"]):
        value = tag.get("href") or tag.get("src")
        if not value: continue
        value = urllib.parse.urljoin(base, value)
        if re.search(r"(?:libcal\.com|librarycalendar\.com|assabetinteractive\.com|eventkeeper\.com|whofi\.com)", value): urls.append(value)
    for value in re.findall(r'https?://[^\s<>"\x27]+(?:libcal\.com|librarycalendar\.com|assabetinteractive\.com)[^\s<>"\x27]*', document): urls.append(value)
    return list(dict.fromkeys(u.replace("&amp;", "&") for u in urls))

discovery = json.loads((D / "discovery.json").read_text())
fallback_path = D / "details_discovery.json"
fallback = json.loads(fallback_path.read_text())["data"]["results"] if fallback_path.exists() else []
unique = {}
for library in discovery["libraries"]:
    if library["id"] not in unique:
        unique[library["id"]] = {**library, "branches": []}
    unique[library["id"]]["branches"].append({"address": library["address"], "city": library["city"]})
libraries = list(unique.values())
for library in libraries:
    links = [x["url"] for x in library["calendars"]]
    home = D / (library["id"] + "_home.html")
    if home.exists(): links += calendar_links(home.read_text(), library["url"])
    host = urllib.parse.urlparse(library["url"]).hostname.removeprefix("www.")
    for result in fallback:
        if urllib.parse.urlparse(result["url"]).hostname.removeprefix("www.") == host:
            links += calendar_links(result.get("html", ""), result["url"])
    library["calendarURLs"] = list(dict.fromkeys(links))

def get_availability(value):
    if re.search(r"^\s*(?:cancelled|canceled|postponed)\b", value, re.I): return "cancelled"
    if re.search(r"registration (?:is |has )?closed|registration has closed|registrations? (?:are |is )?fully booked", value, re.I): return "closed"
    if re.search(r"(?:^|\n)\s*Waitlist\s*(?:\n|$)", value, re.I): return "waitlist"
    if re.search(r"(?:^|\n)\s*Full\s*(?:\n|$)", value, re.I): return "full"
    if re.search(r"Registration Open|Registration will close|Registration is open", value, re.I): return "open"
    return "unknown"

def candidate(title, groups, body):
    if re.search(r"\b(?:teen|adult|senior)\b", " ".join(groups), re.I) and not CHILD.search(" ".join(groups) + " " + title): return False
    if re.search(r"donation|drive\b|early voting|board of trustees|room available|library clos|book sale|shredding", title, re.I): return False
    if CHILD.search(" ".join(groups) + " " + title): return True
    return bool(re.search(r"all ages|children and|kids and|parent.child|caregiver|storytime|lego|minecraft", title + " " + body, re.I))

def local(value):
    if isinstance(value, dt.datetime):
        value = value.replace(tzinfo=NY) if value.tzinfo is None else value.astimezone(NY)
        return value.date(), value.strftime("%H:%M"), False
    return value, None, True

def libcal(library, urls):
    base = urllib.parse.urlparse(urls[0]); origin = f"https://{base.netloc}"
    cids = set()
    for url in urls:
        if urllib.parse.urlparse(url).netloc != base.netloc: continue
        query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        for key in ("cid", "cal_id"):
            for value in query.get(key, []):
                if value.isdigit() and int(value) > 0: cids.add(value)
    if not cids:
        root = fetch(origin + "/")
        cids.update(re.findall(r"[?&](?:cid|cal_id)=(\d+)", root))
        cids.discard("0")
        if not cids:
            soup = BeautifulSoup(root, "html.parser")
            friendly = list(dict.fromkeys(urllib.parse.urljoin(origin, a["href"]) for a in soup.select("a[href]") if "/calendar/" in a["href"] and "?" not in a["href"] and not re.search(r"admin|staff", a["href"], re.I)))
            for calendar_url in friendly:
                page = fetch(calendar_url)
                cids.update(re.findall(r"[?&](?:cid|cal_id|cal%5B%5D)=(\d+)", page, re.I))
                for option in BeautifulSoup(page, "html.parser").select("#cal-dd option"):
                    value = option.get("value", "")
                    if value.isdigit() and int(value) > 0 and not re.search(r"admin|staff", text(option), re.I): cids.add(value)
    cids.discard("0")
    if not cids: raise ValueError("Calendar ID not exposed in public page")
    records = []; feeds = []
    for cid in sorted(cids):
        url = origin + "/ical_subscribe.php?src=p&cid=" + cid
        response = fetch(url)
        if "BEGIN:VCALENDAR" not in response: raise ValueError("Public iCal response is not a calendar")
        calendar = Calendar.from_ical(response); count = 0
        for event in calendar.walk("VEVENT"):
            if not event.get("DTSTART"): continue
            start_value = event.decoded("DTSTART"); end_value = event.decoded("DTEND") if event.get("DTEND") else start_value
            date, start, all_day = local(start_value); end_date, end, _ = local(end_value)
            occurrences = [(date, start, end, all_day)]
            if event.get("RRULE") and isinstance(start_value, dt.datetime):
                rule = rrulestr(event["RRULE"].to_ical().decode(), dtstart=start_value)
                duration = end_value - start_value
                occurrences = [(local(t)[0], local(t)[1], local(t + duration)[1], False) for t in rule.between(dt.datetime.combine(START, dt.time.min, NY), dt.datetime.combine(END + dt.timedelta(days=1), dt.time.min, NY), inc=True)]
            for date, start, end, all_day in occurrences:
                if not START <= date <= END: continue
                count += 1
                title = str(event.get("SUMMARY", "")); body = str(event.get("DESCRIPTION", "")); location = str(event.get("LOCATION", ""))
                groups = [str(x) for x in getattr(event.get("CATEGORIES"), "cats", [])]
                status = "cancelled" if str(event.get("STATUS", "")).upper() == "CANCELLED" or re.search(r"cancelled|canceled|postponed", title, re.I) else "unknown"
                records.append({"libraryId": library["id"], "title": title, "date": date.isoformat(), "start": start, "end": end, "allDay": all_day, "groups": groups, "body": body, "location": location, "url": str(event.get("URL", "")), "feed": url, "availability": status, "candidate": candidate(title, groups, body), "rawUID": str(event.get("UID", ""))})
        feeds.append({"url": url, "eventsInRange": count, "totalEvents": len(calendar.walk("VEVENT"))})
    return records, {"platform": "libcal-ical", "origin": origin, "feeds": feeds, "completeDates": [START.isoformat(), END.isoformat()]}

def parse_daily(document, origin, date, library):
    soup = BeautifulSoup(document, "html.parser"); records = []
    for article in soup.select("article.node--type-lc-event"):
        link = article.select_one(".lc-event__title a")
        if not link: continue
        title = text(link); url = urllib.parse.urljoin(origin, link["href"])
        groups = [text(span).split('"')[1] for span in article.select(".lc-event__color-indicator span") if '"' in text(span)]
        body_node = article.select_one(".field--name-body"); body = text(body_node) if body_node else ""
        detail = article.get_text("\n", strip=True)
        time_node = article.select_one(".lc-event-info-item--time") or article.select_one(".lc-event__date")
        time_text = text(time_node) if time_node else ""
        times = [f"{int(h)%12+(12 if ap.lower()=='pm' else 0):02d}:{m or '00'}" for h,m,ap in re.findall(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", time_text, re.I)]
        fields = {}
        for label in article.select("strong.lc-event__label"):
            fields[text(label).rstrip(":").lower()] = text(label.parent).replace(text(label), "", 1).strip()
        location = " · ".join(fields[k] for k in ("library branch", "room") if fields.get(k))
        status = "cancelled" if re.search(r"cancelled|canceled|postponed", title, re.I) else get_availability(detail)
        records.append({"libraryId": library["id"], "title": title, "date": date.isoformat(), "start": times[0] if len(times)>=2 else None, "end": times[1] if len(times)>=2 else None, "allDay": "all day" in time_text.lower(), "groups": sorted(set(groups)), "body": body, "location": location, "url": url, "availability": status, "candidate": candidate(title, groups, body), "offsite": "offsite event" in detail.lower(), "programType": fields.get("program type", ""), "details": detail})
    return records

def librarycalendar(library, origin):
    records = []; feeds = []; failures = []
    for offset in range((END - START).days + 1):
        date = START + dt.timedelta(days=offset)
        url = origin + "/events/feed/html?" + urllib.parse.urlencode({"_wrapper_format": "lc_calendar_feed", "current_date": date.isoformat(), "ongoing_events": "hide"})
        try:
            document = fetch(url)
            if "lc-event" not in document and "No events" not in document and text(BeautifulSoup(document, "html.parser")):
                raise ValueError("Unexpected library-calendar feed format")
            rows = parse_daily(document, origin, date, library)
        except Exception as error:
            failures.append({"url": url, "error": str(error)}); continue
        for row in rows: row["feed"] = url
        records.extend(rows); feeds.append({"url": url, "date": date.isoformat(), "events": len(rows)})
        time.sleep(0.6)
    return records, {"platform": "librarycalendar-daily", "origin": origin, "feeds": feeds, "failures": failures, "completeDates": [START.isoformat(), END.isoformat()] if not failures else None}

def assabet(library, origin):
    records = []; feeds = []
    months = []
    day = START.replace(day=1)
    while day <= END:
        months.append(day.strftime("%Y-%B").lower())
        day = (day.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    for month in months:
        url = origin + "/calendar/" + month + "/"
        document = fetch(url); soup = BeautifulSoup(document, "html.parser"); count = 0
        for tag in soup.select('script[type="application/ld+json"]'):
            try: entry = json.loads(tag.string or tag.get_text(), strict=False)
            except (ValueError, TypeError): continue
            entries = entry if isinstance(entry, list) else [entry]
            for event in entries:
                if event.get("@type") != "Event": continue
                date = dt.date.fromisoformat(event["startDate"][:10])
                if not START <= date <= END: continue
                count += 1; title = html.unescape(event.get("name", "")); body = html.unescape(html.unescape(event.get("description", "")))
                door = event.get("doorTime"); duration = event.get("duration", "")
                parts = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
                start = door[:5] if door else None; end = None
                if start and parts:
                    delta = dt.timedelta(hours=int(parts[1] or 0), minutes=int(parts[2] or 0), seconds=int(parts[3] or 0))
                    end = (dt.datetime.combine(date, dt.time.fromisoformat(start)) + delta).strftime("%H:%M")
                locations = event.get("location", []); locations = locations if isinstance(locations, list) else [locations]
                location = " · ".join(html.unescape(str(x.get("name", ""))) for x in locations)
                address = next((html.unescape(str(x.get("address", ""))) for x in locations if x.get("address")), "")
                status = "cancelled" if "Cancel" in event.get("eventStatus", "") or re.search(r"cancelled|canceled", title, re.I) else "unknown"
                records.append({"libraryId": library["id"], "title": title, "date": date.isoformat(), "start": start, "end": end, "allDay": not start, "groups": [], "body": body, "location": location, "eventAddress": address, "url": event["url"], "feed": url, "availability": status, "candidate": candidate(title, [], body), "virtual": "OnlineEventAttendanceMode" in event.get("eventAttendanceMode", "")})
        feeds.append({"url": url, "eventsInRange": count})
    return records, {"platform": "assabet-jsonld", "origin": origin, "feeds": feeds, "completeDates": [START.isoformat(), END.isoformat()]}

def collect(library):
    output = D / (library["id"] + "_calendar.json")
    if output.exists():
        cached = json.loads(output.read_text())
        if cached.get("status") == "ok": return cached
    result = {"library": library, "status": "limited", "records": []}
    urls = library["calendarURLs"]
    try:
        icals = [u for u in urls if ".libcal.com" in urllib.parse.urlparse(u).netloc and "api.libcal.com" not in u]
        lc = [u for u in urls if ".librarycalendar.com" in urllib.parse.urlparse(u).netloc]
        ai = [u for u in urls if ".assabetinteractive.com" in urllib.parse.urlparse(u).netloc]
        # Jericho uses the Library Calendar application on its own domain.
        if library["id"] == "jericho-public-library": lc = ["https://www.jericholibrary.org/events/month"]
        if icals: records, scope = libcal(library, icals)
        elif lc:
            parsed = urllib.parse.urlparse(lc[0]); records, scope = librarycalendar(library, f"https://{parsed.netloc}")
        elif ai:
            parsed = urllib.parse.urlparse(ai[0]); records, scope = assabet(library, f"https://{parsed.netloc}")
        else: raise ValueError("Calendar needs separate platform adapter or additional discovery")
        result.update({"status": "partial" if scope.get("failures") else "ok", "records": records, "scope": scope})
    except Exception as error: result["error"] = str(error)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(collect, libraries))
all_records = []
for result in results:
    all_records.extend(result["records"])
    print(json.dumps({"library": result["library"]["name"], "status": result["status"], "records": len(result["records"]), "childCandidates": sum(r["candidate"] for r in result["records"]), "platform": result.get("scope", {}).get("platform"), "error": result.get("error")}), flush=True)
summary = {"range": {"start": START.isoformat(), "end": END.isoformat()}, "directoryEntries": discovery["directoryEntries"], "memberLibraries": len(libraries), "completedLibraries": sum(r["status"] == "ok" for r in results), "libraries": [{"id": r["library"]["id"], "name": r["library"]["name"], "status": r["status"], "scope": r.get("scope"), "error": r.get("error")} for r in results], "records": all_records}
(D / "library_collection.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps({"memberLibraries": len(libraries), "completedLibraries": summary["completedLibraries"], "totalRecords": len(all_records), "candidates": sum(r["candidate"] for r in all_records)}))

"""Download Natural Earth outlines and regenerate the local travel SVG maps."""

import json
import math
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "travel" / "maps"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE_DIR = Path(tempfile.gettempdir()) / "travel-map-sources"
SOURCE_DIR.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "map-units.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_0_map_units.geojson",
    "admin1.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_1_states_provinces.geojson",
    "iso-country-list.json": "https://raw.githubusercontent.com/umpirsky/country-list/bd490a163ae4709bbe4b54c4f638f24e032828d2/data/en/country.json",
    "countries.json": "https://raw.githubusercontent.com/mledoze/countries/fa4f62182d19ff4f8b325cde6387c9cd9d80955a/countries.json",
}
for filename, url in SOURCES.items():
    target = SOURCE_DIR / filename
    if not target.exists():
        urllib.request.urlretrieve(url, target)
(OUT / "country-markers.json").unlink(missing_ok=True)

COUNTRIES = json.load(open(SOURCE_DIR / "map-units.geojson", encoding="utf8"))["features"]
ADMIN1 = json.load(open(SOURCE_DIR / "admin1.geojson", encoding="utf8"))["features"]
ISO_NAMES = json.load(open(SOURCE_DIR / "iso-country-list.json", encoding="utf8"))
FULL_COUNTRIES = {item.get("cca2"): item for item in json.load(open(SOURCE_DIR / "countries.json", encoding="utf8")) if item.get("cca2")}
NAME_TO_CODE = {name: code for code, name in ISO_NAMES.items()}
NAME_TO_CODE.update({
    "Antigua and Barbuda": "AG",
    "Bosnia and Herzegovina": "BA",
    "Republic of Serbia": "RS",
})


def ring_path(ring, project, tolerance):
    points = []
    previous_lon = None
    for point in ring:
        lon, lat = point[:2]
        if previous_lon is not None:
            while lon - previous_lon > 180:
                lon -= 360
            while lon - previous_lon < -180:
                lon += 360
        points.append(project(lon, lat))
        previous_lon = lon
    if len(points) > 2:
        points = simplify(points, tolerance)
    if len(points) < 3:
        return ""
    return "M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in points) + "Z"


def simplify(points, tolerance):
    """Douglas-Peucker simplification in projected SVG coordinates."""
    if len(points) < 3:
        return points
    first, last = points[0], points[-1]
    dx, dy = last[0] - first[0], last[1] - first[1]
    denom = dx * dx + dy * dy
    best, farthest = tolerance, None
    for i, point in enumerate(points[1:-1], 1):
        if denom == 0:
            distance = math.hypot(point[0] - first[0], point[1] - first[1])
        else:
            cross = abs(dy * point[0] - dx * point[1] + last[0] * first[1] - last[1] * first[0])
            distance = cross / math.sqrt(denom)
        if distance > best:
            best, farthest = distance, i
    if farthest is None:
        return [first, last]
    return simplify(points[:farthest + 1], tolerance)[:-1] + simplify(points[farthest:], tolerance)


def rings(geometry):
    if not geometry:
        return
    kind, coordinates = geometry["type"], geometry["coordinates"]
    polygons = [coordinates] if kind == "Polygon" else coordinates if kind == "MultiPolygon" else []
    for polygon in polygons:
        for ring in polygon:
            yield ring


def feature_d(feature, project, tolerance):
    return "".join(ring_path(ring, project, tolerance) for ring in rings(feature.get("geometry")))


def bounds(features, include):
    xs, ys = [], []
    def walk(value):
        if isinstance(value, (int, float)):
            return
        if value and isinstance(value[0], (int, float)):
            include(value[0], value[1], xs, ys)
        else:
            for child in value:
                walk(child)
    for feature in features:
        walk(feature["geometry"]["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


def render(name, viewbox, items):
    paths = {}
    for code, d, label in items:
        if d:
            paths.setdefault(code, []).append(d)
    markup = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" fill="#e7e2d8" stroke="#4d4942" stroke-width="0.45" stroke-linejoin="round">', '<title>Travel map shapes</title>', '<g id="map-base">']
    markup.extend(f'<path id="{code}" d="{"".join(ds)}"/>' for code, ds in paths.items())
    markup.append('</g>')
    markup.append('</svg>')
    (OUT / f"{name}.svg").write_text("\n".join(markup) + "\n", encoding="utf8")
    return set(paths)


# Equirectangular world panel. All country shapes are separate and code-addressable.
countries = []
country_extents = {}
country_representatives = {}
for feature in COUNTRIES:
    props = feature["properties"]
    code = props.get("ISO_A2")
    code = {
        "FR-971": "GP", "FR-972": "MQ", "FR-973": "GF", "FR-974": "RE", "FR-976": "YT",
        "CN-TW": "TW",
    }.get(code, code)
    if code == "-99" and (props.get("ADM0_A3") == "PSX" or props.get("ADMIN") == "Palestine"):
        code = "PS"
    if code == "-99":
        code = NAME_TO_CODE.get(props.get("ADMIN"))
    if code and code != "-99":
        countries.append((code, feature_d(feature, lambda lon, lat: (lon + 180, 90 - lat), 0.10), props.get("ADMIN", "")))
        if props.get("LABEL_X") is not None and props.get("LABEL_Y") is not None:
            country_representatives.setdefault(code, [props["LABEL_X"], props["LABEL_Y"]])
        all_points = [point[:2] for ring in rings(feature.get("geometry")) for point in ring]
        if all_points:
            xs = [point[0] for point in all_points]
            ys = [point[1] for point in all_points]
            extent = country_extents.get(code, [float("inf"), float("inf"), float("-inf"), float("-inf")])
            country_extents[code] = [min(extent[0], min(xs)), min(extent[1], min(ys)), max(extent[2], max(xs)), max(extent[3], max(ys))]
country_paths = render("countries", "0 0 360 180", countries)

# Marker dots represent ISO-listed microstates/islands too small to draw at this
# map scale, plus ISO places whose source contains no standalone outline.
markers = {}
for code in ISO_NAMES:
    extent = country_extents.get(code)
    too_small = extent and max(extent[2] - extent[0], extent[3] - extent[1]) < 1.25
    if code not in country_paths or too_small:
        point = country_representatives.get(code)
        if not point:
            latlng = FULL_COUNTRIES.get(code, {}).get("latlng") or []
            if len(latlng) == 2:
                point = [latlng[1], latlng[0]]
        if point and -180 <= point[0] <= 180 and -90 <= point[1] <= 90:
            markers[code] = [round(point[0] + 180, 2), round(90 - point[1], 2)]
(ROOT / "lib" / "travel" / "country-markers.json").write_text(json.dumps(markers, separators=(",", ":")) + "\n", encoding="utf8")

# US mainland with Alaska and Hawaii insets; DC/territories are deliberately excluded.
def us_project(code, lon, lat):
    if code == "US-AK":
        if lon > 180:
            lon -= 360
        elif lon > 0:
            lon -= 360
        elif lon < -180:
            lon += 360
        return 38 + (lon + 180) * 3.0, 518 + (72 - lat) * 4.4
    if code == "US-HI":
        return 240 + (lon + 161) * 12.5, 628 + (23 - lat) * 12.5
    return 240 + (lon + 125) * 10.7, 28 + (50 - lat) * 15.5

us_items = []
for feature in ADMIN1:
    props = feature["properties"]
    code = props.get("iso_3166_2")
    if props.get("adm0_a3") != "USA" or not code or code == "US-DC":
        continue
    us_items.append((code, feature_d(feature, lambda lon, lat: us_project(code, lon, lat), 1.0), props.get("name_en") or props.get("name", "")))
render("us-states", "0 0 1000 720", us_items)

# Japanese prefectures use Natural Earth's detailed admin-1 boundaries. Okinawa is
# moved into a conventional locator inset so it is not lost at Japan-wide scale.
def jp_project(code, lon, lat):
    if code == "JP-47":
        return 26 + (lon - 122.7) * 16.2, 566 + (32.0 - lat) * 16.2
    return 94 + (lon - 129) * 36.5, 30 + (46 - lat) * 36.5

jp_items = []
for feature in ADMIN1:
    props = feature["properties"]
    code = props.get("iso_3166_2")
    if props.get("adm0_a3") != "JPN" or not code:
        continue
    jp_items.append((code, feature_d(feature, lambda lon, lat: jp_project(code, lon, lat), 0.10), props.get("name_en") or props.get("name", "")))
render("japan-prefectures", "0 0 900 680", jp_items)

print(f"Generated {len(country_paths)} country outlines plus {len(markers)} country markers, {len(us_items)} state and {len(jp_items)} prefecture outlines")

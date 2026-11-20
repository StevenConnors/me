"""Read a Photos.app folder with osxphotos and export its photos as capped JPEGs.

Called by scripts/apple-photos-sync.mjs. Prints one JSON document on stdout.

  python3 export_folder.py list --folder Website [--all]
  python3 export_folder.py export --folder Website --out DIR --uuid UUID [--uuid UUID ...] [--max-edge 4096]
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from osxphotos import ExportOptions, PhotoExporter, PhotosDB

COVER_KEYWORD = "cover"
CAPTION_LIMIT = 2000


def find_folder(db, title):
    matches = [folder for folder in db.folder_info if folder.title == title]
    if not matches:
        raise SystemExit(f'No top-level Photos.app folder named "{title}"')
    if len(matches) > 1:
        raise SystemExit(f'More than one top-level Photos.app folder is named "{title}"')
    return matches[0]


def albums_in(folder):
    """Albums in Photos.app sidebar order, including albums in subfolders."""
    # library_list_order is missing before osxphotos 0.76; the stable sort then keeps albums before subfolders.
    children = sorted(
        [*folder.album_info, *folder.subfolders],
        key=lambda child: getattr(child, "library_list_order", (0,)),
    )
    for child in children:
        if hasattr(child, "subfolders"):
            yield from albums_in(child)
        else:
            yield child


def source_version(photo):
    """Changes when the photo is edited, not when it is favorited or tagged."""
    if not photo.hasadjustments:
        return "original"
    adjustments = photo.adjustments
    stamp = adjustments.timestamp if adjustments and adjustments.timestamp else photo.date_modified
    return f"edited-{stamp.isoformat()}" if stamp else "edited"


def wanted(photo, include_all):
    return photo.isphoto and not photo.intrash and (include_all or photo.favorite)


def list_folder(db, title, include_all):
    albums = []
    for album in albums_in(find_folder(db, title)):
        photos = []
        for photo in album.photos:
            if not wanted(photo, include_all):
                continue
            caption = (photo.description or "").strip()[:CAPTION_LIMIT]
            photos.append({
                "sourcePhotoId": photo.uuid,
                "sourceVersion": source_version(photo),
                "cover": COVER_KEYWORD in [keyword.lower() for keyword in photo.keywords],
                **({"caption": caption} if caption else {}),
            })
        if photos:
            albums.append({"sourceAlbumId": album.uuid, "title": album.title, "photos": photos})
    return {"albums": albums}


def pixel_size(path):
    output = subprocess.run(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    values = dict(line.strip().split(": ", 1) for line in output.splitlines() if ": " in line)
    return int(values["pixelWidth"]), int(values["pixelHeight"])


def to_capped_jpeg(source, target, max_edge):
    """Re-encode as JPEG and shrink (never enlarge) so the long edge is at most max_edge."""
    command = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85"]
    if max(pixel_size(source)) > max_edge:
        command += ["-Z", str(max_edge)]
    subprocess.run([*command, str(source), "--out", str(target)], check=True, capture_output=True)


def export_photos(db, uuids, out_dir, max_edge):
    out_dir.mkdir(parents=True, exist_ok=True)
    files, errors = [], []
    for photo in db.photos(uuid=uuids):
        try:
            missing = photo.ismissing
            options = ExportOptions(
                convert_to_jpeg=True,
                jpeg_quality=0.9,
                edited=photo.hasadjustments,
                download_missing=missing,
                use_photos_export=missing,
                overwrite=True,
            )
            staging = out_dir / "staging" / photo.uuid
            staging.mkdir(parents=True, exist_ok=True)
            exported = PhotoExporter(photo).export(str(staging), options=options).exported
            if not exported:
                raise RuntimeError("Photos did not export a file; open Photos and let it download the original")
            target = out_dir / f"{photo.uuid}.jpg"
            to_capped_jpeg(Path(exported[0]), target, max_edge)
            files.append({"sourcePhotoId": photo.uuid, "path": str(target)})
        except Exception as error:  # report every failed photo, keep exporting the rest
            errors.append({"sourcePhotoId": photo.uuid, "message": str(error)})
    found = {photo["sourcePhotoId"] for photo in files + errors}
    errors += [{"sourcePhotoId": uuid, "message": "Not found in the Photos library"} for uuid in uuids if uuid not in found]
    return {"files": files, "errors": errors}


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    list_command = commands.add_parser("list")
    list_command.add_argument("--folder", required=True)
    list_command.add_argument("--all", action="store_true", help="include photos that are not favorites")
    export_command = commands.add_parser("export")
    export_command.add_argument("--uuid", action="append", default=[])
    export_command.add_argument("--out", required=True, type=Path)
    export_command.add_argument("--max-edge", type=int, default=4096)
    args = parser.parse_args()

    db = PhotosDB()
    if args.command == "list":
        result = list_folder(db, args.folder, args.all)
    else:
        result = export_photos(db, args.uuid, args.out, args.max_edge)
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()

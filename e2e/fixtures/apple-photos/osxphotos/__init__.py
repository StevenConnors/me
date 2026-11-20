"""Stand-in for osxphotos so the Mac sync script runs in Linux E2E tests.

Reads a fake library from the JSON file named by FAKE_PHOTOS_LIBRARY.
"""

import dataclasses
import datetime
import json
import os
import shutil
from pathlib import Path
from types import SimpleNamespace


def _library():
    return json.loads(Path(os.environ["FAKE_PHOTOS_LIBRARY"]).read_text())


class _Photo:
    def __init__(self, uuid, data):
        self.uuid = uuid
        self._data = data
        self.isphoto = data.get("isphoto", True)
        self.intrash = False
        self.favorite = data.get("favorite", True)
        self.hasadjustments = bool(data.get("editedAt"))
        self.ismissing = False
        self.description = data.get("description")
        self.keywords = data.get("keywords", [])
        stamp = datetime.datetime.fromisoformat(data["editedAt"]) if self.hasadjustments else None
        self.adjustments = SimpleNamespace(timestamp=stamp) if stamp else None
        self.date_modified = stamp


class _Album:
    def __init__(self, data, photos):
        self.uuid = data["uuid"]
        self.title = data["title"]
        self.photos = [photos[uuid] for uuid in data["photos"]]
        self.library_list_order = (data.get("order", 0),)


class _Folder:
    def __init__(self, data, photos):
        self.title = data["title"]
        self.album_info = [_Album(album, photos) for album in data.get("albums", [])]
        self.subfolders = [_Folder(folder, photos) for folder in data.get("subfolders", [])]
        self.library_list_order = (data.get("order", 0),)


class PhotosDB:
    def __init__(self):
        library = _library()
        self._photos = {uuid: _Photo(uuid, data) for uuid, data in library["photos"].items()}
        self.folder_info = [_Folder(folder, self._photos) for folder in library["folders"]]

    def photos(self, uuid=None):
        return [self._photos[value] for value in uuid or [] if value in self._photos]


@dataclasses.dataclass
class ExportOptions:
    convert_to_jpeg: bool = False
    jpeg_quality: float = 1.0
    edited: bool = False
    download_missing: bool = False
    use_photos_export: bool = False
    overwrite: bool = False


class PhotoExporter:
    def __init__(self, photo):
        self.photo = photo

    def export(self, dest, filename=None, options=None):
        if self.photo._data.get("exportFails"):
            return SimpleNamespace(exported=[])
        target = Path(dest) / f"{self.photo.uuid}.jpeg"
        shutil.copyfile(Path(__file__).parent.parent / "photo.jpg", target)
        Path(f"{target}.size").write_text(json.dumps(self.photo._data.get("size", [1200, 800])))
        return SimpleNamespace(exported=[str(target)])

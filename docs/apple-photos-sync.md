# Sync a Photos.app folder to the Photos page

`npm run photos:apple-sync` runs on a Mac with iCloud Photos turned on. It reads the local Photos library, so it works the same with or without Advanced Data Protection and never signs in to iCloud.

## Curate in Photos
- Make a top-level folder named `Website` in the Photos sidebar. Each album in it, including albums in subfolders, becomes one section on the Photos page.
- Favorite the photos you want on the site, from the iPhone or the Mac. Only favorites are synced unless you pass `--all`.
- Add the keyword `cover` to a photo to make it its album's cover. An album keeps a cover you already chose in the editor.
- Album order follows the Photos sidebar; photo order follows the album's sort order.

## One-time setup
1. Generate a token: `openssl rand -hex 32`.
2. Set `PHOTOS_IMPORT_TOKEN` to that value in the Vercel project and redeploy. Leaving it unset turns the import endpoints off.
3. Install osxphotos in its own Python: `python3 -m venv ~/.venvs/osxphotos && ~/.venvs/osxphotos/bin/pip install osxphotos`.
4. In `.env.local` on the Mac:
   ```
   PHOTOS_IMPORT_SITE_URL=https://<your site>
   PHOTOS_IMPORT_TOKEN=<the same token>
   APPLE_PHOTOS_PYTHON=/Users/<you>/.venvs/osxphotos/bin/python
   ```
5. The first run asks for access to Photos. Grant it to the terminal app you run it from (System Settings, Privacy & Security, Photos, or Full Disk Access).

## Run it
```bash
npm run photos:apple-sync                      # report what would be uploaded
npm run photos:apple-sync -- --apply           # upload and update the Photos draft
npm run photos:apple-sync -- --folder Trips    # use another top-level folder
```
`--apply` exports new and edited photos as JPEGs no longer than 4096px on the long edge, uploads them to the media library and updates the Photos page draft. It never publishes. Review the draft in `/admin/photos` and publish there.

## What a sync changes
- New favorites are added to the end of their album's section.
- An edited photo is uploaded again and replaces the old one in place. Captions, alt text, album roles and moves you made in the editor are kept.
- A photo you unfavorite or remove from the folder leaves the draft. Its media stays in the library.
- An album removed from the folder loses its photos, and its section goes once it is empty.
- A photo in several albums is placed once, in the first album.
- Deleting an imported photo in the editor does not stick: the next sync adds it back. Unfavorite it in Photos instead.

Uploads are recorded in `~/.cache/apple-photos-sync/uploads.json`, so a run that fails after uploading does not upload the same photos again.

## Troubleshooting
- `Not found in the Photos library` or `Photos did not export a file`: the original is only in iCloud. Open the photo in Photos to download it, or turn on "Download Originals to this Mac", then run the sync again.
- `401`: the token in `.env.local` does not match the deployment, or the deployment has no `PHOTOS_IMPORT_TOKEN`.
- `PHOTOS_DRAFT_CONFLICT`: the draft kept changing while the sync ran. Run it again.

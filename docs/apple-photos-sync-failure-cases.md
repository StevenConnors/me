# Apple Photos sync script failure cases

Before running `npm run photos:apple-sync` on the author's Mac:

- A run without `--apply` uploads files or changes the Photos draft.
- Photos that are not favorites, or albums outside the chosen folder, reach the site. Albums in subfolders of the chosen folder are skipped.
- A photo longer than 4096px on its long edge is uploaded at full size, or a smaller photo is enlarged.
- A HEIC or PNG original is uploaded as something other than a JPEG.
- A second run with no changes in Photos.app uploads any photo again or changes the draft.
- Favoriting or tagging a photo in Photos.app counts as an edit and uploads it again.
- An edited photo is not uploaded again, or its old version stays in the draft.
- A photo removed from the folder stays in the draft.
- A photo with the `cover` keyword does not become its album's cover.
- One photo that fails to export or upload stops the rest of the sync, or the run exits 0 and hides the failure.
- A run that uploads photos but fails before the sync request re-uploads the same photos on the next run.
- The import token is printed in the output.

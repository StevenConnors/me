# Photos album roles failure cases

Before letting the author mark album covers and featured photos in the Photos editor:

- The photo inspector has no way to mark a photo as its album's cover or as a featured photo, so the public page cannot tell the author's best frames from the rest.
- Saving a draft with an album role is rejected because the stored document schema does not allow the field.
- Marking a second cover in the same album leaves two covers instead of moving the cover to the new photo.
- Marking a cover in one album clears the cover of a different album.
- Changing a featured photo back to "Regular photo" leaves the role in the stored draft.
- A document with two covers in one album (for example, written by an older editor) publishes without an issue the author can click to fix.
- The editor canvas gives no sign of which photos are covers or featured, so the author has to open each one to check.
- The published `/api/photos` payload omits the role, so the public page cannot use it.
- Performance: the role adds requests to `/photos` or a client dependency.

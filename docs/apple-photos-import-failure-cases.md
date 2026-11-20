# Apple Photos import failure cases

Before letting a script on the author's Mac sync a Photos.app folder into the Photos page draft:

- A request without the import token, with a wrong token, or to a deployment where `PHOTOS_IMPORT_TOKEN` is unset or shorter than 32 characters reads the import manifest or changes the draft.
- The import token authorizes anything other than the import endpoints and the media upload and finalize steps it needs.
- The manifest does not list photos imported by an earlier sync, so the Mac script uploads the same photo again on every run.
- A first sync does not create one section per album with the album's photos in Photos.app order below it.
- A second sync with the same albums changes the draft (adds duplicate sections or photo blocks, or bumps the draft version for no change).
- A new photo in an existing album is appended to the end of the page instead of the end of that album's section.
- An edited photo (new source version) adds a second block instead of swapping the media in the existing block, or drops the caption, alt text or album role the author set.
- A photo the author moved into another section or retitled section is moved back or retitled by the next sync.
- A photo that is no longer in the synced folder stays in the draft, or its media asset is deleted from the library.
- An album removed from the synced folder leaves an empty section that blocks publishing.
- An album with a photo marked as cover does not get that photo as its cover, or overrides a cover the author already chose. A cover that leaves the album blocks the new cover photo.
- A block the author placed with an imported upload is taken over by the sync, then swapped or removed when the photo changes in Photos.app.
- The same photo in two synced albums makes the draft invalid (a media asset may appear only once).
- A sync naming a media asset that does not exist, is a video, or is not ready is written to the draft.
- A sync that would exceed 500 photos or 100 sections returns a 500 or partly writes the draft instead of a 400 with a message.
- The sync publishes the page or changes the published document.
- A sync running while the author saves in the editor overwrites the author's change instead of retrying on top of it, or loses the photos and sections it was removing.
- The manifest still lists an upload deleted from the media library, so the script never uploads it again and every sync fails.
- Performance: the import adds requests or JavaScript to public pages.

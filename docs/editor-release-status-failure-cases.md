# Editor save and release status

- Opening a saved draft claims it is saving, published, or locally changed.
- Typing before autosave, or during an in-flight save, claims the latest draft is saved.
- A saved draft is mistaken for a public release. Never-published and live drafts look identical.
- Reloading a live journal with draft-only metadata or body edits hides unpublished changes.
- Reverting a local edit still claims the draft differs from the live snapshot.
- The public link follows a draft-only slug instead of the live release.
- Photos offers restore before a first publication, or the discard API reports that missing snapshot as a conflict.
- Restoring a published Photos layout fails to clear unpublished state or persists the wrong layout.
- Save, conflict, or publishing messages hide the separate live state.
- Status text or actions overflow the editor toolbar at 390px, or emit runtime errors.
- Admin-only status work adds queries or JavaScript to public routes.

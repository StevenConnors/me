# Photos asset deletion failure cases

- An asset placed only in the Photos draft can be deleted, leaving the next publish invalid.
- Published-only Photos placements must remain protected even after removal from the draft.
- Rejected deletion must return the existing 409 MEDIA_IN_USE conflict and preserve the asset so publishing still succeeds.
- Assets absent from both documents (including an empty or missing Photos page) must remain deletable.
- Both single and bulk deletion use the Photos reference guard; neither may bypass draft protection.

This changes server-side deletion only; no public UI, layout, keyboard, or download-performance behavior changes.

# Photos asset deletion failure cases

- An asset placed only in the Photos draft can be deleted, leaving the next publish invalid.
- Published-only Photos placements must remain protected even after removal from the draft.
- Rejected deletion must return the existing 409 MEDIA_IN_USE conflict and preserve the asset so publishing still succeeds.
- Assets absent from both documents (including an empty or missing Photos page) must remain deletable.
- Both single and bulk deletion use the Photos reference guard; neither may bypass draft protection.
- Planning conflates draft-only and published Photos placements, disabling the Photos editor's permanent-delete confirmation.
- The Photos editor must remove eligible draft-only placements and successfully save the draft before requesting deletion; the resulting Photos page must still publish.
- The media library must not offer deletion of draft-only placements; direct bulk execution must keep protecting them.
- Published placements, journey references, and collection memberships remain protected even when an asset also appears in the Photos draft.
- A failed draft save must prevent the Photos editor from sending a destructive request.
- The Photos editor deletion flow must not produce browser runtime or console errors.

This changes administrative deletion only; no public UI, layout, keyboard, or download-performance behavior changes.

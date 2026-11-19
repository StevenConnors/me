# Journey public URL failure cases

A published journey's public URL belongs to its published revision, not to the editable draft. The draft slug is only a proposal until the author publishes it.

| # | Failure case | Expected behavior |
| --- | --- | --- |
| 1 | The author autosaves a new slug on a published journey. | The live URL keeps serving the published story. |
| 2 | A visitor opens the unpublished draft slug. | `404`; the draft slug is not public until Publish. |
| 3 | The admin "View public journey" link after a draft-only slug edit. | Still points at the live URL. |
| 4 | The author publishes the renamed slug. | The new URL serves the new revision. |
| 5 | A visitor opens the old URL after a published rename. | Redirects to the new URL. |
| 6 | A journey published before the live slug was stored on the journey. | Still resolves through its published revision's slug. |
| 7 | Another journey tries to publish a slug that is live elsewhere. | Publication is rejected with `slug_unavailable`. |
| 8 | A journey is unpublished or archived. | Neither its live slug nor its old slugs resolve. |
| 9 | A legacy MDX slug with no published journey. | The bundled MDX story still renders. |
| 10 | The rename flow throws page errors or console errors. | None, apart from the deliberate draft-slug 404. |
| 11 | The redirected story overflows a 390 px viewport. | No horizontal overflow at 390 px. |

`e2e/journey-public-url.spec.ts` covers cases 1–5, 10 and 11 through the editor; `tests/journeys/repository.test.ts` and `tests/journeys/publishing.test.ts` cover 6–8, and `e2e/legacy-story.spec.ts` covers 9.

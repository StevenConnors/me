# Media audit failure modes

Before implementing `media:audit`, the report must account for these ways it could produce unsafe or misleading results:

- Missing or malformed Cloudinary/Mongo credentials could expose secret values if raw configuration or request errors are printed. Errors must name only the missing setting or generic HTTP status; never print environment values, connection strings, response bodies, or auth headers.
- Incomplete Cloudinary pagination could make provider-only counts and duplicate groups look smaller than reality. Follow every cursor and fail on repeated cursors or non-success responses.
- Comparing only images would misstate the library inventory. Query both image and video uploads and normalize their provider asset ID, public ID, checksum, created date, and resource type.
- Matching by public ID is vulnerable to renames/collisions; compare provider asset IDs, with public ID only as a readable fallback where the database record lacks an ID.
- A missing/invalid checksum should not be treated as an exact duplicate. Exclude absent checksums from duplicate grouping.
- Photos and journey pages may reference absent database records. Walk published page blocks and published journey revisions, and report unresolved media IDs rather than silently dropping them.
- The `showInPhotos` flag may describe old gallery membership; compare it to the published Photos document where available and state which source was used.
- Cloudinary's upload timestamp is not EXIF capture time. Report only date equality between stored `captureDate` and provider `created_at`, and label the condition as a likely upload-time placeholder rather than claiming the date is wrong.
- Network/API/Mongo failures or malformed documents must stop the report rather than emit partial counts as complete.
- JSON artifact paths could overwrite an existing file. Require explicit `--json <path>` and document that it overwrites that chosen report path; the script must never write to Mongo or Cloudinary.

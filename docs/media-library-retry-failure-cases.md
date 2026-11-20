# Media library retry failure cases

The admin Media page loads media and collections with separate requests. Retry must recover from either failing:

- The collections request fails on load; Retry hides the alert but reloads media only, so the collection filter, the "Add selected to collection" picker and each asset's collection chips stay empty until a full page reload.
- Retry after a collections failure shows the alert again if the collections request fails again, instead of hiding the failure.
- Retry after a media failure still reloads media.
- The failed request logs no runtime errors beyond the failed resource itself.

# Photos themes failure cases

Before adding a "browse by theme" view of the Photos page:

- The only way to find photos of a subject (cats, sunsets, trains) is to scroll every album.
- A theme filter lists bookkeeping tags (`upload-session-*`, `legacy-story`), or tags on only one or two photos, so the filter row is longer than the wall.
- A theme counts photos that are not published, or that are unavailable.
- Choosing a theme is not in the URL, so it cannot be shared or restored with Back.
- A tile on the theme wall opens a different photo from the one shown, or loses the viewer's previous and next navigation.
- An unknown theme in the URL shows an empty page with no way back.
- The Photos page gives no route to the theme view.
- At 390 px the filter row or the wall causes horizontal scrolling.
- Performance: the wall downloads every photo at full size or loads them all up front.

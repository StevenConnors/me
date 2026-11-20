# Photo viewer keyboard failure cases

- At 390 px, Tab from Close moves focus out of the photo dialog instead of staying on Close, the only visible control.
- At the same width, Shift+Tab tries to focus a hidden arrow instead of wrapping to Close.
- At desktop width, Tab and Shift+Tab fail to wrap between Close and the last visible arrow.
- Escape closes the dialog without returning focus to the photo that opened it.

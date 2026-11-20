# Glass viewer keyboard failure cases

- At desktop width, Tab from Next (the last control) moves focus out of the open Glass viewer to the page behind it instead of wrapping to Close.
- At desktop width, Shift+Tab from Close leaves the viewer instead of wrapping to Next.
- At 390 px, Tab or Shift+Tab from Close leaves the viewer or lands on a hidden arrow instead of staying on Close, the only visible control.
- Escape, the Close button or a backdrop click closes the viewer but leaves focus on the page body instead of the photo that opened it.
- After clicking a non-interactive part of the open viewer (the `2 / 3` counter), Tab moves focus to the page footer behind it.

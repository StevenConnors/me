const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), video[controls]';

/** Wraps Tab and Shift+Tab between the first and last visible controls inside `container`, pulling focus back in when it has left. */
export function keepTabFocusWithin(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const focusIsOutside = !container.contains(document.activeElement);
  if (event.shiftKey && (focusIsOutside || document.activeElement === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (focusIsOutside || document.activeElement === last)) {
    event.preventDefault();
    first.focus();
  }
}

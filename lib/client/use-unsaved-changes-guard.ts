'use client';

import { useEffect } from 'react';

export function useUnsavedChangesGuard(isDirty: () => boolean, message: string) {
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function beforeNavigate(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !isDirty()) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.download || (link.target && link.target !== '_self')) return;
      const destination = new URL(link.href);
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (window.confirm(message)) return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeNavigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeNavigate, true);
    };
  }, [isDirty, message]);
}

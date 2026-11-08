import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAppSelector } from '../../app/hooks';

export function RouteFocus() {
  const location = useLocation();
  const status = useAppSelector((state) => state.auth.status);
  useEffect(() => {
    let observer: MutationObserver | undefined;
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (!heading) return false;
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      observer?.disconnect();
      return true;
    };
    if (!focusHeading()) {
      observer = new MutationObserver(() => { focusHeading(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => observer?.disconnect();
  }, [location.key, status]);
  return null;
}

import { useEffect, useState } from 'react';
import { motionConfig } from '../lib/motion';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}
export const useMotion = () => motionConfig(usePrefersReducedMotion());

/** Short spring physics (150-250ms feel). When the user prefers reduced motion, non-essential motion is disabled. */
export function motionConfig(reduced: boolean) {
  if (reduced) return { enabled: false, duration: 0, spring: { duration: 0 } as { type?: 'spring'; duration?: number; stiffness?: number; damping?: number } };
  return { enabled: true, duration: 0.2, spring: { type: 'spring' as const, stiffness: 520, damping: 34 } };
}

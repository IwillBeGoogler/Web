import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Scroll-reveal wrapper (fade + rise once); motion turns it off for prefers-reduced-motion via MotionConfig. */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1], delay }}>
      {children}
    </motion.div>
  );
}

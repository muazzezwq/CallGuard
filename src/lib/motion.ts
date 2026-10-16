/* Motion tokens — one source of truth for every animated surface.
   Kept dependency-free (no framer-motion import) so both CSS and JS
   can share the same rhythm. */

export const DUR = {
  fast: 0.16,
  base: 0.24,
  slow: 0.4,
} as const;

export type Cubic = [number, number, number, number];

export const EASE = {
  out: [0.22, 1, 0.36, 1] as Cubic,
  inOut: [0.4, 0, 0.2, 1] as Cubic,
  spring: [0.34, 1.32, 0.64, 1] as Cubic,
} as const;

/* framer-motion variants */
export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
} as const;

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.base, ease: EASE.out } },
} as const;

export const pop = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: DUR.base, ease: EASE.out } },
} as const;

export const stagger = (staggerChildren = 0.06, delayChildren = 0) =>
  ({ hidden: {}, show: { transition: { staggerChildren, delayChildren } } }) as const;

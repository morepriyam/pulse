/** `v` clamped to `[lo, hi]`. */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

"use client";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return <MotionConfig reducedMotion="user"><motion.div initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .28, ease: [.22, 1, .36, 1] }}>{children}</motion.div></MotionConfig>;
}

"use client";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { ReactNode } from "react";

/** The control stays still; a fine pointer moves its contents at most 2px. */
export function InteractiveContent({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const reduced = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 380, damping: 30 });
  const y = useSpring(pointerY, { stiffness: 380, damping: 30 });
  return <motion.span className="button-content" style={{ x: reduced ? 0 : x, y: reduced ? 0 : y }}
    onPointerMove={event => {
      if (!enabled || reduced || event.pointerType !== "mouse" || !window.matchMedia("(pointer: fine)").matches) return;
      const rect = event.currentTarget.getBoundingClientRect();
      pointerX.set(Math.max(-2, Math.min(2, (event.clientX - rect.left - rect.width / 2) * .035)));
      pointerY.set(Math.max(-2, Math.min(2, (event.clientY - rect.top - rect.height / 2) * .035)));
    }}
    onPointerLeave={() => { pointerX.set(0); pointerY.set(0); }}
  >{children}</motion.span>;
}

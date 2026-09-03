import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import waves from "@/assets/waves-bottom.png";

// Ambient backdrop. Three quiet layers — a warm glow up top, a band of staff
// lines behind the content, and the brand's wave artwork along the bottom —
// so a page of dark cards has something to sit on.
//
// It is pinned to the viewport so it doesn't scroll away, but held to the same
// column the page content uses: on a wide screen the artwork belongs to the app,
// not to the empty desk either side of it. Callers whose content is wider than
// the phone column pass their own width.
//
// Everything here is decorative and inert: no pointer events, no layout, and
// it holds still for anyone who has asked for reduced motion.
export default function AppBackground({ intensity = 1, width = "max-w-md" }) {
  const still = useReducedMotion();

  const drift = still
    ? {}
    : {
        animate: { y: [0, -8, 0], opacity: [0.55, 0.72, 0.55] },
        transition: { duration: 18, repeat: Infinity, ease: "easeInOut" },
      };

  const breathe = still
    ? {}
    : {
        animate: { opacity: [0.55, 0.9, 0.55], scale: [1, 1.06, 1] },
        transition: { duration: 12, repeat: Infinity, ease: "easeInOut" },
      };

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-y-0 left-1/2 -translate-x-1/2 w-full ${width} z-0 overflow-hidden`}
    >
      {/* Warm glow behind the header */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%]"
        style={{
          top: "-22%",
          width: "150%",
          height: "52%",
          background: `radial-gradient(ellipse at center, rgba(255,169,60,${0.1 * intensity}) 0%, rgba(255,169,60,${0.035 * intensity}) 38%, transparent 70%)`,
        }}
        {...breathe}
      />

      {/* A hint of ruled staff paper through the middle of the page */}
      <div
        className="absolute inset-x-0"
        style={{
          top: "26%",
          height: 132,
          opacity: 0.05 * intensity,
          backgroundImage:
            "repeating-linear-gradient(to bottom, hsl(var(--foreground)) 0px, hsl(var(--foreground)) 1px, transparent 1px, transparent 22px)",
          maskImage: "linear-gradient(to right, transparent, black 18%, black 82%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 18%, black 82%, transparent)",
        }}
      />

      {/* The brand's wave artwork, anchored to the bottom edge */}
      <motion.img
        src={waves}
        alt=""
        draggable={false}
        className="absolute bottom-0 left-0 w-full object-cover"
        style={{
          height: "38%",
          opacity: 0.6 * intensity,
          maskImage: "linear-gradient(to top, black 55%, transparent)",
          WebkitMaskImage: "linear-gradient(to top, black 55%, transparent)",
        }}
        {...drift}
      />

      {/* Vignette, to keep the corners from feeling flat */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 45%, rgba(0,0,0,0.45) 100%)",
        }}
      />
    </div>
  );
}

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import drumImage from "@/assets/drum.png";

// Record pad — the drum artwork comes straight from the design PNG and the
// surrounding glow is drawn in CSS so it can swap colour per state:
//   idle → amber, armed and waiting for the first stroke → green, recording → red.
const GLOW = {
  idle: { core: "rgba(255,169,60,0.55)", mid: "rgba(245,150,40,0.34)", ring: "rgba(255,184,77,0.16)" },
  armed: { core: "rgba(150,235,90,0.60)", mid: "rgba(120,220,70,0.36)", ring: "rgba(160,240,110,0.18)" },
  rec: { core: "rgba(235,70,70,0.60)", mid: "rgba(220,50,50,0.36)", ring: "rgba(240,90,90,0.18)" },
};

const CAPTION = {
  idle: "tap to arm",
  armed: "tap to start",
  rec: "recording",
};

export default function RecordButton({ isRecording, isArmed, onCapture, pulseKey }) {
  const state = isArmed ? "armed" : isRecording ? "rec" : "idle";
  const glow = GLOW[state];
  const SIZE = 188;

  return (
    <motion.button
      onPointerDown={(e) => {
        e.preventDefault();
        onCapture?.(e);
      }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 600, damping: 20 }}
      className="relative flex items-center justify-center rounded-full outline-none select-none"
      style={{ width: SIZE, height: SIZE, touchAction: "manipulation" }}
      aria-label={
        isRecording
          ? "Tap to record a stroke"
          : isArmed
          ? "Armed — tap to start recording"
          : "Arm the pad"
      }
    >
      {/* Soft radial glow behind the drum. The gradient is a plain style so
          switching state recolours it instantly — Framer Motion cannot tween
          between two gradients. */}
      <motion.span
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{
          width: SIZE * 1.62,
          height: SIZE * 1.62,
          background: `radial-gradient(circle, ${glow.core} 0%, ${glow.mid} 34%, ${glow.ring} 50%, transparent 68%)`,
        }}
        animate={{
          opacity: state === "idle" ? [0.85, 1, 0.85] : [0.9, 1, 0.9],
          scale: state === "rec" ? [1, 1.05, 1] : [1, 1.03, 1],
        }}
        transition={{
          duration: state === "rec" ? 1.1 : 2.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Pulse rings on each tap while recording */}
      <AnimatePresence>
        {isRecording &&
          [0, 1].map((i) => (
            <motion.span
              key={`${pulseKey}-${i}`}
              aria-hidden
              className="absolute rounded-full border-2 pointer-events-none"
              style={{ borderColor: "rgba(240,90,90,0.55)" }}
              initial={{ width: SIZE * 0.86, height: SIZE * 0.86, opacity: 0.5 }}
              animate={{ width: SIZE * 1.3, height: SIZE * 1.3, opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: i * 0.08 }}
            />
          ))}
      </AnimatePresence>

      <motion.img
        src={drumImage}
        alt=""
        draggable={false}
        className="relative w-full h-full"
        animate={{ scale: isRecording ? [1, 1.02, 1] : 1 }}
        transition={{ duration: 0.28 }}
      />

      {/* State caption — sits in the gap below the pad so it never shifts the
          layout, and replaces the count-in as the cue for what happens next. */}
      <span
        className="absolute left-0 right-0 -bottom-[22px] text-center text-[11px] tracking-[0.14em] uppercase text-muted-foreground pointer-events-none select-none"
        aria-hidden
      >
        {CAPTION[state]}
      </span>
    </motion.button>
  );
}

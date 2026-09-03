import React from "react";
import { motion, AnimatePresence } from "framer-motion";

// Tenor pad — the four drums of a quad in carrier order, plus the two spocks
// tucked in front. Tapping a drum records which one it was, so a tenor take
// arrives in the editor already spread across the staff instead of flattened
// onto one line.
//
// The set is drawn at full quad size rather than shrunk to the snare's
// footprint: the drums are the targets you have to hit accurately mid-take, so
// they get the room. Everything lives in a 300×184 viewBox and the SVG scales
// to its container, which keeps the whole set on screen on a narrow phone
// without any of the drums having to move.
//
// The geometry is a real carrier, seen from where the player stands: the four
// main drums arc away from you, biggest on the left and coming toward you,
// rising over the middle, then back down to the right — and the two spocks
// nest into the hollow the arc leaves in front. They sit close enough to touch,
// the way they do on a stand.
//
// Left to right the drums read 4·2·1·3, which is how a quad is actually laid
// out: the big drum 4 on the left, then across the top to the two small ones,
// and drum 3 — second largest — back on the right. So the numbers do not run in
// order across the set and the sizes do not either; both follow the carrier.
//
// The `drum` index, though, stays ordered by size, because everything
// downstream — the pitch each drum sounds, where it sits on the staff, which
// tom it exports as — is keyed to it low-to-high, and takes already in the
// library are stored against it. So this list is ordered by index, and it is
// the coordinates that place each drum where it belongs on the set.
const VIEW_W = 300;
const VIEW_H = 184;

const DRUMS = [
  { drum: 0, label: "4", cx: 50, cy: 110, r: 46 },
  { drum: 1, label: "3", cx: 258, cy: 98, r: 40 },
  { drum: 2, label: "2", cx: 124, cy: 64, r: 35 },
  { drum: 3, label: "1", cx: 194, cy: 60, r: 30 },
  { drum: 4, label: "5", cx: 145, cy: 138, r: 22, spock: true },
  { drum: 5, label: "6", cx: 192, cy: 140, r: 22, spock: true },
];

const GLOW = {
  idle: "rgba(255,169,60,0.42)",
  armed: "rgba(150,235,90,0.48)",
  rec: "rgba(235,70,70,0.48)",
};

const CAPTION = {
  idle: "tap to arm",
  armed: "tap to start",
  rec: "recording",
};

export default function TenorPad({ isRecording, isArmed, onCapture, lastHit }) {
  const state = isArmed ? "armed" : isRecording ? "rec" : "idle";
  const glow = GLOW[state];
  const hit = lastHit ? DRUMS[lastHit.drum] : null;

  return (
    <div
      className="relative select-none w-full"
      style={{ maxWidth: VIEW_W, aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
    >
      {/* One soft wash behind the whole set, coloured by state like the snare pad */}
      <motion.span
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{
          left: "-10%",
          top: "-12%",
          width: "120%",
          height: "124%",
          background: `radial-gradient(ellipse at 45% 45%, ${glow} 0%, transparent 62%)`,
        }}
        animate={{ opacity: state === "idle" ? [0.8, 1, 0.8] : [0.9, 1, 0.9] }}
        transition={{ duration: state === "rec" ? 1.1 : 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="relative w-full h-full"
        style={{ touchAction: "manipulation" }}
      >
        <defs>
          {/* Head — lit from the upper left, like the snare artwork */}
          <radialGradient id="tenorHead" cx="36%" cy="28%" r="78%">
            <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity="1" />
            <stop offset="70%" stopColor="hsl(var(--background))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="1" />
          </radialGradient>
          {/* Shell hoop — the amber rim that catches the light */}
          <linearGradient id="tenorHoop" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.85" />
            <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {DRUMS.map(({ drum, label, cx, cy, r, spock }) => (
          <g
            key={drum}
            onPointerDown={(e) => {
              e.preventDefault();
              onCapture?.(e, drum);
            }}
            className="cursor-pointer"
            aria-label={`Drum ${label}`}
            role="button"
          >
            {/* Generous invisible target so the small drums stay tappable */}
            <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />

            {/* Shell edge sitting just outside the hoop, so the drum reads as
                an object with depth rather than a flat outline. */}
            <circle
              cx={cx}
              cy={cy + 2}
              r={r}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={2.4}
              strokeOpacity={0.7}
            />
            <circle cx={cx} cy={cy} r={r} fill="url(#tenorHead)" />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="url(#tenorHoop)"
              strokeWidth={spock ? 2 : 2.6}
            />
            {/* Inner ring — where the head meets the bearing edge */}
            <circle
              cx={cx}
              cy={cy}
              r={r - (spock ? 4 : 6)}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth={0.9}
              strokeOpacity={0.13}
            />
            {/* Tension rods around the hoop */}
            {!spock &&
              Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                return (
                  <circle
                    key={i}
                    cx={cx + Math.cos(a) * (r - 2)}
                    cy={cy + Math.sin(a) * (r - 2)}
                    r={1.5}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.5}
                  />
                );
              })}
            <text
              x={cx}
              y={cy + (spock ? 5 : 7)}
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontSize={spock ? 15 : 20}
              fontWeight={600}
              fill="hsl(var(--muted-foreground))"
              fillOpacity={0.85}
              className="pointer-events-none"
            >
              {label}
            </text>
          </g>
        ))}

        {/* Struck drum — a flash on the head and a ring off the hoop, so you
            can see which drum took the stroke even at speed. */}
        <AnimatePresence>
          {hit && (
            <g key={lastHit.key} className="pointer-events-none">
              <motion.circle
                cx={hit.cx}
                cy={hit.cy}
                r={hit.r}
                fill={isRecording ? "rgba(240,90,90,0.30)" : "hsl(var(--primary))"}
                initial={{ opacity: isRecording ? 0.55 : 0.22 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
              />
              <motion.circle
                cx={hit.cx}
                cy={hit.cy}
                fill="none"
                stroke={isRecording ? "rgba(240,90,90,0.65)" : "hsl(var(--primary))"}
                strokeWidth={2}
                initial={{ r: hit.r * 0.75, opacity: 0.7 }}
                animate={{ r: hit.r * 1.45, opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
              />
            </g>
          )}
        </AnimatePresence>
      </svg>

      <span
        className="absolute left-0 right-0 -bottom-[18px] text-center text-[11px] tracking-[0.14em] uppercase text-muted-foreground pointer-events-none"
        aria-hidden
      >
        {CAPTION[state]}
      </span>
    </div>
  );
}

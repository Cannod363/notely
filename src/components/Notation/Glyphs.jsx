import React from "react";
import { isDotted, noteValue } from "@/lib/rhythmEngine";
import { flagCount } from "@/lib/engraving";

// ─── Visual constants (shared across all notation rendering) ───
export const STAFF_Y = 50;
export const STEM_HEIGHT = 34;
export const STEM_TOP = STAFF_Y - STEM_HEIGHT; // 16
export const NOTEHEAD_RX = 5.4;
export const NOTEHEAD_RY = 4.0;
export const BEAM_THICK = 3.2;
export const STAFF_LINE_GAP = 7;

const INK = "hsl(var(--foreground))";

// ─── Staff infrastructure ───
export function StaffLines({ x1, x2, y = STAFF_Y }) {
  return (
    <g stroke={INK} strokeWidth={1.1} opacity={0.75}>
      <line x1={x1} y1={y - 2 * STAFF_LINE_GAP} x2={x2} y2={y - 2 * STAFF_LINE_GAP} />
      <line x1={x1} y1={y - STAFF_LINE_GAP} x2={x2} y2={y - STAFF_LINE_GAP} />
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y + STAFF_LINE_GAP} x2={x2} y2={y + STAFF_LINE_GAP} />
      <line x1={x1} y1={y + 2 * STAFF_LINE_GAP} x2={x2} y2={y + 2 * STAFF_LINE_GAP} />
    </g>
  );
}

export function PercussionClef({ x, y = STAFF_Y }) {
  return (
    <g fill={INK}>
      <rect x={x} y={y - 2 * STAFF_LINE_GAP} width={3} height={4 * STAFF_LINE_GAP} rx={1} />
      <rect x={x + 5.5} y={y - 2 * STAFF_LINE_GAP} width={3} height={4 * STAFF_LINE_GAP} rx={1} />
    </g>
  );
}

export function TimeSignature({ x, y = STAFF_Y, num, den }) {
  return (
    <g fill={INK} fontFamily="serif" fontWeight={800} fontSize={20} textAnchor="middle">
      <text x={x} y={y - 3}>{num}</text>
      <text x={x} y={y + 15}>{den}</text>
    </g>
  );
}

export function Barline({ x, y = STAFF_Y, type = "single" }) {
  if (type === "final") {
    return (
      <g stroke={INK}>
        <line x1={x - 5} y1={y - 2 * STAFF_LINE_GAP} x2={x - 5} y2={y + 2 * STAFF_LINE_GAP} strokeWidth={1.2} opacity={0.6} />
        <line x1={x} y1={y - 2 * STAFF_LINE_GAP} x2={x} y2={y + 2 * STAFF_LINE_GAP} strokeWidth={2.6} />
      </g>
    );
  }
  return <line x1={x} y1={y - 2 * STAFF_LINE_GAP} x2={x} y2={y + 2 * STAFF_LINE_GAP} stroke={INK} strokeWidth={1.2} opacity={0.55} />;
}

// ─── Noteheads ───
// Ghost parentheses and rimshot circle scale with notehead dimensions.
export function Notehead({ cx, cy = STAFF_Y, fill, hollow = false, isGhost = false, isRimshot = false }) {
  if (isRimshot) {
    // Normal notehead with a diagonal slash through the ball (rimshot)
    return (
      <g>
        <ellipse
          cx={cx}
          cy={cy}
          rx={NOTEHEAD_RX}
          ry={NOTEHEAD_RY}
          fill={hollow ? "none" : fill}
          stroke={fill}
          strokeWidth={hollow ? 1.8 : 0}
        />
        <line
          x1={cx - NOTEHEAD_RX - 1}
          y1={cy + NOTEHEAD_RY + 1}
          x2={cx + NOTEHEAD_RX + 1}
          y2={cy - NOTEHEAD_RY - 1}
          stroke={fill}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (isGhost) {
    const parenSize = NOTEHEAD_RY * 3.4;
    const parenY = cy + NOTEHEAD_RY * 0.85;
    return (
      <g>
        <text x={cx - NOTEHEAD_RX - 3} y={parenY} fontSize={parenSize} fill={fill} fontWeight={700} fontFamily="serif">(</text>
        <ellipse cx={cx} cy={cy} rx={NOTEHEAD_RX} ry={NOTEHEAD_RY} fill={fill} />
        <text x={cx + NOTEHEAD_RX + 1} y={parenY} fontSize={parenSize} fill={fill} fontWeight={700} fontFamily="serif">)</text>
      </g>
    );
  }
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={NOTEHEAD_RX}
      ry={NOTEHEAD_RY}
      fill={hollow ? "none" : fill}
      stroke={fill}
      strokeWidth={hollow ? 1.8 : 0}
    />
  );
}

// ─── Stems & flags ───
export function Stem({ x, y = STAFF_Y, topY = STEM_TOP, fill }) {
  return <line x1={x} y1={y - 1} x2={x} y2={topY} stroke={fill} strokeWidth={1.6} strokeLinecap="round" />;
}

// One flag per beam level: eighth 1, 16th 2, 32nd 3, 64th 4. Extra flags stack
// down the stem at the same spacing the beams use.
export function Flag({ nv, x, y = STEM_TOP, fill }) {
  const count = flagCount(nv);
  if (count <= 0) return null;
  if (count === 1) {
    return (
      <path d={`M${x},${y} Q${x + 10},${y + 3} ${x + 7},${y + 14} Q${x + 10},${y + 7} ${x},${y + 5} Z`} fill={fill} />
    );
  }
  return (
    <g fill={fill}>
      {Array.from({ length: count }, (_, i) => {
        const fy = y + i * 6;
        return (
          <path
            key={i}
            d={`M${x},${fy} Q${x + 9},${fy + 3} ${x + 6},${fy + 11} Q${x + 9},${fy + 6} ${x},${fy + 4} Z`}
          />
        );
      })}
    </g>
  );
}

// ─── Beams ───
// The primary beam spans the whole group; every finer level (16th, 32nd, 64th)
// is drawn only across the notes that actually carry it, with a stub where a
// note has no neighbour at that level to beam to.
export function Beam({ group, stemTop = STEM_TOP, fill }) {
  const beamsOf = (item) => item.beams ?? flagCount(noteValue(item.note));
  const stemXOf = (item) => item.cx + NOTEHEAD_RX - 0.5;
  const maxLevel = Math.max(...group.map(beamsOf));
  const elements = [];
  const stubWidth = 7;

  for (let level = 1; level <= maxLevel; level++) {
    const y = stemTop + (level - 1) * (BEAM_THICK + 2.4);
    const thickness = level === 1 ? BEAM_THICK : BEAM_THICK - 0.6;

    let runStart = -1;
    for (let i = 0; i <= group.length; i++) {
      const inRun = i < group.length && beamsOf(group[i]) >= level;
      if (inRun && runStart < 0) runStart = i;
      if (inRun || runStart < 0) continue;

      const from = group[runStart];
      const to = group[i - 1];
      if (runStart < i - 1) {
        const x1 = stemXOf(from);
        const x2 = stemXOf(to);
        elements.push(
          <rect key={`l${level}-${runStart}`} x={x1} y={y} width={x2 - x1} height={thickness} fill={fill} rx={0.8} />
        );
      } else {
        // Lone note at this level — draw a stub on the side it belongs to
        const sx = stemXOf(from);
        const left = from.partialBeam === "left";
        elements.push(
          <rect
            key={`l${level}-stub${runStart}`}
            x={left ? sx - stubWidth : sx}
            y={y}
            width={stubWidth}
            height={thickness}
            fill={fill}
            rx={0.5}
          />
        );
      }
      runStart = -1;
    }
  }

  return <g>{elements}</g>;
}

// ─── Tuplet bracket ───
// Number above the group; a bracket too when the notes are not beamed together
// (beamed tuplets carry the number alone, which is standard engraving practice).
export function TupletBracket({ x1, x2, number, bracket, fill, y = STEM_TOP - 11 }) {
  const mid = (x1 + x2) / 2;
  const gap = 7;
  return (
    <g>
      {bracket && (
        <g stroke={fill} strokeWidth={1.2} strokeLinecap="round">
          <line x1={x1} y1={y + 4} x2={x1} y2={y} />
          <line x1={x1} y1={y} x2={mid - gap} y2={y} />
          <line x1={mid + gap} y1={y} x2={x2} y2={y} />
          <line x1={x2} y1={y} x2={x2} y2={y + 4} />
        </g>
      )}
      <text
        x={mid}
        y={y + 4}
        fontSize={11}
        fontWeight={700}
        fontStyle="italic"
        fontFamily="serif"
        textAnchor="middle"
        fill={fill}
      >
        {number}
      </text>
    </g>
  );
}

// ─── Dot ───
// Placed in the space above the staff line (standard for notes on a line).
export function Dot({ cx, cy = STAFF_Y, fill }) {
  return <circle cx={cx + NOTEHEAD_RX + 5} cy={cy - 3.5} r={1.8} fill={fill} />;
}

// ─── Rests ───
// Flagged rests (eighth and shorter) are drawn from a slanted stroke with one
// hook per beam level; longer rests have their own shapes. Dotted values render
// the base rest plus a dot.
export function Rest({ nv, cx, cy = STAFF_Y, fill }) {
  const y = cy - 2;
  const dotted = isDotted(nv);
  const baseDur = dotted ? (nv * 2) / 3 : nv;
  const dot = dotted ? <circle cx={cx + 9} cy={cy - 3.5} r={1.8} fill={fill} /> : null;

  if (baseDur <= 2 + 1e-6) {
    const hooks = flagCount(baseDur);
    const top = y - 6 - (hooks - 1) * 5.5;
    const bottom = y + 6;
    const stemX = (h) => cx + 3 - 7 * ((h - top) / (bottom - top));
    return (
      <g>
        <line x1={stemX(top)} y1={top} x2={stemX(bottom)} y2={bottom} stroke={fill} strokeWidth={1.8} strokeLinecap="round" />
        {Array.from({ length: hooks }, (_, i) => {
          const hy = top + i * 5.5 + 1;
          const hx = stemX(hy);
          return (
            <g key={i}>
              <circle cx={hx - 2.6} cy={hy} r={1.9} fill={fill} />
              <path d={`M${hx - 2.6},${hy - 1.4} Q${hx + 1},${hy - 3.5} ${hx + 3.4},${hy - 4.4}`} stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
            </g>
          );
        })}
        {dot}
      </g>
    );
  }

  if (baseDur <= 4 + 1e-6) {
    return (
      <g>
        <path d={`M${cx - 3},${y - 11} L${cx + 3},${y - 3} L${cx - 2},${y - 1} L${cx + 3},${y + 5} L${cx - 3},${y + 11}`} stroke={fill} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {dot}
      </g>
    );
  }

  if (baseDur <= 8 + 1e-6) {
    // Half rest — sits on the middle line
    return (
      <g>
        <rect x={cx - 5} y={cy - 5} width={10} height={4.5} fill={fill} rx={1} />
        {dot}
      </g>
    );
  }

  // Whole (or whole-measure) rest — hangs from the line above middle
  return <rect x={cx - 5} y={cy - STAFF_LINE_GAP} width={10} height={4.5} fill={fill} rx={1} />;
}

// ─── Accent mark ───
// Standard convention: above the notehead when stems point down, below when
// stems point up. Our percussion staff uses stems up, so accents go below.
export function AccentMark({ cx, stemDirection = "up", fill, cy = STAFF_Y }) {
  if (stemDirection === "down") {
    const y = STEM_TOP - 4;
    return <path d={`M${cx - 5},${y - 4} L${cx + 3},${y} L${cx - 5},${y + 4} L${cx - 3},${y} Z`} fill={fill} />;
  }
  const y = cy + 10;
  return <path d={`M${cx - 5},${y - 4} L${cx + 3},${y} L${cx - 5},${y + 4} L${cx - 3},${y} Z`} fill={fill} />;
}

// ─── Stem slash marks (diddle, roll) ───
// Diddle: single slash through the stem.
// Roll (buzz): "Z" slash through the stem.
export function StemSlash({ cx, stemTop = STEM_TOP, fill, type = "diddle" }) {
  const stemX = cx + NOTEHEAD_RX - 0.5;

  if (type === "roll") {
    return (
      <path
        d={`M${stemX - 5},${stemTop + 4} L${stemX + 5},${stemTop + 4} L${stemX - 5},${stemTop + 16} L${stemX + 5},${stemTop + 16}`}
        stroke={fill}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <line
      x1={stemX - 5}
      y1={stemTop + 16}
      x2={stemX + 5}
      y2={stemTop + 6}
      stroke={fill}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

// ─── Grace notes (flam, drag) ───
// Small noteheads with stems, positioned to the left of the main note,
// connected by a small slur. Spacing is allocated in the engraving engine.
export function GraceNotes({ ornament, cx, cy = STAFF_Y, fill }) {
  if (ornament === "flam") {
    const gx = cx - 14;
    return (
      <g>
        <ellipse cx={gx} cy={cy} rx={3.3} ry={2.7} fill={fill} />
        <line x1={gx + 2.5} y1={cy - 1} x2={gx + 2.5} y2={cy - 18} stroke={fill} strokeWidth={1.2} strokeLinecap="round" />
        <path d={`M${gx + 2.5},${cy - 16} Q${cx - 5},${cy - 26} ${cx - 2},${cy - 12}`} stroke={fill} strokeWidth={1} fill="none" opacity={0.55} />
      </g>
    );
  }
  if (ornament === "drag") {
    const gx1 = cx - 22;
    const gx2 = cx - 13;
    return (
      <g>
        <ellipse cx={gx1} cy={cy} rx={3.3} ry={2.7} fill={fill} />
        <line x1={gx1 + 2.5} y1={cy - 1} x2={gx1 + 2.5} y2={cy - 16} stroke={fill} strokeWidth={1.2} strokeLinecap="round" />
        <ellipse cx={gx2} cy={cy} rx={3.3} ry={2.7} fill={fill} />
        <line x1={gx2 + 2.5} y1={cy - 1} x2={gx2 + 2.5} y2={cy - 16} stroke={fill} strokeWidth={1.2} strokeLinecap="round" />
        <line x1={gx1 - 2} y1={cy - 9} x2={gx2 + 5} y2={cy - 15} stroke={fill} strokeWidth={1.4} strokeLinecap="round" />
        <path d={`M${gx2 + 2.5},${cy - 14} Q${cx - 5},${cy - 24} ${cx - 2},${cy - 10}`} stroke={fill} strokeWidth={1} fill="none" opacity={0.55} />
      </g>
    );
  }
  return null;
}

// ─── Sticking label ───
// Fixed baseline for consistent vertical alignment across all measures.
export function StickingLabel({ cx, y = STAFF_Y + 32, sticking }) {
  const color = sticking === "R" ? "#6366f1" : "#ec4899";
  return (
    <text x={cx} y={y} fontSize={13} fontWeight={800} fill={color} textAnchor="middle" fontFamily="sans-serif">
      {sticking}
    </text>
  );
}
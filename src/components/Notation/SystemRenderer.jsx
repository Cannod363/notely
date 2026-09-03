import React, { useMemo } from "react";
import { isDotted, flagCount } from "@/lib/engraving";
import { getOrnaments, noteValue } from "@/lib/rhythmEngine";
import {
  STAFF_Y,
  STEM_TOP,
  NOTEHEAD_RX,
  STAFF_LINE_GAP,
  StaffLines,
  PercussionClef,
  TimeSignature,
  Barline,
  Notehead,
  Stem,
  Flag,
  Beam,
  TupletBracket,
  Dot,
  Rest,
  AccentMark,
  StemSlash,
  GraceNotes,
  StickingLabel,
} from "@/components/notation/Glyphs";

// Tenor drum -> staff position (in staff-line gaps, positive = below middle).
// Drums 0-3 = the 4 main tenors on the staff spaces F, A, C, E (ascending
// thirds); drums 4-5 = the spocks clear of the staff, on G5 and A5. Those two
// positions are what musicxml.js exports, so the page matches the file.
const TENOR_DRUM_STEPS = [1.5, 0.5, -0.5, -1.5, -2.5, -3];

// Renders a single system (row) of notation as an SVG.
// Used by NotationStaff (scroll mode) and PrintLayout (page mode).
//
// Ornament rendering priority (z-order, back to front):
//   1. Grace notes (flam/drag) — left of notehead
//   2. Notehead (ghost parentheses, rimshot circle)
//   3. Stem + flags
//   4. Dot
//   5. Stem slash marks (diddle, roll)
//   6. Accent mark (below for stems up)
//   7. Sticking label
export default function SystemRenderer({
  system,
  timeSignature,
  showClef = true,
  showTimeSig = true,
  selectedIndex,
  onSelectNote,
  stickingVisible = true,
  confidenceColors = true,
  showMeasureNumbers = false,
  interactive = true,
  instrument = "snare",
}) {
  const { items, barlines, beamGroups, tupletGroups = [], width } = system;

  const beamedSet = useMemo(() => {
    const s = new Set();
    for (const g of beamGroups) for (const item of g) s.add(item.index);
    return s;
  }, [beamGroups]);

  const measureStarts = useMemo(() => {
    const seen = new Set();
    const starts = [];
    for (const it of items) {
      if (!seen.has(it.measureIdx)) {
        seen.add(it.measureIdx);
        starts.push({ measureIdx: it.measureIdx, x: it.x });
      }
    }
    return starts;
  }, [items]);

  const height = stickingVisible ? 104 : 78;
  const w = Math.max(width, 200);

  return (
    <svg width={w} height={height} className="block">
      <StaffLines x1={0} x2={w} y={STAFF_Y} />

      {showClef && <PercussionClef x={10} y={STAFF_Y} />}

      {showTimeSig && (
        <TimeSignature x={showClef ? 34 : 14} y={STAFF_Y} num={timeSignature.numerator} den={timeSignature.denominator} />
      )}

      {/* Barlines */}
      {barlines.map((bl, i) => (
        <Barline key={i} x={bl.x} y={STAFF_Y} type={bl.type} />
      ))}

      {/* Measure numbers */}
      {showMeasureNumbers &&
        measureStarts.map((ms) => (
          <text
            key={`mn-${ms.measureIdx}`}
            x={ms.x}
            y={STAFF_Y - 36}
            fontSize={11}
            fontWeight={700}
            fill="hsl(var(--muted-foreground))"
            className="select-none"
          >
            {ms.measureIdx + 1}
          </text>
        ))}

      {/* Beams */}
      {beamGroups.map((group, gi) => (
        <Beam key={`beam-${gi}`} group={group} stemTop={STEM_TOP} fill="hsl(var(--foreground))" />
      ))}

      {/* Tuplet numbers (with a bracket when the group is not beamed) */}
      {tupletGroups.map((group, gi) => {
        const first = group.items[0];
        const last = group.items[group.items.length - 1];
        const allBeamed = group.items.every((it) => beamedSet.has(it.index));
        return (
          <TupletBracket
            key={`tuplet-${gi}`}
            x1={first.cx - NOTEHEAD_RX}
            x2={last.cx + NOTEHEAD_RX}
            number={group.number}
            bracket={!allBeamed}
            fill="hsl(var(--foreground))"
          />
        );
      })}

      {/* Notes & rests */}
      {items.map((item) => {
        const { note, index, cx, x, w: nw } = item;
        const nv = noteValue(note);
        const isSelected = index === selectedIndex;
        const ornaments = getOrnaments(note);
        const hasGrace = ornaments.includes("flam") || ornaments.includes("drag");

        const fill = isSelected
          ? "hsl(var(--primary))"
          : confidenceColors && note.confidence_score < 0.7
          ? "#f59e0b"
          : "hsl(var(--foreground))";

        const stemX = cx + NOTEHEAD_RX - 0.5;
        const cy =
          instrument === "tenor" && note.drum != null
            ? STAFF_Y + (TENOR_DRUM_STEPS[Math.max(0, Math.min(5, note.drum))] ?? 0) * STAFF_LINE_GAP
            : STAFF_Y;

        return (
          <g
            key={`${index}-${cx}`}
            onClick={interactive ? (e) => { e.stopPropagation(); onSelectNote?.(index); } : undefined}
            className={interactive ? "cursor-pointer" : undefined}
          >
            {/* Invisible hit target — forgiving selection */}
            {interactive && (
              <rect x={x} y={STAFF_Y - 30} width={nw} height={stickingVisible ? 70 : 54} fill="transparent" />
            )}

            {/* Selection highlight */}
            {isSelected && interactive && (
              <rect
                x={x + 1}
                y={STAFF_Y - 26}
                width={nw - 2}
                height={stickingVisible ? 62 : 50}
                rx={4}
                fill="hsl(var(--primary))"
                opacity={0.1}
              />
            )}

            {note.is_rest ? (
              <Rest nv={nv} cx={cx} fill={fill} />
            ) : (
              <>
                {/* Grace notes (flam/drag) — behind main notehead */}
                {hasGrace && (
                  <GraceNotes
                    ornament={ornaments.includes("drag") ? "drag" : "flam"}
                    cx={cx}
                    cy={cy}
                    fill={fill}
                  />
                )}

                {/* Notehead (ghost/rimshot handled inside) */}
                <Notehead
                  cx={cx}
                  cy={cy}
                  fill={fill}
                  hollow={nv > 4}
                  isGhost={ornaments.includes("ghost")}
                  isRimshot={ornaments.includes("rimshot")}
                />

                {/* Stem (skip for whole notes) */}
                {nv < 16 && (
                  <Stem x={stemX} y={cy} topY={STEM_TOP} fill={fill} />
                )}

                {/* Flags (unbeamed eighth and shorter) */}
                {!beamedSet.has(index) && flagCount(nv) > 0 && (
                  <Flag nv={nv} x={stemX} fill={fill} />
                )}

                {/* Dot */}
                {isDotted(nv) && <Dot cx={cx} cy={cy} fill={fill} />}

                {/* Stem slash marks (diddle, roll) */}
                {ornaments.includes("diddle") && (
                  <StemSlash cx={cx} stemTop={STEM_TOP} fill={fill} type="diddle" />
                )}
                {ornaments.includes("roll") && (
                  <StemSlash cx={cx} stemTop={STEM_TOP} fill={fill} type="roll" />
                )}

                {/* Accent — below for stems up (standard convention) */}
                {ornaments.includes("accent") && (
                  <AccentMark cx={cx} cy={cy} stemDirection="up" fill={fill} />
                )}

                {/* Sticking */}
                {stickingVisible && note.sticking && (
                  <StickingLabel cx={cx} sticking={note.sticking} />
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
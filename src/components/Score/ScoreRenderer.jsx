import React, { useMemo } from "react";
import { STAFF_GAP, HALF, isDotted, ledgerPositions } from "@/lib/scoreEngraving";

// Draws the staves produced by scoreEngraving. Everything here is geometry:
// the engraver has already decided what goes where, this only puts ink down.
//
// Clefs and accidentals use the Unicode musical symbols, which every platform
// this runs on ships a font for — hand-rolled paths for a treble clef look
// worse than the real glyph at this size.
const MUSIC_FONT =
  '"Bravura", "Segoe UI Symbol", "Apple Symbols", "Noto Music", "Noto Sans Symbols2", serif';

const CLEF_GLYPH = { G: "\u{1D11E}", F: "\u{1D122}", C: "\u{1D121}" };

const NOTEHEAD_RX = 5.2;
const NOTEHEAD_RY = 3.9;
const STEM_LENGTH = STAFF_GAP * 3.5;
const BEAM_THICK = 3.4;
const BEAM_STEP = BEAM_THICK + 2.2;

// A position (half-gaps from the middle line) to a y coordinate.
const yOf = (position, middleY) => middleY - position * HALF;

function StaffLines({ x1, x2, middleY }) {
  return (
    <g stroke="hsl(var(--foreground))" strokeWidth={1} opacity={0.6}>
      {[-4, -2, 0, 2, 4].map((p) => (
        <line key={p} x1={x1} y1={yOf(p, middleY)} x2={x2} y2={yOf(p, middleY)} />
      ))}
    </g>
  );
}

function Notehead({ cx, cy, hollow, fill }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={NOTEHEAD_RX}
      ry={NOTEHEAD_RY}
      transform={`rotate(-18 ${cx} ${cy})`}
      fill={hollow ? "none" : fill}
      stroke={fill}
      strokeWidth={hollow ? 1.6 : 0}
    />
  );
}

function Flag({ x, y, count, down, fill }) {
  const direction = down ? -1 : 1;
  return (
    <g fill={fill}>
      {Array.from({ length: count }, (_, i) => {
        const fy = y + i * 6.5 * direction;
        return (
          <path
            key={i}
            d={
              down
                ? `M${x},${fy} Q${x + 9},${fy - 3} ${x + 6},${fy - 12} Q${x + 9},${fy - 6} ${x},${fy - 4} Z`
                : `M${x},${fy} Q${x + 9},${fy + 3} ${x + 6},${fy + 12} Q${x + 9},${fy + 6} ${x},${fy + 4} Z`
            }
          />
        );
      })}
    </g>
  );
}

// Rests: a stack of hooks for eighth and shorter, dedicated shapes above that.
function Rest({ nv, cx, middleY, fill }) {
  const dotted = isDotted(nv);
  const base = dotted ? (nv * 2) / 3 : nv;
  const dot = dotted ? <circle cx={cx + 9} cy={middleY - 4} r={1.7} fill={fill} /> : null;

  if (base >= 15) {
    // Whole rest hangs below the second line from the top.
    return (
      <g>
        <rect x={cx - 5.5} y={yOf(2, middleY)} width={11} height={4.4} fill={fill} />
        {dot}
      </g>
    );
  }
  if (base >= 7) {
    return (
      <g>
        <rect x={cx - 5.5} y={yOf(0, middleY) - 4.4} width={11} height={4.4} fill={fill} />
        {dot}
      </g>
    );
  }
  if (base >= 3) {
    const y = middleY;
    return (
      <g>
        <path
          d={`M${cx - 3},${y - 12} L${cx + 3},${y - 4} L${cx - 2},${y - 1} L${cx + 3},${y + 6} L${cx - 3},${y + 12}`}
          stroke={fill}
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {dot}
      </g>
    );
  }

  const hooks = base <= 0.25 ? 4 : base <= 0.5 ? 3 : base <= 1 ? 2 : 1;
  const top = middleY - 6 - (hooks - 1) * 5.5;
  const bottom = middleY + 7;
  const stemX = (h) => cx + 3 - 7 * ((h - top) / (bottom - top));
  return (
    <g>
      <line x1={stemX(top)} y1={top} x2={stemX(bottom)} y2={bottom} stroke={fill} strokeWidth={1.7} strokeLinecap="round" />
      {Array.from({ length: hooks }, (_, i) => {
        const hy = top + i * 5.5 + 1;
        const hx = stemX(hy);
        return (
          <g key={i}>
            <circle cx={hx - 2.5} cy={hy} r={1.9} fill={fill} />
            <path
              d={`M${hx - 2.5},${hy - 1.4} Q${hx + 1},${hy - 3.4} ${hx + 3.3},${hy - 4.3}`}
              stroke={fill}
              strokeWidth={1.4}
              fill="none"
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {dot}
    </g>
  );
}

function Beams({ group, middleY, fill }) {
  const stemX = (n) => n.cx + (n.stemDown ? -NOTEHEAD_RX + 0.4 : NOTEHEAD_RX - 0.4);
  const down = group[0].stemDown;
  // The beam sits at the far end of the stems, on whichever side they point.
  const edge = group.map((n) =>
    down
      ? yOf(n.bottomPosition, middleY) + STEM_LENGTH
      : yOf(n.topPosition, middleY) - STEM_LENGTH
  );
  const beamY = down ? Math.max(...edge) : Math.min(...edge);
  const direction = down ? -1 : 1;
  const maxLevel = Math.max(...group.map((n) => n.beams));
  const elements = [];

  for (let level = 1; level <= maxLevel; level++) {
    const y = beamY + (level - 1) * BEAM_STEP * direction - (down ? BEAM_THICK : 0);
    let runStart = -1;
    for (let i = 0; i <= group.length; i++) {
      const inRun = i < group.length && group[i].beams >= level;
      if (inRun && runStart < 0) runStart = i;
      if (inRun || runStart < 0) continue;

      const from = group[runStart];
      if (runStart < i - 1) {
        const to = group[i - 1];
        elements.push(
          <rect
            key={`b${level}-${runStart}`}
            x={stemX(from)}
            y={y}
            width={stemX(to) - stemX(from)}
            height={BEAM_THICK}
            fill={fill}
            rx={0.7}
          />
        );
      } else {
        const stubWidth = 8;
        const left = from.partialBeam === "left";
        elements.push(
          <rect
            key={`b${level}-stub${runStart}`}
            x={left ? stemX(from) - stubWidth : stemX(from)}
            y={y}
            width={stubWidth}
            height={BEAM_THICK}
            fill={fill}
            rx={0.5}
          />
        );
      }
      runStart = -1;
    }
  }

  // Stems reach all the way to the beam.
  const stems = group.map((n, i) => {
    const from = down ? yOf(n.topPosition, middleY) : yOf(n.bottomPosition, middleY);
    return (
      <line
        key={`s${i}`}
        x1={stemX(n)}
        y1={from}
        x2={stemX(n)}
        y2={beamY + (down ? 0 : BEAM_THICK)}
        stroke={fill}
        strokeWidth={1.5}
      />
    );
  });

  return (
    <g>
      {stems}
      {elements}
    </g>
  );
}

export default function ScoreRenderer({
  layout,
  activeIndex = null,
  systemHeight,
  onSelectNote,
}) {
  const { systems, keyAccidentals, clef, timeSignature, extent } = layout;

  // Enough room above and below the staff for the highest and lowest ink.
  const padTop = Math.max(30, (extent.highest - 4) * HALF + 26);
  const padBottom = Math.max(26, (-4 - extent.lowest) * HALF + 22);
  const rowHeight = systemHeight || padTop + STAFF_GAP * 4 + padBottom;
  const middleY = padTop + STAFF_GAP * 2;

  const beamedIndices = useMemo(() => {
    const set = new Set();
    for (const system of systems)
      for (const group of system.beamGroups) for (const note of group) set.add(note.index);
    return set;
  }, [systems]);

  const clefGlyph = CLEF_GLYPH[(clef.sign || "G").toUpperCase()];
  // The clef's own glyph is drawn sitting on the line the clef names.
  const clefLine = clef.line ?? (clef.sign === "F" ? 4 : clef.sign === "C" ? 3 : 2);
  const clefY = yOf((clefLine - 3) * 2, middleY);

  return (
    <div className="space-y-1">
      {systems.map((system, systemIdx) => (
        <svg
          key={systemIdx}
          width="100%"
          viewBox={`0 0 ${system.width} ${rowHeight}`}
          preserveAspectRatio="xMinYMin meet"
          className="block overflow-visible"
        >
          <StaffLines x1={0} x2={system.width} middleY={middleY} />

          {/* Clef, key signature and time signature open every system */}
          {clefGlyph && (
            <text
              x={6}
              y={clefY + (clef.sign === "G" ? 10 : clef.sign === "F" ? -2 : 4)}
              fontSize={clef.sign === "G" ? 42 : 30}
              fontFamily={MUSIC_FONT}
              fill="hsl(var(--foreground))"
            >
              {clefGlyph}
            </text>
          )}

          {keyAccidentals.map((acc, i) => (
            <text
              key={`k${i}`}
              x={26 + i * 8}
              y={yOf(acc.position, middleY) + 5}
              fontSize={17}
              fontFamily={MUSIC_FONT}
              fill="hsl(var(--foreground))"
            >
              {acc.glyph}
            </text>
          ))}

          {systemIdx === 0 && (
            <g
              fill="hsl(var(--foreground))"
              fontFamily="serif"
              fontWeight={800}
              fontSize={17}
              textAnchor="middle"
            >
              <text x={30 + keyAccidentals.length * 8} y={yOf(2, middleY) + 6}>
                {timeSignature.numerator}
              </text>
              <text x={30 + keyAccidentals.length * 8} y={yOf(-2, middleY) + 6}>
                {timeSignature.denominator}
              </text>
            </g>
          )}

          {/* Barlines */}
          {system.barlines.map((bar, i) => {
            const last = system.isLast && i === system.barlines.length - 1;
            return last ? (
              <g key={i} stroke="hsl(var(--foreground))">
                <line x1={bar.x - 4} y1={yOf(4, middleY)} x2={bar.x - 4} y2={yOf(-4, middleY)} strokeWidth={1} opacity={0.6} />
                <line x1={bar.x} y1={yOf(4, middleY)} x2={bar.x} y2={yOf(-4, middleY)} strokeWidth={2.6} />
              </g>
            ) : (
              <line
                key={i}
                x1={bar.x}
                y1={yOf(4, middleY)}
                x2={bar.x}
                y2={yOf(-4, middleY)}
                stroke="hsl(var(--foreground))"
                strokeWidth={1}
                opacity={0.5}
              />
            );
          })}

          {/* Beam groups (these also draw their own stems) */}
          {system.beamGroups.map((group, i) => (
            <Beams key={`bg${i}`} group={group} middleY={middleY} fill="hsl(var(--foreground))" />
          ))}

          {/* Notes and rests */}
          {system.notes.map((note) => {
            const active = note.index === activeIndex;
            const fill = active ? "hsl(var(--primary))" : "hsl(var(--foreground))";
            const { item } = note;

            if (item.isRest) {
              return (
                <g key={note.index} onClick={() => onSelectNote?.(note.index)}>
                  <Rest nv={item.nv} cx={note.cx} middleY={middleY} fill={fill} />
                </g>
              );
            }

            const hollow = item.nv >= 7;
            const stemless = item.nv >= 15;
            const beamed = beamedIndices.has(note.index);
            const stemX = note.cx + (note.stemDown ? -NOTEHEAD_RX + 0.4 : NOTEHEAD_RX - 0.4);
            const stemFrom = note.stemDown
              ? yOf(note.topPosition, middleY)
              : yOf(note.bottomPosition, middleY);
            const stemTo = note.stemDown
              ? yOf(note.bottomPosition, middleY) + STEM_LENGTH
              : yOf(note.topPosition, middleY) - STEM_LENGTH;

            return (
              <g
                key={note.index}
                onClick={() => onSelectNote?.(note.index)}
                className={onSelectNote ? "cursor-pointer" : undefined}
              >
                {active && (
                  <rect
                    x={note.cx - 11}
                    y={yOf(note.topPosition, middleY) - 14}
                    width={22}
                    height={yOf(note.bottomPosition, middleY) - yOf(note.topPosition, middleY) + 28}
                    rx={5}
                    fill="hsl(var(--primary))"
                    opacity={0.14}
                  />
                )}

                {/* Ledger lines */}
                {ledgerPositions(note.topPosition, note.bottomPosition).map((p) => (
                  <line
                    key={p}
                    x1={note.cx - 9}
                    y1={yOf(p, middleY)}
                    x2={note.cx + 9}
                    y2={yOf(p, middleY)}
                    stroke={fill}
                    strokeWidth={1}
                  />
                ))}

                {/* Accidentals, stacked left of the chord */}
                {note.accidentals.map((acc, i) => (
                  <text
                    key={`a${i}`}
                    x={note.cx - NOTEHEAD_RX - 6 - i * 9}
                    y={yOf(acc.position, middleY) + 5}
                    fontSize={16}
                    fontFamily={MUSIC_FONT}
                    fill={fill}
                    textAnchor="end"
                  >
                    {acc.glyph}
                  </text>
                ))}

                {!stemless && !beamed && (
                  <line x1={stemX} y1={stemFrom} x2={stemX} y2={stemTo} stroke={fill} strokeWidth={1.5} />
                )}

                {!stemless && !beamed && note.beams > 0 && (
                  <Flag x={stemX} y={stemTo} count={note.beams} down={note.stemDown} fill={fill} />
                )}

                {note.positions.map((p, i) => (
                  <g key={`n${i}`}>
                    <Notehead cx={note.cx} cy={yOf(p, middleY)} hollow={hollow} fill={fill} />
                    {isDotted(item.nv) && (
                      <circle cx={note.cx + NOTEHEAD_RX + 5} cy={yOf(p, middleY) - (p % 2 === 0 ? 4 : 0)} r={1.7} fill={fill} />
                    )}
                  </g>
                ))}

                {item.accent && (
                  <path
                    d={`M${note.cx - 5},${yOf(note.bottomPosition, middleY) + 12} L${note.cx + 4},${yOf(note.bottomPosition, middleY) + 15} L${note.cx - 5},${yOf(note.bottomPosition, middleY) + 18}`}
                    stroke={fill}
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                )}
                {item.staccato && (
                  <circle cx={note.cx} cy={yOf(note.bottomPosition, middleY) + 12} r={1.6} fill={fill} />
                )}
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}

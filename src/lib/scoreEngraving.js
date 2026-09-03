// ─── Score Engraving (pitched staves) ───
// Lays out imported music on a normal five-line staff. The percussion engraver
// in engraving.js pins every notehead to one line; this one has to work out
// where each note sits, which way its stem points, when it needs ledger lines,
// and where the key signature goes.
//
// Positions are counted in half-gaps from the middle line: 0 is the middle
// line, +1 the space above it, +2 the next line up. Lines are the even numbers
// from -4 to +4, so anything outside that range needs ledger lines.

import { middleLineDiatonic } from "@/lib/musicxmlImport";

export const STAFF_GAP = 8; // distance between staff lines
export const HALF = STAFF_GAP / 2; // one position step

// How many beams a note value carries. Mirrors flagCount in engraving.js but
// works from the printed value, which imported music always gives us.
export function beamCount(nv) {
  const base = isDotted(nv) ? (nv * 2) / 3 : nv;
  if (base <= 0.125 + 1e-6) return 5;
  if (base <= 0.25 + 1e-6) return 4;
  if (base <= 0.5 + 1e-6) return 3;
  if (base <= 1 + 1e-6) return 2;
  if (base <= 2 + 1e-6) return 1;
  return 0;
}

export function isDotted(nv) {
  return [0.375, 0.75, 1.5, 3, 6, 12, 24].some((v) => Math.abs(v - nv) < 1e-6);
}

// ─── Key signatures ───
// Accidentals don't march up or down the staff in a straight line — they zigzag
// so the group stays inside it. These are the classical step patterns, applied
// after the first accidental is placed as high as the staff allows.
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const SHARP_STEPS = [-3, 4, -3, -3, 4, -3];
const FLAT_STEPS = [3, -4, 3, -4, 3, -4];

const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Place the first accidental on the highest line or space that still sits in
// the staff, then follow the pattern.
function firstAccidentalPosition(letter, middleDiatonic, ceiling) {
  let best = null;
  for (let octave = 0; octave <= 9; octave++) {
    const pos = octave * 7 + STEP_INDEX[letter] - middleDiatonic;
    if (pos <= ceiling && (best === null || pos > best)) best = pos;
  }
  return best ?? 0;
}

export function keySignatureAccidentals(fifths, clef) {
  const middle = middleLineDiatonic(clef);
  if (middle === null || !fifths) return [];

  const sharps = fifths > 0;
  const order = sharps ? SHARP_ORDER : FLAT_ORDER;
  const steps = sharps ? SHARP_STEPS : FLAT_STEPS;
  const count = Math.min(Math.abs(fifths), 7);

  let position = firstAccidentalPosition(order[0], middle, sharps ? 4 : 2);
  const out = [{ glyph: sharps ? "♯" : "♭", position }];
  for (let i = 1; i < count; i++) {
    position += steps[i - 1];
    out.push({ glyph: sharps ? "♯" : "♭", position });
  }
  return out;
}

const ACCIDENTAL_GLYPH = {
  sharp: "♯",
  flat: "♭",
  natural: "♮",
  "double-sharp": "♯♯",
  "flat-flat": "♭♭",
  "double-flat": "♭♭",
};

// ─── Beat grouping ───
// Where beams are allowed to break, in sixteenths from the start of the bar.
function beatBoundaries(timeSignature) {
  const { numerator, denominator } = timeSignature;
  const measure16 = (numerator * 16) / denominator;
  // Compound meters group in threes; everything else beams by the beat.
  const beat16 =
    denominator === 8 && numerator % 3 === 0 ? 6 : (4 * 4) / denominator;
  const bounds = [];
  for (let p = 0; p <= measure16 + 1e-6; p += beat16) bounds.push(p);
  return bounds;
}

// ─── Main entry ───

export function engraveScore(items, options) {
  const {
    clef = { sign: "G", line: 2 },
    keyFifths = 0,
    timeSignature = { numerator: 4, denominator: 4 },
    systemWidth = 640,
    unitWidth = 15,
    minNoteWidth = 22,
    headroom = 26, // padding left of the first note for clef/key/time
  } = options || {};

  const middle = middleLineDiatonic(clef);
  const keyAccidentals = keySignatureAccidentals(keyFifths, clef);
  const bounds = beatBoundaries(timeSignature);
  const measure16 = (timeSignature.numerator * 16) / timeSignature.denominator;

  // ── Step 1: turn each item into something drawable ──
  const drawn = items.map((item, index) => {
    const positions = item.pitches.map((p) =>
      middle === null ? 0 : p.diatonic - middle
    );
    const accidentals = item.pitches
      .map((p, i) => ({
        glyph: ACCIDENTAL_GLYPH[p.accidental] || null,
        position: positions[i],
      }))
      .filter((a) => a.glyph);

    const average = positions.length
      ? positions.reduce((a, b) => a + b, 0) / positions.length
      : 0;
    // Notes above the middle line hang their stems down, and vice versa.
    const stemDown = average > 0;

    return {
      item,
      index,
      positions,
      accidentals,
      stemDown,
      beams: item.isRest ? 0 : beamCount(item.nv),
      topPosition: positions.length ? Math.max(...positions) : 0,
      bottomPosition: positions.length ? Math.min(...positions) : 0,
      tieStart: item.pitches.some((p) => p.tieStart),
      tieStop: item.pitches.some((p) => p.tieStop),
    };
  });

  // ── Step 2: group into measures ──
  const measures = [];
  let current = null;
  for (const d of drawn) {
    const key = d.item.measure ?? Math.floor(d.item.onset16 / measure16);
    if (!current || current.key !== key) {
      current = { key, notes: [], start16: d.item.onset16 };
      measures.push(current);
    }
    d.relGrid = d.item.onset16 - current.start16;
    current.notes.push(d);
  }

  // ── Step 3: lay each measure out proportionally ──
  const laid = measures.map((measure, measureIdx) => {
    let x = 0;
    const notes = measure.notes.map((d) => {
      const accidentalWidth = d.accidentals.length ? 11 : 0;
      const width = Math.max(minNoteWidth, d.item.dur16 * unitWidth) + accidentalWidth;
      const placed = { ...d, x, w: width, cx: x + accidentalWidth + (width - accidentalWidth) / 2, measureIdx };
      x += width;
      return placed;
    });
    return { notes, width: x + 10, measureIdx };
  });

  // ── Step 4: wrap measures into systems ──
  const systems = [];
  let row = [];
  let rowWidth = 0;
  for (const measure of laid) {
    const firstOfRow = row.length === 0;
    const budget = systemWidth - (firstOfRow ? headroom : 0);
    if (!firstOfRow && rowWidth + measure.width > budget) {
      systems.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(measure);
    rowWidth += measure.width;
  }
  if (row.length) systems.push(row);

  // ── Step 5: absolute positions, barlines, beams, ledger lines ──
  const built = systems.map((measuresInRow, systemIdx) => {
    let cursor = headroom;
    const notes = [];
    const barlines = [];

    // Stretch the row to fill the width, except the last one.
    const naturalWidth = measuresInRow.reduce((sum, m) => sum + m.width, 0);
    const slack = systemIdx === systems.length - 1 ? 0 : Math.max(0, systemWidth - headroom - naturalWidth);
    const stretch = naturalWidth > 0 ? slack / naturalWidth : 0;

    for (const measure of measuresInRow) {
      const scaled = measure.width * (1 + stretch);
      for (const note of measure.notes) {
        notes.push({
          ...note,
          x: cursor + note.x * (1 + stretch),
          cx: cursor + note.cx * (1 + stretch),
        });
      }
      cursor += scaled;
      barlines.push({ x: cursor - 5, measureNumber: measure.notes[0]?.item.measure });
    }

    const beamGroups = computeBeamGroups(notes, bounds);
    return {
      notes,
      barlines,
      beamGroups,
      width: Math.max(cursor, systemWidth),
      isFirst: systemIdx === 0,
      isLast: systemIdx === systems.length - 1,
    };
  });

  // Vertical extent: how far notes stray outside the staff decides the row height.
  let highest = 4;
  let lowest = -4;
  for (const s of built) {
    for (const n of s.notes) {
      highest = Math.max(highest, n.topPosition + (n.stemDown ? 0 : 7));
      lowest = Math.min(lowest, n.bottomPosition - (n.stemDown ? 7 : 0));
    }
  }

  return {
    systems: built,
    keyAccidentals,
    clef,
    timeSignature,
    extent: { highest, lowest },
  };
}

// Beams join notes of an eighth or shorter inside one beat of one measure.
function computeBeamGroups(notes, bounds) {
  const groups = [];
  let current = [];
  let lastBeat = -1;
  let lastMeasure = -1;

  const beatOf = (relGrid) => {
    let beat = 0;
    for (let i = 0; i < bounds.length - 1; i++) {
      if (relGrid >= bounds[i] - 1e-6 && relGrid < bounds[i + 1] - 1e-6) return i;
      beat = i;
    }
    return beat;
  };

  const flush = () => {
    if (current.length > 1) groups.push(current);
    current = [];
  };

  for (const note of notes) {
    const beammable = !note.item.isRest && note.beams > 0;
    const beat = beatOf(note.relGrid);
    const sameGroup = beat === lastBeat && note.measureIdx === lastMeasure;

    if (beammable && (current.length === 0 || sameGroup)) {
      current.push(note);
    } else {
      flush();
      if (beammable) current.push(note);
    }
    lastBeat = beat;
    lastMeasure = note.measureIdx;
  }
  flush();

  // A beamed group shares one stem direction — the majority wins, so a run
  // doesn't flip stems mid-beam.
  for (const group of groups) {
    const down = group.filter((n) => n.stemDown).length;
    const direction = down > group.length / 2;
    for (const note of group) note.stemDown = direction;
    // Isolated finer beams point toward the side of the beat they belong to.
    for (const note of group) {
      const steps = Math.round(note.relGrid / Math.max(note.item.nv, 0.125));
      note.partialBeam = steps % 2 === 0 ? "right" : "left";
    }
  }

  return groups;
}

// Ledger lines needed for a position, as an array of positions to draw at.
export function ledgerPositions(topPosition, bottomPosition) {
  const lines = [];
  for (let p = 6; p <= topPosition; p += 2) lines.push(p);
  for (let p = -6; p >= bottomPosition; p -= 2) lines.push(p);
  return lines;
}

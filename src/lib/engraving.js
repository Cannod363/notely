// ─── Engraving Engine ───
// Professional notation layout: proportional spacing, beat-grouped beaming,
// measure justification, rest consolidation, partial beams, and line-wrapping.

import { getOrnaments, noteValue, isDotted as isDottedValue } from "@/lib/rhythmEngine";

// Standard rest durations for consolidation (largest first)
const REST_VALUES = [8, 6, 4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];

export const isDotted = isDottedValue;

// How many flags (or beam levels) a note value carries: an eighth has one, a
// 16th two, a 32nd three, a 64th four. A dot doesn't change the flag count —
// a dotted eighth still beams as an eighth.
export function flagCount(nv) {
  const base = isDotted(nv) ? (nv * 2) / 3 : nv;
  if (base <= 0.25 + 1e-6) return 4;
  if (base <= 0.5 + 1e-6) return 3;
  if (base <= 1 + 1e-6) return 2;
  if (base <= 2 + 1e-6) return 1;
  return 0;
}

// ─── Beat grouping ───
// Returns array of sixteenths per beat — drives beam grouping, rest
// consolidation, and beat boundary detection for all meters.
export function beatGroupPattern(timeSignature) {
  const { numerator, denominator } = timeSignature;
  if (denominator === 8) {
    // Compound meters: beat = dotted quarter = 6 sixteenths
    if (numerator === 6) return [6, 6];           // 6/8: two beats
    if (numerator === 9) return [6, 6, 6];        // 9/8: three beats
    if (numerator === 12) return [6, 6, 6, 6];     // 12/8: four beats
    // Mixed meters with denominator 8
    if (numerator === 7) return [4, 4, 6];        // 7/8: 2+2+3
    if (numerator === 5) return [4, 6];          // 5/8: 2+3
    if (numerator === 3) return [6];             // 3/8: one beat
    if (numerator === 2) return [4];             // 2/8
  }
  // Simple meters (denominator 4): beats of 4 sixteenths (quarter note)
  const numBeats = Math.round(numerator * (4 / denominator));
  return Array(numBeats).fill(4);
}

export function beatSixteenths(timeSignature) {
  return beatGroupPattern(timeSignature)[0] || 4;
}

export function measureSixteenths(timeSignature) {
  return beatGroupPattern(timeSignature).reduce((a, b) => a + b, 0);
}

// Compute beat boundaries (grid positions where each beat starts, within a measure)
function computeBeatBoundaries(beatGroups) {
  const boundaries = [0];
  let pos = 0;
  for (const g of beatGroups) {
    pos += g;
    boundaries.push(pos);
  }
  return boundaries;
}

// Tuplet spans are thirds and sevenths of a beat, so positions accumulate
// rounding error — compare against boundaries with a tolerance, or the first
// note of a beat lands in the previous one.
const GRID_EPS = 1e-6;

function beatOf(relGrid, boundaries) {
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (relGrid >= boundaries[i] - GRID_EPS && relGrid < boundaries[i + 1] - GRID_EPS) return i;
  }
  return Math.max(0, boundaries.length - 2);
}

// Split a total rest duration into the fewest standard rest values,
// respecting beat boundaries (never crosses a beat line).
function splitRests(totalDur, beatBoundaries, startRelGrid) {
  const result = [];
  let remaining = totalDur;
  let currentGrid = startRelGrid;

  while (remaining > 1e-6) {
    const beatIdx = beatOf(currentGrid, beatBoundaries);
    const beatEnd = beatBoundaries[beatIdx + 1];
    const spaceInBeat = beatEnd - currentGrid;

    let chosen = remaining;
    for (const v of REST_VALUES) {
      if (v <= remaining + 1e-6 && v <= spaceInBeat + 1e-6) {
        chosen = v;
        break;
      }
    }
    result.push(chosen);
    remaining -= chosen;
    currentGrid += chosen;
  }
  return result;
}

// Consolidate consecutive rests within the same beat into the cleanest
// legal representation (e.g. two eighth rests → one quarter rest).
function consolidateRests(entries, beatBoundaries) {
  const result = [];
  let i = 0;

  while (i < entries.length) {
    if (!entries[i].note.is_rest || entries[i].note.tuplet) {
      result.push(entries[i]);
      i++;
      continue;
    }

    const startRelGrid = entries[i].relGrid;
    let totalDur = 0;
    const firstIndex = entries[i].index;
    let j = i;
    let currentRelGrid = startRelGrid;

    while (j < entries.length && entries[j].note.is_rest && !entries[j].note.tuplet) {
      const beatIdx = beatOf(currentRelGrid, beatBoundaries);
      const beatEnd = beatBoundaries[beatIdx + 1];
      if (currentRelGrid + entries[j].note.duration_16ths > beatEnd + GRID_EPS) break;
      totalDur += entries[j].note.duration_16ths;
      currentRelGrid += entries[j].note.duration_16ths;
      j++;
    }

    if (j > i + 1 && totalDur > 0) {
      const durations = splitRests(totalDur, beatBoundaries, startRelGrid);
      let relGrid = startRelGrid;
      for (const d of durations) {
        result.push({
          note: { ...entries[i].note, duration_16ths: d, nv: d, ornaments: [], sticking: null },
          index: firstIndex,
          relGrid,
        });
        relGrid += d;
      }
    } else {
      result.push(entries[i]);
    }
    // Ensure forward progress even when a rest can't be consolidated
    // (e.g. a rest that crosses a beat boundary due to tuplet positioning)
    i = j > i ? j : i + 1;
  }
  return result;
}

// ─── Main engraving function ───
// systemWidth=null → scroll mode (single system, no justification).
// systemWidth=number → page mode (measures wrap, justified to fill width).
export function engrave(notation, timeSignature, opts = {}) {
  const {
    systemWidth = null,
    unitWidth = 13,
    minNoteWidth = 13,
    minSpacing = 0,
    paddingLeft = 80,
    paddingRight = 14,
    graceWidth = 18,
  } = opts;

  const beatGroups = beatGroupPattern(timeSignature);
  const beatBoundaries = computeBeatBoundaries(beatGroups);
  const spm = measureSixteenths(timeSignature);

  // Step 1: Group notes into measures, consolidating rests
  const measures = [];
  let gridIdx = 0;
  let currentNotes = [];
  let measureStart = 0;

  for (let i = 0; i < notation.length; i++) {
    const note = notation[i];
    currentNotes.push({ note, index: i, relGrid: gridIdx - measureStart });
    gridIdx += note.duration_16ths;

    if (gridIdx >= measureStart + spm - 0.01) {
      currentNotes = finalizeMeasureNotes(currentNotes, beatBoundaries);
      measures.push({ notes: currentNotes, start: measureStart });
      currentNotes = [];
      measureStart += spm;
    }
  }
  if (currentNotes.length > 0) {
    currentNotes = finalizeMeasureNotes(currentNotes, beatBoundaries);
    measures.push({ notes: currentNotes, start: measureStart });
  }

  // Step 2: Layout each measure with proportional spacing
  const layoutedMeasures = measures.map((m) => {
    let x = paddingLeft;
    const items = [];
    for (const entry of m.notes) {
      const { note, index, relGrid } = entry;
      // Notes are spaced in proportion to how long they sound, tuplets included
      const dur = note.duration_16ths;
      const ornaments = getOrnaments(note);
      const hasGrace = ornaments.includes("flam") || ornaments.includes("drag");
      const graceExtra = ornaments.includes("drag") ? graceWidth + 8 : ornaments.includes("flam") ? graceWidth : 0;

      const noteW = Math.max(minNoteWidth, dur * unitWidth + minSpacing);
      const w = noteW + graceExtra;
      // Shift notehead right for grace notes so they have dedicated space to the left
      const cx = hasGrace ? x + graceExtra + noteW / 2 : x + w / 2;

      items.push({ note, index, x, w, cx, relGrid });
      x += w;
    }
    return { items, start: m.start, width: x + paddingRight };
  });

  // Step 3: Wrap measures into systems (rows)
  let systemMeasures;
  if (systemWidth == null) {
    systemMeasures = [layoutedMeasures];
  } else {
    systemMeasures = [];
    let current = [];
    let currentWidth = 0;
    for (const m of layoutedMeasures) {
      if (currentWidth + m.width > systemWidth && current.length > 0) {
        systemMeasures.push(current);
        current = [];
        currentWidth = 0;
      }
      current.push(m);
      currentWidth += m.width;
    }
    if (current.length > 0) systemMeasures.push(current);
  }

  // Step 4: Build systems with absolute x positions and barlines
  const systems = systemMeasures.map((measuresInSystem, systemIdx) => {
    let systemX = 0;
    const items = [];
    const barlines = [];
    let measureIdx = 0;

    for (const m of measuresInSystem) {
      for (const item of m.items) {
        items.push({
          ...item,
          x: systemX + item.x,
          cx: systemX + item.cx,
          measureIdx,
        });
      }
      barlines.push({ x: systemX + m.width - paddingRight, type: "single", measureIdx });
      systemX += m.width;
      measureIdx++;
    }

    // Final barline on the very last system
    if (barlines.length > 0 && systemIdx === systemMeasures.length - 1) {
      barlines[barlines.length - 1].type = "final";
    }

    return {
      items,
      barlines,
      beamGroups: [],
      tupletGroups: [],
      width: systemX,
      numMeasures: measuresInSystem.length,
    };
  });

  // Step 5: Justify systems — stretch measures to fill the row width evenly.
  // Only in page mode, and only for all systems except the last (ragged right
  // on the final line is standard engraving convention).
  if (systemWidth != null && systems.length > 0) {
    for (let si = 0; si < systems.length - 1; si++) {
      const system = systems[si];
      if (system.numMeasures === 0) continue;
      const extra = systemWidth - system.width;
      if (extra <= 0) continue;

      const extraPerMeasure = extra / system.numMeasures;
      for (const item of system.items) {
        item.x += item.measureIdx * extraPerMeasure;
        item.cx += item.measureIdx * extraPerMeasure;
      }
      for (const bl of system.barlines) {
        bl.x += (bl.measureIdx + 1) * extraPerMeasure;
      }
      system.width = systemWidth;
    }
  }

  // Step 6: Compute beam groups (with partial-beam annotations) and tuplet spans
  for (const system of systems) {
    system.beamGroups = computeBeamGroups(system.items, beatBoundaries);
    system.tupletGroups = computeTupletGroups(system.items, beatBoundaries);
  }

  const totalWidth = systems.length > 0 ? Math.max(...systems.map((s) => s.width)) : 320;
  return { systems, spm, beatGroups, totalWidth };
}

// Full-measure rest → single rest of measure duration; otherwise consolidate within beats
function finalizeMeasureNotes(entries, beatBoundaries) {
  if (entries.every((e) => e.note.is_rest)) {
    const totalDur = entries.reduce((s, e) => s + e.note.duration_16ths, 0);
    return [{
      note: { ...entries[0].note, duration_16ths: totalDur, nv: totalDur, tuplet: null, ornaments: [], sticking: null },
      index: entries[0].index,
      relGrid: 0,
    }];
  }
  return consolidateRests(entries, beatBoundaries);
}

// Beam groups: consecutive beammable notes (≤ eighth) within the same beat
// and same measure. Breaks at rests, longer notes, beat and measure boundaries.
// Each item is annotated with how many beams it carries (1 for an eighth, 4 for
// a 64th) and, for notes whose finer beams have no neighbour to join, which way
// the leftover stub should point.
function computeBeamGroups(items, beatBoundaries) {
  const groups = [];
  let current = [];
  let lastBeat = -1;
  let lastMeasure = -1;

  for (const item of items) {
    const { note, relGrid, measureIdx } = item;
    item.beams = note.is_rest ? 0 : flagCount(noteValue(note));
    const isBeammable = item.beams > 0;
    const beatNum = beatOf(relGrid, beatBoundaries);
    const sameBeat = beatNum === lastBeat && measureIdx === lastMeasure;

    if (isBeammable && (current.length === 0 || sameBeat)) {
      current.push(item);
      lastBeat = beatNum;
      lastMeasure = measureIdx;
    } else {
      if (current.length > 1) groups.push(current);
      current = isBeammable ? [item] : [];
      lastBeat = beatNum;
      lastMeasure = measureIdx;
    }
  }
  if (current.length > 1) groups.push(current);

  // Stub direction for partial beams: a note sitting on an even multiple of its
  // own value starts a subdivision, so its stub points forward; otherwise it
  // finishes one and points back.
  for (const group of groups) {
    for (const item of group) {
      const beatIdx = beatOf(item.relGrid, beatBoundaries);
      const offsetInBeat = item.relGrid - beatBoundaries[beatIdx];
      const steps = Math.round(offsetInBeat / noteValue(item.note));
      item.partialBeam = steps % 2 === 0 ? "right" : "left";
    }
  }

  return groups;
}

// Tuplet groups: runs of notes carrying the same tuplet ratio inside one beat.
// They drive the bracket and number drawn above the staff.
function computeTupletGroups(items, beatBoundaries) {
  const groups = [];
  let current = [];
  let key = null;

  const flush = () => {
    if (current.length > 1) groups.push({ items: current, tuplet: key.ratio, number: key.number });
    current = [];
    key = null;
  };

  for (const item of items) {
    const { note, relGrid, measureIdx } = item;
    const beatNum = beatOf(relGrid, beatBoundaries);
    if (!note.tuplet) {
      flush();
      continue;
    }
    const id = `${note.tuplet}:${beatNum}:${measureIdx}`;
    if (key && key.id !== id) flush();
    if (!key) key = { id, ratio: note.tuplet, number: parseInt(note.tuplet, 10) };
    current.push(item);
  }
  flush();

  return groups;
}

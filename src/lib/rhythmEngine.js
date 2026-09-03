// ─── Rhythm Transcription & Sticking Engine (Mark 5 — MDL Quantizer) ───
// Transcription is a search for the simplest notation that still explains the
// timing. Every beat is fitted against a library of subdivision grids — binary
// (quarter through 64th), triplet, and tuplets up to nine — and each candidate
// pays two costs: how far the strokes sit from its slots, and how complex the
// notation it implies is, measured in bits. The cheapest total wins.
//
// Three things make that work on real playing rather than on a click track:
//
//   Beat boundaries are not decided up front. A dynamic program over the whole
//   take chooses, jointly, which strokes belong to which beat and how each beat
//   is subdivided — so a downbeat played a little early lands on the downbeat.
//
//   The grid is aligned to the performance before it is read. The player's
//   tempo isn't the metronome's, it wanders as they go, and their strokes sit
//   systematically early or late; each is measured from the fit itself and
//   folded back in.
//
//   The take is evidence about itself. What a performance does once it usually
//   does again, so the subdivisions and patterns it has already used are cheap
//   and everything else pays — which is what stops one sloppy stroke from
//   inventing a lone 32nd in a bar of quarters, while leaving a take that
//   really is full of 32nds alone.
//
// Deterministic, on-device — no LLM, no API.

export const DURATIONS = [
  { label: "Whole", d16: 16, symbol: "𝅝" },
  { label: "Half", d16: 8, symbol: "𝅗𝅥" },
  { label: "Quarter", d16: 4, symbol: "♩" },
  { label: "Eighth", d16: 2, symbol: "♪" },
  { label: "16th", d16: 1, symbol: "𝅘𝅥𝅯" },
];

export const ORNAMENTS = [
  { id: "flam", label: "Flam", short: "ƒ" },
  { id: "drag", label: "Drag", short: "//" },
  { id: "diddle", label: "Diddle", short: "/" },
  { id: "roll", label: "Buzz Roll", short: "Z" },
  { id: "accent", label: "Accent", short: ">" },
  { id: "ghost", label: "Ghost", short: "()" },
  { id: "rimshot", label: "Rimshot", short: "◎" },
];

export function getOrnaments(note) {
  if (Array.isArray(note?.ornaments)) return note.ornaments.filter((o) => o && o !== "none");
  if (note?.ornament && note.ornament !== "none") return [note.ornament];
  return [];
}

export function hasOrnament(note, ornament) {
  return getOrnaments(note).includes(ornament);
}

export const DURATION_LABELS = {
  0.25: "64th", 0.5: "32nd", 0.75: "Dotted 32nd", 1: "16th", 1.5: "Dotted 16th",
  2: "Eighth", 3: "Dotted 8th", 4: "Quarter",
  6: "Dotted Quarter", 8: "Half", 12: "Dotted Half", 16: "Whole",
};

export function durationLabel(d16) {
  return DURATION_LABELS[d16] || `${Math.round(d16 * 100) / 100}×16th`;
}

// Dotted note values, expressed in sixteenths (visual note value, not grid span).
const DOTTED_VALUES = [0.75, 1.5, 3, 6, 12, 24];

export function isDotted(d16) {
  return DOTTED_VALUES.some((v) => Math.abs(v - d16) < 1e-6);
}

// The visual note value of a note — what notehead/flags/beams to draw. For a
// plain note this is its grid span; for a tuplet note it is the span scaled by
// the tuplet ratio (a triplet eighth spans 4/3 sixteenths but *looks* like an
// eighth). Falls back to the grid span for notation saved before Mark 5.
export function noteValue(note) {
  const nv = note?.nv;
  return typeof nv === "number" && nv > 0 ? nv : note?.duration_16ths ?? 0;
}

// ─── Beat group sizes in sixteenths (mirrors engraving.beatGroupPattern) ───
export function beatGroups(timeSignature) {
  const { numerator, denominator } = timeSignature;
  if (denominator === 8) {
    if (numerator === 6) return [6, 6];
    if (numerator === 9) return [6, 6, 6];
    if (numerator === 12) return [6, 6, 6, 6];
    if (numerator === 7) return [4, 4, 6];
    if (numerator === 5) return [4, 6];
    if (numerator === 3) return [6];
    if (numerator === 2) return [4];
  }
  const numBeats = Math.round(numerator * (4 / denominator));
  return Array(numBeats).fill(4);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tunables — the whole quantizer's behaviour lives in these numbers.
// ═══════════════════════════════════════════════════════════════════════════

// Timing tolerance: one "sigma" of expected human jitter. Errors are measured
// in sigmas and squared, so a tap a full sigma off a slot costs 1 unit.
const JITTER_FRACTION = 0.045; // of one beat
const JITTER_FLOOR_MS = 18;
const JITTER_CEIL_MS = 26;

const BITS_WEIGHT = 1.0;   // cost units per bit of notation complexity
const HUBER_K = 1.2;       // standard deviations before the error cost goes linear
const DEPTH_WEIGHT = 0.7;  // bits per unit of metric depth of an onset
const MIN_SLOT_MS = 30;    // fastest subdivision a human can actually strike
const MAX_TAPS_PER_BEAT = 16;
const CONTEXT_WEIGHT_BITS = 4.5; // bits charged for deviating from the take's own subdivisions
const FIGURE_WEIGHT_BITS = 5;    // bits charged for deviating from its own patterns
const CONTEXT_MIN_BEATS = 3;     // beats needed before that vocabulary means anything
const CONTEXT_PASSES = 3;        // context re-fits before the reading settles
const SYNCOPATION_BITS = 1;    // bits per stronger beat position skipped in silence
const EMPTY_BEAT_BITS = 0.6;     // bits for a beat of silence — pauses are real, but rare
const BEAT_WINDOW = 0.4;         // how far outside its beat a stroke may be claimed from
const REGULARITY_BITS = 0.6;    // bits refunded per stroke of an even run
const REGULARITY_CAP_BITS = 3.2;

// Tempo drift: a take is re-fitted at these tempo scales and the cheapest
// reading wins. Ordered so that "played it straight" is the default.
const TEMPO_SCALES = [1, 0.99, 1.01, 0.98, 1.02, 0.97, 1.03, 0.96, 1.04, 0.95, 1.05, 0.94, 1.06, 0.93, 1.07, 0.92, 1.08, 0.91, 1.09, 0.9, 1.1];
const TEMPO_FINE_STEPS = [0.005, 0.0025]; // refinement either side of the coarse winner
const TEMPO_SWITCH_MARGIN = 0.75; // cost units a rescaled reading must beat
const TEMPO_PROBE_TAPS = 200;     // taps the scale search reads before committing

// Phase: how far the whole take sits off the grid (latency, or a first stroke
// that landed early). Estimated from the median residual and corrected.
const PHASE_PASSES = 2;
const PHASE_MIN_MS = 1.5;

// Local drift: the same idea applied beat by beat, smoothed so it tracks a
// wandering tempo without chasing individual strokes.
const LOCAL_PASSES = 3;
const LOCAL_WINDOW = 2;      // beats either side that shape the drift curve
const LOCAL_MIN_BEATS = 6;
const LOCAL_MAX_SHIFT = 0.3; // of a beat
const LOCAL_MAX_SLOPE = 0.2; // change in correction from one beat to the next
const LOCAL_MIN_GAIN = 2;    // cost units a warp must earn — steady takes stay put

// Grace-note clustering: two strokes this close cannot be separate grid notes.
const GRACE_MAX_MS = 45;
const GRACE_BEAT_FRACTION = 1 / 12;
const GRACE_LOCAL_GAPS = 8;  // neighbouring intervals that say what the take is playing

// ─── Small math helpers ───
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Timing error, in cost units. Squared close in — where the spread really is
// gaussian — but linear past a couple of standard deviations, because human
// playing throws the occasional wild stroke and a squared cost lets one of them
// drag a whole beat onto a grid nobody played.
function timingCost(errMs, sigma) {
  const z = Math.abs(errMs) / sigma;
  return z <= HUBER_K ? z * z : HUBER_K * (2 * z - HUBER_K);
}

function gcd(a, b) {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

// Metric depth of slot s in an n-slot beat: 0 on the beat itself, rising as the
// position gets weaker — log2 of the denominator of s/n in lowest terms. The
// downbeat is free, the half-beat costs 1, the "e" and "a" cost 2, and so on,
// which is what keeps a stroke from being read as needlessly syncopated.
const depthCache = new Map();
function depthTable(n) {
  let t = depthCache.get(n);
  if (!t) {
    t = new Float64Array(n);
    for (let s = 0; s < n; s++) t[s] = Math.log2(n / gcd(s, n));
    depthCache.set(n, t);
  }
  return t;
}

// Syncopation cost, in the classic sense: a stroke that lands on a weak spot
// while stronger spots before it pass by in silence. Playing the "a" of a beat
// with nothing on the beat itself is a real thing, but it is rare enough that
// it should have to out-argue a stroke that simply landed early. Figures that
// fill in behind themselves — hertas, 16-8-16 — pay almost nothing here.
function syncopationBits(slots, depths) {
  let skipped = 0;
  let prev = -1;
  for (const s of slots) {
    const d = depths[s];
    for (let j = prev + 1; j < s; j++) if (depths[j] < d - 1e-9) skipped++;
    prev = s;
  }
  return skipped * SYNCOPATION_BITS;
}

// Evenly-spaced strokes that fill the beat are how a tuplet announces itself —
// seven equal notes read as a septuplet, not as seven scattered 32nds. Reward
// onset sets that form a complete arithmetic run.
function regularityBonus(slots, n) {
  const m = slots.length;
  if (m < 3) return 0;
  const d = slots[1] - slots[0];
  for (let i = 2; i < m; i++) if (slots[i] - slots[i - 1] !== d) return 0;
  if (slots[m - 1] + d !== n) return 0;
  return Math.min(REGULARITY_CAP_BITS, REGULARITY_BITS * m);
}

// ─── Grid vocabulary ───
// "Natural" divisions of a beat: its whole divisors plus every binary
// subdivision. For a 4-sixteenth (quarter) beat that's 1,2,4,8,16,32; for a
// 6-sixteenth (dotted-quarter) beat 1,2,3,6,12,24. Everything else is a tuplet.
function naturalSet(beatSize) {
  const s = new Set();
  for (let d = 1; d <= beatSize; d++) if (beatSize % d === 0) s.add(d);
  let n = beatSize;
  while (n <= 64) {
    s.add(n);
    n *= 2;
  }
  return s;
}

// A tuplet is notated against the largest natural division below it:
// 3:2, 5:4, 6:4, 7:4, 9:8 in simple time; 4:3, 5:3, 7:6, 9:6 in compound.
function tupletFor(n, naturals) {
  if (naturals.has(n)) return null;
  let normal = 1;
  for (const d of naturals) if (d < n && d > normal) normal = d;
  return [n, normal];
}

function familyPenalty(n, naturals) {
  if (naturals.has(n)) return 0;
  if (n % 3 === 0 && naturals.has(n / 3)) return 1.3; // triplet family
  if (n % 2 === 0 && naturals.has(n / 2)) return 2.0; // duplet / quadruplet
  return 2.7; // 5, 7, 11 …
}

const gridCache = new Map();
function candidateGrids(beatSize) {
  let grids = gridCache.get(beatSize);
  if (grids) return grids;

  const naturals = naturalSet(beatSize);
  const divisions =
    beatSize % 3 === 0
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16];

  grids = divisions.map((n) => ({
    n,
    tuplet: tupletFor(n, naturals),
    bits: Math.log2(n) + familyPenalty(n, naturals),
    depths: depthTable(n),
  }));
  grids.byN = new Map(grids.map((g) => [g.n, g]));
  gridCache.set(beatSize, grids);
  return grids;
}

// Five strokes on every second slot of a ten-slot grid *is* a quintuplet — the
// grid a reading actually uses is the one left after dividing out the common
// factor of its onsets. Scoring the reduced grid keeps needlessly fine grids
// from looking cheap.
function reduceGrid(grids, grid, slots) {
  let g = grid.n;
  for (const s of slots) {
    g = gcd(g, s);
    if (g === 1) return { grid, slots };
  }
  const reduced = grids.byN.get(grid.n / g);
  if (!reduced) return { grid, slots };
  return { grid: reduced, slots: slots.map((s) => s / g) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Beat fitting
// ═══════════════════════════════════════════════════════════════════════════

// Fit one beat's taps against every candidate grid and return the cheapest.
// Taps are assigned to slots by a monotone DP — order is preserved and no two
// taps share a slot, so a grid that is too coarse is simply infeasible rather
// than silently collapsing two strokes into one.
function fitBeat(positions, beatMs, beatSize, penalties, sigmaMs) {
  if (positions.length === 0) return { cost: 0, grid: null, slots: [], rmsMs: 0 };

  const m = positions.length;
  const sigma = sigmaMs ?? clamp(beatMs * JITTER_FRACTION, JITTER_FLOOR_MS, JITTER_CEIL_MS);
  const grids = candidateGrids(beatSize);
  let best = null;

  for (const grid of grids) {
    const n = grid.n;
    if (m > n) continue;
    if (n > 1 && beatMs / n < MIN_SLOT_MS) continue;

    const depths = grid.depths;
    // prev[s] = cheapest cost for taps 0..j with tap j on slot s
    const prev = new Float64Array(n);
    const cur = new Float64Array(n);
    const back = new Int16Array(m * n).fill(-1);

    for (let s = 0; s < n; s++) {
      const errMs = (positions[0] - s / n) * beatMs;
      prev[s] = timingCost(errMs, sigma) + BITS_WEIGHT * DEPTH_WEIGHT * depths[s];
    }

    for (let j = 1; j < m; j++) {
      let runMin = Infinity;
      let runArg = -1;
      for (let s = 0; s < n; s++) {
        if (s > 0 && prev[s - 1] < runMin) {
          runMin = prev[s - 1];
          runArg = s - 1;
        }
        if (runArg < 0) {
          cur[s] = Infinity;
          continue;
        }
        const errMs = (positions[j] - s / n) * beatMs;
        cur[s] = runMin + timingCost(errMs, sigma) + BITS_WEIGHT * DEPTH_WEIGHT * depths[s];
        back[j * n + s] = runArg;
      }
      prev.set(cur);
    }

    let endCost = Infinity;
    let endSlot = -1;
    for (let s = 0; s < n; s++) {
      if (prev[s] < endCost) {
        endCost = prev[s];
        endSlot = s;
      }
    }
    if (endSlot < 0) continue;

    // Walk the back-pointers out to the chosen slots, then score the reading
    // the notation will actually use — which may be a coarser grid than the one
    // that produced it.
    const raw = new Array(m);
    let s = endSlot;
    for (let j = m - 1; j >= 0; j--) {
      raw[j] = s;
      s = back[j * n + s];
    }
    const { grid: eff, slots } = reduceGrid(grids, grid, raw);

    let errCost = 0;
    let sqErr = 0;
    let depthBits = 0;
    for (let j = 0; j < m; j++) {
      const errMs = (positions[j] - raw[j] / n) * beatMs;
      errCost += timingCost(errMs, sigma);
      sqErr += errMs * errMs;
      depthBits += eff.depths[slots[j]];
    }
    const bits =
      eff.bits +
      penaltyFor(penalties, eff.n, slots) +
      DEPTH_WEIGHT * depthBits +
      syncopationBits(slots, eff.depths) -
      regularityBonus(slots, eff.n);
    const total = errCost + BITS_WEIGHT * bits;
    if (best && total >= best.cost) continue;

    best = { cost: total, grid: eff, slots, rmsMs: Math.sqrt(sqErr / m) };
  }

  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// Performance-level dynamic program
// ═══════════════════════════════════════════════════════════════════════════

// Choose, over the whole take, how taps split across beats and how each beat is
// subdivided. State = (beat index, taps consumed so far); an empty beat costs
// nothing (it becomes a rest), so genuine pauses are free but shifting the
// music off the grid is not.
function quantizePass(times, groups, sixteenthMs, penalties, sigmaMs) {
  const m = times.length;
  const beatsPerMeasure = groups.length;
  const lastTime = times[m - 1];

  const beatStart = [0];
  const beatMs = [];
  while (beatStart[beatStart.length - 1] <= lastTime + 1e-6 && beatMs.length < 4096) {
    const ms = groups[beatMs.length % beatsPerMeasure] * sixteenthMs;
    beatMs.push(ms);
    beatStart.push(beatStart[beatStart.length - 1] + ms);
  }
  // Spare beats so a trailing tap that drifted past the grid still lands
  for (let extra = 0; extra < 2; extra++) {
    const ms = groups[beatMs.length % beatsPerMeasure] * sixteenthMs;
    beatMs.push(ms);
    beatStart.push(beatStart[beatStart.length - 1] + ms);
  }
  const B = beatMs.length;

  const INF = Infinity;
  const dp = [];
  const choice = [];
  for (let b = 0; b <= B; b++) {
    dp.push(new Float64Array(m + 1).fill(INF));
    choice.push(new Array(m + 1).fill(null));
  }
  dp[0][0] = 0;

  for (let b = 0; b < B; b++) {
    const start = beatStart[b];
    const ms = beatMs[b];
    const size = groups[b % beatsPerMeasure];
    const end = start + ms;
    for (let i = 0; i <= m; i++) {
      const base = dp[b][i];
      if (base === INF) continue;
      // Leave this beat empty — it becomes a rest
      const emptyCost = base + BITS_WEIGHT * EMPTY_BEAT_BITS;
      if (dp[b + 1][i] > emptyCost) {
        dp[b + 1][i] = emptyCost;
        choice[b + 1][i] = { from: i, fit: null };
      }
      if (i < m && times[i] < start - ms * BEAT_WINDOW) continue; // taps stranded in the past
      for (let k = i + 1; k <= m && k - i <= MAX_TAPS_PER_BEAT; k++) {
        if (times[k - 1] > end + ms * BEAT_WINDOW) break;
        const positions = new Array(k - i);
        for (let j = i; j < k; j++) positions[j - i] = (times[j] - start) / ms;
        const fit = fitBeat(positions, ms, size, penalties, sigmaMs);
        if (!fit) break;
        const cost = base + fit.cost;
        if (cost < dp[b + 1][k]) {
          dp[b + 1][k] = cost;
          choice[b + 1][k] = { from: i, fit };
        }
      }
    }
  }

  // Cheapest complete reading. Empty beats are free, so ties go to the
  // shortest one — never to the first *feasible* one, which would happily
  // cram a following downbeat into the previous beat's last slot.
  let endBeat = -1;
  let bestCost = INF;
  for (let b = 1; b <= B; b++) {
    if (dp[b][m] < bestCost - 1e-9) {
      bestCost = dp[b][m];
      endBeat = b;
    }
  }
  if (endBeat < 0) return null;

  const beats = new Array(endBeat);
  let b = endBeat;
  let k = m;
  while (b > 0) {
    const c = choice[b][k];
    beats[b - 1] = {
      size: groups[(b - 1) % beatsPerMeasure],
      beatMs: beatMs[b - 1],
      beatStart: beatStart[b - 1],
      firstTap: c.from,
      lastTap: k,
      fit: c.fit,
    };
    k = c.from;
    b--;
  }

  return { beats, cost: dp[endBeat][m] };
}

// ═══════════════════════════════════════════════════════════════════════════
// Notation assembly
// ═══════════════════════════════════════════════════════════════════════════

// Legal single-notehead values, in sixteenths (largest first).
const LEGAL_NV = [16, 12, 8, 6, 4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];

// Break a span into legal note values — the first chunk carries the stroke,
// the rest become rests (a 5-sixteenth span is a quarter plus a 16th rest).
function splitLegal(nv) {
  const out = [];
  let rem = nv;
  let guard = 0;
  while (rem > 1e-6 && guard++ < 12) {
    const pick = LEGAL_NV.find((v) => v <= rem + 1e-6);
    if (!pick) {
      out.push(rem);
      break;
    }
    out.push(pick);
    rem -= pick;
  }
  return out;
}

// How far a note may run past its own onset before it must give way to a rest:
// never across a metrically stronger position than the one it started on. This
// is what turns a lone "e" into a 16th plus an eighth rest instead of a
// dotted eighth, while still letting a downbeat stroke fill the whole beat.
function tailExtent(startSlot, n, depths) {
  const d0 = depths[startSlot];
  let e = startSlot + 1;
  while (e < n && depths[e] > d0 + 1e-9) e++;
  return e;
}

function makeNote(dur16, nv, tuplet, tap, confidence) {
  const isRest = !tap;
  return {
    duration_16ths: dur16,
    nv,
    start_time: 0,
    is_rest: isRest,
    ornaments: isRest ? [] : tap.ornaments || [],
    sticking: null,
    confidence_score: confidence,
    velocity: isRest ? 0 : tap.velocity ?? 0.7,
    tuplet,
    drum: isRest ? 0 : tap.drum ?? 0,
  };
}

// Turn one fitted beat into notes and rests.
function buildBeat(beat, events) {
  const { size, beatMs, fit } = beat;

  if (!fit || fit.slots.length === 0) {
    return [makeNote(size, size, null, null, 1)];
  }

  const { grid, slots, rmsMs } = fit;
  const n = grid.n;
  const unit = size / n; // grid span of one slot, in sixteenths
  const depths = grid.depths;
  const confidence = clamp(Math.round((1 - rmsMs / (beatMs * 0.25)) * 100) / 100, 0.4, 0.88);

  // A tuplet grid only *reads* as a tuplet if the notes it produces can't be
  // written on the plain grid (three triplet slots carrying one stroke is just
  // a quarter note).
  const ends = slots.map((s, idx) =>
    idx < slots.length - 1 ? slots[idx + 1] : tailExtent(s, n, depths)
  );
  const isWhole = (x) => Math.abs(x - Math.round(x)) < 1e-6;
  const plain =
    !grid.tuplet ||
    (slots.every((s) => isWhole(s * unit)) &&
      ends.every((e, idx) => isWhole((e - slots[idx]) * unit)));
  const ratio = plain ? 1 : grid.tuplet[0] / grid.tuplet[1];
  const tupletStr = plain ? null : `${grid.tuplet[0]}:${grid.tuplet[1]}`;

  const out = [];
  const emit = (fromSlot, toSlot, tap) => {
    const span = (toSlot - fromSlot) * unit;
    const chunks = splitLegal(span * ratio);
    chunks.forEach((chunkNv, idx) => {
      out.push(makeNote(chunkNv / ratio, chunkNv, tupletStr, idx === 0 ? tap : null, confidence));
    });
  };

  // Leading silence, slot by slot (the engraver consolidates what it can)
  for (let s = 0; s < slots[0]; s++) emit(s, s + 1, null);

  for (let idx = 0; idx < slots.length; idx++) {
    emit(slots[idx], ends[idx], events[idx]);
    // Silence between this note's end and the next onset (or the beat's end)
    const nextOnset = idx < slots.length - 1 ? slots[idx + 1] : n;
    for (let s = ends[idx]; s < nextOnset; s++) emit(s, s + 1, null);
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Grace notes
// ═══════════════════════════════════════════════════════════════════════════

// Strokes closer together than a human can play as grid notes are ornaments,
// not subdivisions: one leading stroke is a flam, two are a drag. Collapsing
// them here keeps them from dragging the whole beat onto an absurd grid.
//
// A short gap on its own is not enough to call one, though. At 160bpm a
// sixteenth is 94ms, and two ordinary sixteenths that both jittered inward can
// land closer together than a flam — collapsing those eats a real note out of
// the bar, which is exactly what a run of sixteenths with a lone eighth in the
// middle of it is.
//
// What separates the two is what the collapse does to the run around it. A
// real ornament is stolen from the space in front of it: the grace stroke and
// the gap leading into it still add up to one subdivision, so merging them
// puts the local spacing back in order. Two jittered subdivisions don't —
// merging them leaves a hole where a note should be. So a cluster only
// collapses when doing so brings the spacing closer to what the take is
// actually playing, measured off its own neighbouring intervals.
function localSubdivision(gaps, index, limit) {
  const pool = [];
  for (let d = 1; d < gaps.length && pool.length < GRACE_LOCAL_GAPS; d++) {
    for (const j of [index - d, index + d]) {
      if (j >= 0 && j < gaps.length && gaps[j] >= limit) pool.push(gaps[j]);
    }
  }
  if (pool.length === 0) return null;
  pool.sort((a, b) => a - b);
  return pool[pool.length >> 1];
}

function collapseGraceNotes(taps, beatMs) {
  const limit = Math.min(GRACE_MAX_MS, beatMs * GRACE_BEAT_FRACTION);
  const gaps = [];
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i].timestamp - taps[i - 1].timestamp);

  const out = [];
  let cluster = [taps[0]];
  let clusterStart = 0;

  const flush = () => {
    const main = cluster[cluster.length - 1];
    const graces = cluster.length - 1;
    const ornaments = getOrnaments(main);
    if (graces === 1 && !ornaments.length) ornaments.push("flam");
    else if (graces >= 2 && !ornaments.length) ornaments.push("drag");
    out.push({
      timestamp: main.timestamp,
      velocity: main.velocity ?? 0.7,
      drum: main.drum ?? 0,
      ornaments,
    });
    cluster = [];
  };

  // Does folding taps[i] into the current cluster tidy the local spacing, or
  // punch a hole in it? With nothing before the cluster there's no run to
  // judge against, so a leading ornament is taken at its word.
  const tidiesTheRun = (i) => {
    if (clusterStart === 0) return true;
    const reference = localSubdivision(gaps, clusterStart - 1, limit);
    if (reference == null) return true;
    const previous = taps[clusterStart - 1].timestamp;
    const merged = Math.abs(taps[i].timestamp - previous - reference);
    const unmerged = Math.abs(taps[i - 1].timestamp - previous - reference);
    return merged < unmerged;
  };

  for (let i = 1; i < taps.length; i++) {
    const gap = taps[i].timestamp - cluster[cluster.length - 1].timestamp;
    if (gap < limit && cluster.length < 3 && tidiesTheRun(i)) {
      cluster.push(taps[i]);
    } else {
      flush();
      cluster = [taps[i]];
      clusterStart = i;
    }
  }
  if (cluster.length) flush();
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════════

export function transcribeTaps(taps, bpm, timeSignature, startTime = null) {
  if (!taps || taps.length === 0) return [];

  const groups = beatGroups(timeSignature);
  const measure16 = groups.reduce((a, b) => a + b, 0);
  const sixteenthMs = 60000 / bpm / 4;
  const firstBeatMs = groups[0] * sixteenthMs;

  const sorted = [...taps].sort((a, b) => a.timestamp - b.timestamp);
  const events = collapseGraceNotes(sorted, firstBeatMs);

  // The anchor is t=0 of the grid — under tap-to-start recording, the first
  // stroke itself, which is therefore the downbeat.
  const anchor = startTime != null ? Math.min(startTime, events[0].timestamp) : events[0].timestamp;
  const times = events.map((e) => e.timestamp - anchor);

  // ── Align the grid to the performance ──
  // Four things pull a take off the grid, and each is measured from the fit
  // itself and folded back in: the player's tempo isn't the metronome's, that
  // tempo wanders as they go, their strokes sit systematically early or late,
  // and the first stroke — the one the grid is pinned to — carries its own
  // error. Alignment runs before the priors below have anything to learn from,
  // because a reading of a misaligned take is not evidence about anything.
  let penalties = null;
  let result = quantizePass(times, groups, sixteenthMs, penalties);
  if (!result) return [];

  let aligned = times;
  const refit = (t) => quantizePass(t, groups, sixteenthMs, penalties);
  const accept = (t, candidate, margin = 0) => {
    if (!candidate || candidate.cost >= result.cost - margin) return false;
    aligned = t;
    result = candidate;
    return true;
  };

  // Tempo: try nearby tempi, coarse then fine, on an opening probe so long
  // takes stay linear. The notated tempo never changes — only the grid the
  // performance is read against.
  const alignTempo = () => {
    const probe = aligned.length > TEMPO_PROBE_TAPS ? aligned.slice(0, TEMPO_PROBE_TAPS) : aligned;
    const costAt = (scale) => {
      const candidate = refit(scale === 1 ? probe : probe.map((t) => t / scale));
      return candidate ? candidate.cost : Infinity;
    };
    let best = 1;
    let bestCost = costAt(1) - TEMPO_SWITCH_MARGIN;
    for (const scale of TEMPO_SCALES) {
      if (scale === 1) continue;
      const cost = costAt(scale);
      if (cost < bestCost) {
        bestCost = cost;
        best = scale;
      }
    }
    for (const step of TEMPO_FINE_STEPS) {
      for (const scale of [best - step, best + step]) {
        const cost = costAt(scale);
        if (cost < bestCost) {
          bestCost = cost;
          best = scale;
        }
      }
    }
    if (best === 1) return;
    const rescaled = aligned.map((t) => t / best);
    accept(rescaled, refit(rescaled));
  };

  // Phase: a take can sit tens of milliseconds off the grid — touch and audio
  // latency, or simply an imprecise first stroke, which would otherwise rotate
  // every later note the other way. The median residual is a robust estimate of
  // that shift, and one syncopated stroke can't move a median.
  const alignPhase = () => {
    for (let iter = 0; iter < PHASE_PASSES; iter++) {
      const shift = phaseResidual(aligned, result);
      if (Math.abs(shift) < PHASE_MIN_MS) return;
      const shifted = aligned.map((t) => t - shift);
      if (!accept(shifted, refit(shifted))) return;
    }
  };

  // Drift: the same idea beat by beat, smoothed into a slow curve.
  const alignDrift = () => {
    for (let iter = 0; iter < LOCAL_PASSES; iter++) {
      const warped = localWarp(aligned, result);
      if (!warped || !accept(warped, refit(warped), LOCAL_MIN_GAIN)) return;
    }
  };

  // What a take does once it usually does again. Once the grid is aligned, the
  // reading so far becomes evidence about itself: beats that deviate from the
  // take's own subdivisions and patterns pay for it, which is what stops a
  // single sloppy stroke from inventing a lone 32nd in a bar of quarters —
  // while a take that really is full of 32nds keeps them, because by then they
  // are the pattern.
  const settleContext = () => {
    for (let iter = 0; iter < CONTEXT_PASSES; iter++) {
      const next = contextPenalties(result);
      if (samePenalties(next, penalties)) return;
      penalties = next;
      const contextual = refit(aligned);
      if (!contextual) return;
      result = contextual;
    }
  };

  alignTempo();
  alignPhase();
  settleContext();
  alignDrift();
  settleContext();

  // ── Assemble ──
  const notation = [];
  for (const beat of result.beats) {
    notation.push(...buildBeat(beat, events.slice(beat.firstTap, beat.lastTap)));
  }

  let acc = 0;
  for (const note of notation) {
    note.start_time = acc / 4;
    acc += note.duration_16ths;
  }

  // Pad the final measure with beat-sized rests
  const totalMeasures = Math.max(1, Math.ceil(acc / measure16 - 1e-6));
  const target16 = totalMeasures * measure16;
  let beatIdx = groups.length;
  while (target16 - acc > 1e-6) {
    const chunk = Math.min(target16 - acc, groups[beatIdx % groups.length]);
    const rest = makeNote(chunk, chunk, null, null, 1);
    rest.start_time = acc / 4;
    notation.push(rest);
    acc += chunk;
    beatIdx++;
  }

  generateSticking(notation);
  return notation;
}

// What a take does once, it usually does again. Two priors come out of the
// reading so far: which subdivision grids it uses, and which onset patterns it
// plays on them. A beat that deviates from both pays for the privilege, which
// is what keeps a single sloppy stroke from inventing a lone 32nd in a bar of
// quarters — while a take that really is full of 32nds keeps them, because then
// they are the pattern.
function contextPenalties(result) {
  const grids = new Map();
  const figures = new Map();
  let total = 0;
  for (const beat of result.beats) {
    if (!beat.fit?.grid) continue;
    const n = beat.fit.grid.n;
    grids.set(n, (grids.get(n) || 0) + 1);
    const key = figureKey(n, beat.fit.slots);
    figures.set(key, (figures.get(key) || 0) + 1);
    total++;
  }
  if (total < CONTEXT_MIN_BEATS) return null;

  const scale = (map, weight) => {
    const out = new Map();
    for (const [k, count] of map) out.set(k, weight * (1 - count / total));
    return out;
  };
  return {
    grids: scale(grids, CONTEXT_WEIGHT_BITS),
    figures: scale(figures, FIGURE_WEIGHT_BITS),
    gridOther: CONTEXT_WEIGHT_BITS,
    figureOther: FIGURE_WEIGHT_BITS,
    total,
  };
}

// An onset pattern as one integer: the grid size plus a bitmask of its slots.
function figureKey(n, slots) {
  let mask = 0;
  for (const s of slots) mask |= 1 << s;
  return n * 65536 + mask;
}

function penaltyFor(penalties, n, slots) {
  if (!penalties) return 0;
  const grid = penalties.grids.get(n);
  const figure = penalties.figures.get(figureKey(n, slots));
  return (
    (grid === undefined ? penalties.gridOther : grid) +
    (figure === undefined ? penalties.figureOther : figure)
  );
}

function samePenalties(a, b) {
  if (!a || !b || a.grids.size !== b.grids.size || a.figures.size !== b.figures.size) return false;
  for (const [k, v] of a.grids) if (Math.abs((b.grids.get(k) ?? -1) - v) > 1e-9) return false;
  for (const [k, v] of a.figures) if (Math.abs((b.figures.get(k) ?? -1) - v) > 1e-9) return false;
  return true;
}

// A player's tempo wanders — a bar rushed here, a bar leaned on there. One
// global tempo can't follow that, so measure how far each beat's strokes sat
// from the grid, smooth those offsets into a slow curve, and bend the timeline
// by it. Smoothing is what keeps this honest: the curve can absorb drift over
// several beats but can never chase a single syncopated stroke onto the beat.
function localWarp(times, result) {
  const beats = result.beats;
  if (beats.length < LOCAL_MIN_BEATS) return null;

  const offsets = beats.map((beat) => {
    if (!beat.fit?.grid) return null;
    const { grid, slots } = beat.fit;
    const res = slots.map((s, j) => times[beat.firstTap + j] - (beat.beatStart + (s / grid.n) * beat.beatMs));
    res.sort((a, b) => a - b);
    return res[res.length >> 1];
  });
  if (offsets.every((o) => o === null)) return null;

  // Silent beats inherit the nearest measured offset
  let last = null;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] === null) offsets[i] = last;
    else last = offsets[i];
  }
  last = null;
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offsets[i] === null) offsets[i] = last;
    else last = offsets[i];
  }

  // Smooth into a drift curve, then hold it to a gentle slope so warping can
  // never squeeze or stretch a beat out of shape.
  const curve = offsets.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - LOCAL_WINDOW); j <= Math.min(offsets.length - 1, i + LOCAL_WINDOW); j++) {
      sum += offsets[j];
      n++;
    }
    return sum / n;
  });
  for (let i = 0; i < curve.length; i++) {
    const limit = beats[i].beatMs * LOCAL_MAX_SHIFT;
    curve[i] = clamp(curve[i], -limit, limit);
    if (i > 0) {
      const slope = beats[i].beatMs * LOCAL_MAX_SLOPE;
      curve[i] = clamp(curve[i], curve[i - 1] - slope, curve[i - 1] + slope);
    }
  }

  // Bend the timeline: correction is linear across each beat, so the warp stays
  // monotone and no stroke can overtake another.
  const warped = times.map((t) => {
    let b = 0;
    while (b < beats.length - 1 && t >= beats[b + 1].beatStart) b++;
    const within = clamp((t - beats[b].beatStart) / beats[b].beatMs, 0, 1);
    const next = curve[Math.min(curve.length - 1, b + 1)];
    return t - (curve[b] + (next - curve[b]) * within);
  });

  let moved = 0;
  for (let i = 0; i < times.length; i++) moved = Math.max(moved, Math.abs(warped[i] - times[i]));
  return moved < PHASE_MIN_MS ? null : warped;
}

// Median distance between the strokes and the grid slots they were read onto.
function phaseResidual(times, result) {
  const residuals = [];
  for (const beat of result.beats) {
    if (!beat.fit?.grid) continue;
    const { grid, slots } = beat.fit;
    for (let j = 0; j < slots.length; j++) {
      residuals.push(times[beat.firstTap + j] - (beat.beatStart + (slots[j] / grid.n) * beat.beatMs));
    }
  }
  if (residuals.length < 3) return 0;
  residuals.sort((x, y) => x - y);
  const mid = residuals.length >> 1;
  return residuals.length % 2 ? residuals[mid] : (residuals[mid - 1] + residuals[mid]) / 2;
}

// ─── Sticking Suggestion Engine ───
export function generateSticking(notation) {
  let lastStick = "L";
  for (const note of notation) {
    if (note.is_rest) {
      note.sticking = null;
      continue;
    }
    const ornaments = getOrnaments(note);
    if (ornaments.includes("roll")) {
      // Buzz rolls can be either hand — no sticking label.
      note.sticking = null;
    } else if (ornaments.includes("diddle")) {
      note.sticking = lastStick;
    } else {
      note.sticking = lastStick === "R" ? "L" : "R";
      lastStick = note.sticking;
    }
  }
  return notation;
}

// ─── Closest-Match Search ───
export function findClosestMatches(notation, patternLibrary) {
  if (!patternLibrary || patternLibrary.length === 0) return [];

  const tapFingerprint = notation
    .filter((n) => !n.is_rest)
    .map((n) => Math.round(n.duration_16ths));

  if (tapFingerprint.length === 0) return [];

  const matches = patternLibrary.map((pattern) => {
    const refFingerprint = (pattern.reference_pattern || [])
      .filter((n) => !n.is_rest)
      .map((n) => Math.round(n.duration_16ths));
    const score = compareFingerprints(tapFingerprint, refFingerprint);
    return {
      song_name: pattern.song_name,
      match_confidence: score,
      tags: pattern.tags || [],
    };
  });

  matches.sort((a, b) => b.match_confidence - a.match_confidence);
  return matches.slice(0, 5).filter((m) => m.match_confidence > 0.1);
}

function compareFingerprints(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  let matches = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++;
  }
  const lengthPenalty = minLen / maxLen;
  return Math.round((matches / maxLen) * lengthPenalty * 100) / 100;
}

// ─── Total duration helpers ───
export function totalSixteenths(notation) {
  return notation.reduce((sum, n) => sum + n.duration_16ths, 0);
}

export function totalBeats(notation) {
  return totalSixteenths(notation) / 4;
}

// ─── Build a clean notation array from a library pattern ───
// Used when a recorded rhythm closely matches a known pattern: we notate it
// from the database entry (clean, canonical) instead of the grid-fit guess.
export function buildNotationFromPattern(reference_pattern, timeSignature) {
  const { numerator, denominator } = timeSignature;
  const measure16 = Math.round(numerator * (4 / denominator) * 4);

  const notes = (reference_pattern || []).map((p) => ({
    duration_16ths: p.duration_16ths,
    nv: p.nv ?? p.duration_16ths,
    start_time: 0,
    is_rest: !!p.is_rest,
    ornaments:
      Array.isArray(p.ornaments) && p.ornaments.length
        ? p.ornaments
        : p.ornament && p.ornament !== "none"
        ? [p.ornament]
        : [],
    sticking: null,
    confidence_score: 0.88,
    velocity: p.is_rest ? 0 : 0.7,
    tuplet: null,
    drum: 0,
  }));

  let acc = 0;
  for (const note of notes) {
    note.start_time = acc / 4;
    acc += note.duration_16ths;
  }

  // Pad trailing rest to complete the final measure
  if (measure16 > 0 && acc % measure16 !== 0) {
    const target = Math.ceil(acc / measure16) * measure16;
    notes.push({
      duration_16ths: target - acc,
      nv: target - acc,
      start_time: acc / 4,
      is_rest: true,
      ornaments: [],
      sticking: null,
      confidence_score: 1,
      velocity: 0,
      tuplet: null,
      drum: 0,
    });
  }

  generateSticking(notes);
  return notes;
}

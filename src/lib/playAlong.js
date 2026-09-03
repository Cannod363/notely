// ─── Play-along scoring ───
//
// Given where the score says the strokes are and where you actually played
// them, work out how close you were. Everything in here is in milliseconds
// relative to the downbeat of the piece, so it doesn't care what tempo or
// playback speed the times came from.
//
// Matching is greedy nearest-first: build every tap/onset pairing that falls
// inside the tolerance window, sort by how far apart they are, and take them in
// that order, retiring both sides as they're used. It isn't the globally
// optimal assignment, but on monophonic rhythm it agrees with one in all but
// pathological cases, and it never produces the thing a naive left-to-right
// walk does — one early tap swallowing the wrong note and shifting the blame
// down the rest of the bar.

// Anything further out than the window is not a late note, it's a different
// note. Half a beat is the usual reading, clamped so extreme tempos stay sane.
export function toleranceWindowMs(bpm, speed = 1) {
  const beatMs = (60 / bpm / speed) * 1000;
  return Math.max(90, Math.min(260, beatMs * 0.5));
}

// The distance at which a stroke earns no timing credit at all. This is a much
// tighter number than the matching window on purpose: the window decides which
// note you were aiming at, but whether it sounded in time is a question about
// ears, not about tempo. Being 60 ms off is audibly late whether the piece is
// slow or fast, so the scale only drifts with tempo a little, and within
// bounds that stay musically honest at both ends.
export function timingReferenceMs(bpm, speed = 1) {
  const beatMs = (60 / bpm / speed) * 1000;
  return Math.max(45, Math.min(110, beatMs * 0.18));
}

// How a single stroke landed. The bands are the ones drummers already talk in:
// dead on, close enough, and audibly out.
export function judgeError(errorMs) {
  const abs = Math.abs(errorMs);
  if (abs <= 25) return "perfect";
  if (abs <= 60) return "good";
  return "loose";
}

export function gradeFor(score) {
  if (score >= 90) return { label: "locked in", tone: "great" };
  if (score >= 75) return { label: "tight", tone: "good" };
  if (score >= 60) return { label: "close", tone: "ok" };
  if (score >= 40) return { label: "loose", tone: "weak" };
  return { label: "off the grid", tone: "weak" };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * @param {number[]} expectedMs onsets from the score, in ms from the downbeat
 * @param {number[]} tapMs      strokes played, in ms from the same downbeat
 * @param {{windowMs?: number}} opts
 */
export function scorePlayAlong(expectedMs, tapMs, opts = {}) {
  const windowMs = opts.windowMs || 150;
  const referenceMs = opts.referenceMs || windowMs * 0.36;
  const expected = [...expectedMs].sort((a, b) => a - b);
  const taps = [...tapMs].sort((a, b) => a - b);

  const empty = {
    score: 0,
    grade: gradeFor(0),
    windowMs,
    referenceMs,
    expectedCount: expected.length,
    tapCount: taps.length,
    hits: 0,
    missed: expected.length,
    extra: taps.length,
    perfect: 0,
    good: 0,
    loose: 0,
    meanAbsErrorMs: 0,
    biasMs: 0,
    spreadMs: 0,
    noteAccuracy: 0,
    timingAccuracy: 0,
    matches: [],
  };
  if (expected.length === 0) return empty;
  if (taps.length === 0) return { ...empty, grade: gradeFor(0) };

  // Candidate pairings inside the window, nearest first.
  const pairs = [];
  for (let i = 0; i < expected.length; i++) {
    for (let j = 0; j < taps.length; j++) {
      const error = taps[j] - expected[i];
      if (Math.abs(error) <= windowMs) pairs.push({ i, j, error });
    }
  }
  pairs.sort((a, b) => Math.abs(a.error) - Math.abs(b.error));

  const takenExpected = new Array(expected.length).fill(false);
  const takenTap = new Array(taps.length).fill(false);
  const matches = expected.map((at) => ({ at, tapAt: null, errorMs: null, judgement: "missed" }));

  for (const pair of pairs) {
    if (takenExpected[pair.i] || takenTap[pair.j]) continue;
    takenExpected[pair.i] = true;
    takenTap[pair.j] = true;
    matches[pair.i] = {
      at: expected[pair.i],
      tapAt: taps[pair.j],
      errorMs: pair.error,
      judgement: judgeError(pair.error),
    };
  }

  const hitList = matches.filter((m) => m.tapAt !== null);
  const hits = hitList.length;
  const missed = expected.length - hits;
  const extra = taps.length - hits;
  const errors = hitList.map((m) => m.errorMs);
  const absErrors = errors.map(Math.abs);

  const biasMs = mean(errors);
  const meanAbsErrorMs = mean(absErrors);
  // How consistent you were, independent of whether you sat ahead or behind —
  // a player who is steadily 40 ms early is closer to right than one scattered.
  const spreadMs = hits > 1 ? Math.sqrt(mean(errors.map((e) => (e - biasMs) ** 2))) : 0;

  const noteAccuracy = hits / expected.length;
  const timingAccuracy = hits
    ? mean(absErrors.map((e) => Math.max(0, 1 - e / referenceMs)))
    : 0;
  // Strokes that matched nothing cost something, but can't sink the whole run
  // on their own — a stray double is a blemish, not a failure.
  const extraPenalty = Math.min(0.3, (extra / expected.length) * 0.5);
  // Playing the right notes is worth a floor of 30 even if every one of them
  // is out; the other 70 is how well they sat. Note accuracy multiplies rather
  // than adds, so half a piece played immaculately still tops out at half.
  const raw = noteAccuracy * (0.3 + 0.7 * timingAccuracy) - extraPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw * 100)));

  return {
    score,
    grade: gradeFor(score),
    windowMs,
    referenceMs,
    expectedCount: expected.length,
    tapCount: taps.length,
    hits,
    missed,
    extra,
    perfect: hitList.filter((m) => m.judgement === "perfect").length,
    good: hitList.filter((m) => m.judgement === "good").length,
    loose: hitList.filter((m) => m.judgement === "loose").length,
    meanAbsErrorMs,
    biasMs,
    spreadMs,
    noteAccuracy,
    timingAccuracy,
    matches,
  };
}

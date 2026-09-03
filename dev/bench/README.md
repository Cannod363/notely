# Rhythm engine benchmarks

Dev-only scripts for checking [`src/lib/rhythmEngine.js`](../../src/lib/rhythmEngine.js)
against synthetic taps. Not part of the shipped app — plain Node scripts, no
test framework, no build step. Run any of them with `node dev/bench/<file>.mjs`
from the project root, or via the `npm run bench:*` scripts below.

Whenever the quantizer's tunable constants or pipeline change, run these
before and after to see whether the change actually helped:

- **`npm run bench:smoke`** ([smoke-test.mjs](smoke-test.mjs)) — hand-picked
  patterns (quarters, tuplets 3–9, herta, mixed figures, tempo drift) played
  with light jitter. Fast; good for a quick "did I break something obvious"
  check. `PASS`/`FAIL` against an expected notation string, `·` where there's
  no fixed expectation (some readings are legitimately ambiguous).

- **`npm run bench:exotic`** ([exotic-bench.mjs](exotic-bench.mjs)) — the same
  pattern library swept across 5 tempi × 3 jitter levels, clean playing only
  (no latency/tempo-drift model). Reports an exact-match pass rate plus a full
  8-bar mixed-vocabulary take for a sanity read.

- **`npm run bench:core`** ([core-bench.mjs](core-bench.mjs)) — the one that
  matters most. Models what actually comes off a touchscreen: gaussian stroke
  jitter, random touch/audio latency, a player tempo that isn't exactly the
  metronome's, and slow wander within the take. Scores exact-match rate for
  the four core figures (quarter/eighth/16th/triplet) across tempo and jitter,
  and dumps sample misses so you can see *what* it got wrong, not just that it
  did.

- **[tuner.mjs](tuner.mjs)** — not a script to run directly; a shared library
  (`score`, `runGroup`, `GROUPS`, `summary`) used by `sweep.mjs`. Generates
  synthetic takes with the same noise model as `core-bench.mjs`, but scores a
  weighted mix of three figure groups: `core` (weight 3) — the four basics;
  `named` (weight 2) — the compound figures asked for by name (16-8-16,
  herta, dotted-8th+16th, ...); `exotic` (weight 1) — tuplets 5–9, 32nds,
  swing, syncopation. `load(overrides)` patches a constant in a scratch copy
  of `rhythmEngine.js` and imports it, so a sweep can try many values without
  touching the real file.

- **`npm run bench:sweep`** ([sweep.mjs](sweep.mjs)) — coordinate descent over
  the constants in `tuner.mjs`'s `AXES`/`current` objects. Tries each axis's
  candidate values with everything else held at the current best, keeps the
  winner, and moves to the next axis, for two rounds. Prints a scored table
  per axis and a final per-figure breakdown. Takes several minutes; the
  constants it lands on are suggestions; **hand-edit
  [rhythmEngine.js](../../src/lib/rhythmEngine.js) — this script never writes
  back to it.**

## Why exact-match, not partial credit

A rhythm transcription that gets 15 of 16 beats right but flips one quarter
note into a stray 32nd-and-rest is not "94% correct" to a drummer reading the
chart — it's wrong. All four benches score a whole take as pass/fail, not by
counting correct beats, because that's the bar the feature actually has to
clear.

## Known ceiling

As of the last tuning pass, `core-bench.mjs` reports roughly 91% exact-match
on the four core figures across 60–200bpm and three jitter levels (the
tightest and loosest are closer to 100%/60% respectively — see the per-tempo
breakdown in its output). `exotic-bench.mjs` sits at 198/225. Sixteenths and
triplets above ~160bpm with loose timing (σ≥26ms) are the main remaining weak
spot — the jitter at that point is a large fraction of the subdivision itself,
which is a genuinely hard signal to disambiguate, not obviously a tuning miss.

That number was 87% before the grace-note collapser learned to check its work
against the surrounding run (see `collapseGraceNotes`). Roughly six in ten
failures at the time were a real stroke being eaten as an ornament, which is
worth knowing if the figure ever moves again: classify *what* the misses are
before reaching for the constants. A quick way to do it is to compare the
onset count of the notation against the tap count — the two diverging means a
stroke was merged or invented, which is a different bug from a beat being
subdivided wrongly, and the two want opposite fixes.

## A blind spot worth knowing about

Every synthetic take in these benches repeats a single figure for its whole
length. That makes them silent on over-conservatism: a prior that says "do
what you already did" — `FIGURE_WEIGHT_BITS`, `CONTEXT_WEIGHT_BITS` — can be
raised a long way before any of these scripts complains, because a
self-repeating take is exactly the case such a prior gets right. The one
mixed-vocabulary read is the 8-bar take at the end of `exotic-bench.mjs`.
Check it by eye before trusting a gain that came from raising either.

If you change the noise model in `core-bench.mjs` or `tuner.mjs`, the absolute
numbers above will shift — they're only comparable to a run of the *same*
script, not across scripts (each uses its own RNG seed and noise assumptions).

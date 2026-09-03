// Faster coordinate descent: carries the current best score between axes.
import { score, summary, cleanup } from "./tuner.mjs";

const current = {
  JITTER_FRACTION: 0.055,
  JITTER_FLOOR_MS: 25,
  JITTER_CEIL_MS: 30,
  DEPTH_WEIGHT: 0.7,
  SYNCOPATION_BITS: 1,
  CONTEXT_WEIGHT_BITS: 4.5,
  FIGURE_WEIGHT_BITS: 2,
  REGULARITY_BITS: 0.6,
  EMPTY_BEAT_BITS: 0.6,
  BEAT_WINDOW: 0.4,
  LOCAL_PASSES: 3,
  LOCAL_WINDOW: 2,
  CONTEXT_PASSES: 3,
  PHASE_PASSES: 2,
};

const AXES = {
  CONTEXT_WEIGHT_BITS: [3, 6],
  FIGURE_WEIGHT_BITS: [1, 3],
  SYNCOPATION_BITS: [0.5, 1.5],
  DEPTH_WEIGHT: [0.5, 0.9],
  EMPTY_BEAT_BITS: [0.2, 1.2],
  JITTER_FLOOR_MS: [20, 30],
  JITTER_FRACTION: [0.045, 0.07],
  JITTER_CEIL_MS: [26, 36],
  REGULARITY_BITS: [0.4, 0.8],
  BEAT_WINDOW: [0.3, 0.5],
  LOCAL_WINDOW: [1, 3],
  LOCAL_PASSES: [2, 5],
  CONTEXT_PASSES: [2, 5],
};

let best = await score(current);
console.log("start:", summary(best));

for (const round of [1, 2]) {
  for (const [axis, values] of Object.entries(AXES)) {
    const row = [];
    let bestVal = current[axis];
    for (const v of values) {
      if (v === current[axis]) continue;
      const s = await score({ ...current, [axis]: v });
      row.push(`${v}:${(s.combined * 100).toFixed(1)}`);
      if (s.combined > best.combined) {
        best = s;
        bestVal = v;
      }
    }
    current[axis] = bestVal;
    console.log(`r${round} ${axis.padEnd(20)} ${row.join("  ")}  ->  ${bestVal}   (${summary(best)})`);
  }
}

console.log("\nbest config:", JSON.stringify(current));
const final = await score(current);
console.log("final:", summary(final));
for (const [g, figs] of Object.entries(final.detail)) {
  console.log(
    `  ${g}: ` +
      Object.entries(figs)
        .map(([k, v]) => `${k} ${((100 * v.pass) / v.total).toFixed(0)}%`)
        .join("  ")
  );
}
cleanup();

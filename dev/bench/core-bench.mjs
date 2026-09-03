// Realistic bench for the four core figures: quarter, eighth, 16th, triplet.
// Models what actually comes off a touchscreen: gaussian stroke jitter, a
// constant output/touch latency, a tempo that isn't exactly the metronome's,
// and slow wander over the take.
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.resolve(__dirname, "../../src/lib/rhythmEngine.js");
import { pathToFileURL } from "node:url";

const ENGINE = process.env.ENGINE || ENGINE_PATH;
const { transcribeTaps } = await import(pathToFileURL(ENGINE).href);

let seed = 20260824;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function gauss(sd) {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()) * sd;
}

const NV = { 0.25: "64", 0.5: "32", 0.75: "32.", 1: "16", 1.5: "16.", 2: "8", 3: "8.", 4: "q", 6: "q.", 8: "h", 12: "h.", 16: "w" };
const name = (nv) => NV[Math.round(nv * 1000) / 1000] || `?${nv.toFixed(2)}`;
const fmt = (n) =>
  n.map((x) => (x.is_rest ? "-" : "") + name(x.nv) + (x.tuplet ? `<${x.tuplet.split(":")[0]}>` : "")).join(" ");

const FIGURES = {
  quarters: { slots: [0], want: "q" },
  eighths: { slots: [0, 1 / 2], want: "8 8" },
  sixteenths: { slots: [0, 1 / 4, 2 / 4, 3 / 4], want: "16 16 16 16" },
  triplets: { slots: [0, 1 / 3, 2 / 3], want: "8<3> 8<3> 8<3>" },
};

const BPMS = [60, 80, 100, 120, 140, 160, 180, 200];
const SIGMAS = [10, 18, 26];
const TAKES = 12;
const BARS = 4;

function synth(figure, bpm, sigma) {
  const beatMs = 60000 / bpm;
  const latency = rnd() * 90;            // constant touch/output latency
  const tempoErr = 1 + (rnd() - 0.5) * 0.05; // player's tempo vs the click, ±2.5%
  let wander = 0;
  const taps = [];
  for (let b = 0; b < BARS * 4; b++) {
    wander += gauss(beatMs * 0.004); // slow drift within the take
    for (const s of figure.slots) {
      const ideal = (b + s) * beatMs * tempoErr + wander;
      taps.push({ timestamp: 100000 + latency + ideal + gauss(sigma), velocity: 0.7, drum: 0 });
    }
  }
  return taps;
}

const results = {};
let total = 0;
let good = 0;
const samples = [];

for (const [label, figure] of Object.entries(FIGURES)) {
  results[label] = {};
  for (const bpm of BPMS) {
    for (const sigma of SIGMAS) {
      let pass = 0;
      for (let t = 0; t < TAKES; t++) {
        const taps = synth(figure, bpm, sigma);
        const got = fmt(transcribeTaps(taps, bpm, { numerator: 4, denominator: 4 }, taps[0].timestamp));
        const want = Array(BARS * 4).fill(figure.want).join(" ");
        if (got === want) pass++;
        else if (samples.length < 8 && sigma <= 18) samples.push(`${label} @${bpm} σ${sigma}\n    ${got}`);
      }
      results[label][`${bpm}/${sigma}`] = pass;
      total += TAKES;
      good += pass;
    }
  }
}

const pct = (n, d) => `${((100 * n) / d).toFixed(0)}%`;
console.log(`\nexact-match rate: ${good}/${total} = ${pct(good, total)}\n`);
console.log("           " + SIGMAS.map((s) => `σ${s}`.padStart(5)).join("") + "   |  by tempo");
for (const [label, row] of Object.entries(results)) {
  const bySigma = SIGMAS.map((s) => {
    const n = BPMS.reduce((a, bpm) => a + row[`${bpm}/${s}`], 0);
    return pct(n, BPMS.length * TAKES).padStart(5);
  }).join("");
  const byTempo = BPMS.map((bpm) => {
    const n = SIGMAS.reduce((a, s) => a + row[`${bpm}/${s}`], 0);
    return `${bpm}:${pct(n, SIGMAS.length * TAKES)}`;
  }).join(" ");
  console.log(label.padEnd(11) + bySigma + "   |  " + byTempo);
}
if (samples.length) {
  console.log("\nsample misses (σ≤18):");
  for (const s of samples) console.log("  " + s);
}

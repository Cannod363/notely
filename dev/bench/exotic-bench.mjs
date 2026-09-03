// Robustness sweep: every pattern at several jitter levels and tempi.
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.resolve(__dirname, "../../src/lib/rhythmEngine.js");
import { pathToFileURL } from "node:url";
const { transcribeTaps } = await import(pathToFileURL(ENGINE_PATH).href);

let seed = 1;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const jitter = (ms) => (rnd() * 2 - 1) * ms;

const NV = { 0.25: "64", 0.5: "32", 0.75: "32.", 1: "16", 1.5: "16.", 2: "8", 3: "8.", 4: "q", 6: "q.", 8: "h", 12: "h.", 16: "w" };
const name = (nv) => NV[Math.round(nv * 1000) / 1000] || `?${nv.toFixed(2)}`;
const fmt = (n) =>
  n.map((x) => (x.is_rest ? "-" : "") + name(x.nv) + (x.tuplet ? `<${x.tuplet.split(":")[0]}>` : "")).join(" ");

// A pattern is a list of onset offsets within one beat, as fractions of the beat.
const PATTERNS = {
  quarter: { slots: [0], want: "q" },
  eighths: { slots: [0, 1 / 2], want: "8 8" },
  sixteenths: { slots: [0, 1 / 4, 2 / 4, 3 / 4], want: "16 16 16 16" },
  "32nds": { slots: [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8], want: "32 32 32 32 32 32 32 32" },
  triplet: { slots: [0, 1 / 3, 2 / 3], want: "8<3> 8<3> 8<3>" },
  quintuplet: { slots: [0, 0.2, 0.4, 0.6, 0.8], want: "16<5> 16<5> 16<5> 16<5> 16<5>" },
  sextuplet: { slots: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6], want: "16<6> 16<6> 16<6> 16<6> 16<6> 16<6>" },
  septuplet: { slots: [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7], want: Array(7).fill("16<7>").join(" ") },
  "16-8-16": { slots: [0, 1 / 4, 3 / 4], want: "16 8 16" },
  "8-16-16": { slots: [0, 2 / 4, 3 / 4], want: "8 16 16" },
  "dotted8-16": { slots: [0, 3 / 4], want: "8. 16" },
  herta: { slots: [0, 1 / 8, 2 / 8, 4 / 8], want: "32 32 16 8" },
  "16-16-8": { slots: [0, 1 / 4, 2 / 4], want: "16 16 8" },
  "e-and-a": { slots: [1 / 4, 2 / 4, 3 / 4], want: "-16 16 16 16" },
  swing: { slots: [0, 2 / 3], want: "q<3> 8<3>" },
};

const BPMS = [72, 100, 120, 160, 200];
const JITTERS = [8, 16, 24];

let pass = 0;
let fail = 0;
const failures = [];
let slowest = 0;

for (const [label, spec] of Object.entries(PATTERNS)) {
  for (const bpm of BPMS) {
    for (const jit of JITTERS) {
      const beatMs = 60000 / bpm;
      // Four beats of the same figure = one 4/4 bar
      const offsets = [];
      for (let b = 0; b < 4; b++) for (const s of spec.slots) offsets.push((b + s) * beatMs);
      const t0 = 50000;
      const taps = offsets.map((o, i) => ({
        timestamp: t0 + o + (i === 0 ? 0 : jitter(jit)),
        velocity: 0.7,
        drum: 0,
      }));
      const started = process.hrtime.bigint();
      const got = fmt(transcribeTaps(taps, bpm, { numerator: 4, denominator: 4 }, t0));
      slowest = Math.max(slowest, Number(process.hrtime.bigint() - started) / 1e6);
      const want = Array(4).fill(spec.want).join(" ");
      if (got === want) pass++;
      else {
        fail++;
        failures.push(`${label} @${bpm}bpm ±${jit}ms\n    got  ${got}\n    want ${want}`);
      }
    }
  }
}

console.log(`\npattern sweep: ${pass} pass / ${fail} fail  (slowest bar ${slowest.toFixed(0)}ms)\n`);
for (const f of failures) console.log("  " + f);

// ── Long take: 8 bars of mixed vocabulary, timed ────────────────────────────
const bpm = 120;
const beatMs = 60000 / bpm;
const FIGURES = [[0], [0, 1 / 2], [0, 1 / 4, 2 / 4, 3 / 4], [0, 1 / 3, 2 / 3], [0, 1 / 4, 3 / 4], [0, 1 / 8, 2 / 8, 4 / 8]];
const offsets = [];
for (let b = 0; b < 32; b++) {
  const fig = FIGURES[b % FIGURES.length];
  for (const s of fig) offsets.push((b + s) * beatMs);
}
const t0 = 10000;
const taps = offsets.map((o, i) => ({ timestamp: t0 + o + (i === 0 ? 0 : jitter(14)), velocity: 0.7, drum: 0 }));
const t1 = process.hrtime.bigint();
const notation = transcribeTaps(taps, bpm, { numerator: 4, denominator: 4 }, t0);
const ms = Number(process.hrtime.bigint() - t1) / 1e6;
console.log(`\n8-bar mixed take: ${taps.length} taps -> ${notation.length} notes in ${ms.toFixed(0)}ms`);
console.log("  " + fmt(notation));

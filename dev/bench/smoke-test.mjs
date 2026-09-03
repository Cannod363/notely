// Synthetic-performance test bench for the Mark 5 quantizer.
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.resolve(__dirname, "../../src/lib/rhythmEngine.js");
import { pathToFileURL } from "node:url";

const { transcribeTaps } = await import(pathToFileURL(ENGINE_PATH).href);

// Deterministic jitter
let seed = 12345;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const jitter = (ms) => (rnd() * 2 - 1) * ms;

const NV_NAME = {
  0.25: "64", 0.5: "32", 0.75: "32.", 1: "16", 1.5: "16.",
  2: "8", 3: "8.", 4: "q", 6: "q.", 8: "h", 12: "h.", 16: "w",
};
const name = (nv) => NV_NAME[Math.round(nv * 1000) / 1000] || `?${Math.round(nv * 100) / 100}`;

function fmt(notation) {
  return notation
    .map((n) => {
      const base = name(n.nv);
      const t = n.tuplet ? `<${n.tuplet.split(":")[0]}>` : "";
      const orn = (n.ornaments || []).length ? `(${n.ornaments.join(",")})` : "";
      return (n.is_rest ? "-" : "") + base + t + orn;
    })
    .join(" ");
}

function run(label, offsets, { bpm = 120, ts = { numerator: 4, denominator: 4 }, jit = 14, expect } = {}) {
  const t0 = 100000;
  const taps = offsets.map((o) => ({
    timestamp: t0 + o + (o === 0 ? 0 : jitter(jit)),
    velocity: 0.7,
    drum: 0,
  }));
  const started = process.hrtime.bigint();
  const notation = transcribeTaps(taps, bpm, ts, t0);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const got = fmt(notation);
  const total = notation.reduce((s, n) => s + n.duration_16ths, 0);
  const ok = expect == null ? null : got === expect;
  const mark = ok == null ? "·" : ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${label}  [${total.toFixed(2)}/16, ${ms.toFixed(0)}ms]`);
  console.log(`      ${got}`);
  if (ok === false) console.log(`      want: ${expect}`);
  return got;
}

const beat = (bpm) => 60000 / bpm;

// ── Straight values ─────────────────────────────────────────────────────────
const B = beat(120);
run("quarters", [0, B, 2 * B, 3 * B], { expect: "q q q q" });
run("eighths", Array.from({ length: 8 }, (_, i) => (i * B) / 2), {
  expect: "8 8 8 8 8 8 8 8",
});
run("16ths", Array.from({ length: 16 }, (_, i) => (i * B) / 4), {
  expect: Array(16).fill("16").join(" "),
});
run("32nds (one beat) + 3 quarters", [0, B / 8, B / 4, (3 * B) / 8, B / 2, (5 * B) / 8, (3 * B) / 4, (7 * B) / 8, B, 2 * B, 3 * B], {
  jit: 8,
});
run("64ths at 60bpm (one beat)", Array.from({ length: 16 }, (_, i) => (i * beat(60)) / 16).concat([beat(60), 2 * beat(60), 3 * beat(60)]), {
  bpm: 60,
  jit: 6,
});

// ── Tuplets ─────────────────────────────────────────────────────────────────
for (const n of [3, 5, 6, 7, 9]) {
  const offsets = [];
  for (let b = 0; b < 2; b++) for (let i = 0; i < n; i++) offsets.push(b * B + (i * B) / n);
  offsets.push(2 * B, 3 * B);
  run(`${n}-tuplets (2 beats)`, offsets, { jit: n >= 7 ? 8 : 12 });
}
run("duplets in 6/8", [0, 375, 750, 1125], {
  bpm: 120,
  ts: { numerator: 6, denominator: 8 },
  jit: 10,
});
run("compound 6/8 straight eighths", [0, 250, 500, 750, 1000, 1250], {
  ts: { numerator: 6, denominator: 8 },
});

// ── Mixed / complex ─────────────────────────────────────────────────────────
run("16-8-16 on every beat", [0, 125, 375, 500, 625, 875, 1000, 1125, 1375, 1500, 1625, 1875], {
  expect: Array(4).fill("16 8 16").join(" "),
});
run("dotted 8th + 16th", [0, 375, 500, 875, 1000, 1375, 1500, 1875], {
  expect: Array(4).fill("8. 16").join(" "),
});
run("herta (32-32-16-8) then quarters", [0, 62.5, 125, 250, 500, 1000, 1500], { jit: 8 });
run("lone 'e' of beat 1", [125, 500, 1000, 1500], { jit: 8 });
run("syncopated: 1 e + a", [0, 125, 250, 375, 500, 1000, 1500], { jit: 10 });
run("swung eighths", [0, 333, 500, 833, 1000, 1333, 1500, 1833], { jit: 10 });
run("gallop 8-16-16", [0, 250, 375, 500, 750, 875, 1000, 1250, 1375, 1500, 1750, 1875], {
  expect: Array(4).fill("8 16 16").join(" "),
});
run("triplet run then 16ths", [
  0, 166.7, 333.3, 500, 666.7, 833.3,
  1000, 1125, 1250, 1375, 1500, 1625, 1750, 1875,
], { jit: 10 });
run("flam then quarters", [0, 25, 500, 1000, 1500], { jit: 6 });
run("drag then quarters", [0, 22, 44, 500, 1000, 1500], { jit: 5 });
run("rest on beat 2", [0, 1000, 1500], { expect: "q -q q q" });
run("pickup pause: 2 bars", [0, 500, 1000, 1500, 2000, 3000, 3500], { jit: 10 });

// ── Tempo drift ─────────────────────────────────────────────────────────────
run("eighths 3% fast", Array.from({ length: 16 }, (_, i) => (i * B) / 2 * 0.97), { jit: 10 });
run("16ths at 200bpm", Array.from({ length: 16 }, (_, i) => (i * beat(200)) / 4), { bpm: 200, jit: 8 });
run("16ths at 60bpm", Array.from({ length: 16 }, (_, i) => (i * beat(60)) / 4), { bpm: 60, jit: 18 });

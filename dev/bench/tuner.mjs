// Quantizer tuner. Three figure groups, weighted by how much the app cares:
//   core   (3x) — quarter, eighth, 16th, triplet
//   named  (2x) — the compound figures asked for by name
//   exotic (1x) — everything else the engine can express
// Every take carries realistic noise: gaussian stroke jitter, constant latency,
// a tempo that isn't the metronome's, and slow wander.
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../../src/lib/rhythmEngine.js");
const base = fs.readFileSync(SRC, "utf8");
let variantId = 0;

export async function load(overrides) {
  let code = base;
  for (const [key, val] of Object.entries(overrides)) {
    const re = new RegExp(`(const ${key} = )[^;]+;`);
    if (!re.test(code)) throw new Error(`no constant ${key}`);
    code = code.replace(re, `$1${val};`);
  }
  const file = `./_tv${process.pid}_${variantId++}.mjs`;
  fs.writeFileSync(file, code);
  return import(pathToFileURL(fs.realpathSync(file)).href);
}

const NV = { 0.25: "64", 0.5: "32", 0.75: "32.", 1: "16", 1.5: "16.", 2: "8", 3: "8.", 4: "q", 6: "q.", 8: "h", 12: "h.", 16: "w" };
const name = (nv) => NV[Math.round(nv * 1000) / 1000] || `?${nv.toFixed(2)}`;
export const fmt = (n) =>
  n.map((x) => (x.is_rest ? "-" : "") + name(x.nv) + (x.tuplet ? `<${x.tuplet.split(":")[0]}>` : "")).join(" ");

export const GROUPS = {
  core: {
    weight: 3,
    bpms: [60, 100, 140, 200],
    sigmas: [10, 18, 26],
    takes: 5,
    figures: {
      quarters: { slots: [0], want: "q" },
      eighths: { slots: [0, 1 / 2], want: "8 8" },
      sixteenths: { slots: [0, 1 / 4, 2 / 4, 3 / 4], want: "16 16 16 16" },
      triplets: { slots: [0, 1 / 3, 2 / 3], want: "8<3> 8<3> 8<3>" },
    },
  },
  named: {
    weight: 2,
    bpms: [80, 120, 170],
    sigmas: [10, 20],
    takes: 4,
    figures: {
      "16-8-16": { slots: [0, 1 / 4, 3 / 4], want: "16 8 16" },
      "8-16-16": { slots: [0, 2 / 4, 3 / 4], want: "8 16 16" },
      "16-16-8": { slots: [0, 1 / 4, 2 / 4], want: "16 16 8" },
      "dotted8-16": { slots: [0, 3 / 4], want: "8. 16" },
      herta: { slots: [0, 1 / 8, 2 / 8, 4 / 8], want: "32 32 16 8" },
    },
  },
  exotic: {
    weight: 1,
    bpms: [80, 120, 160],
    sigmas: [8, 16],
    takes: 3,
    figures: {
      "32nds": { slots: [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8], want: Array(8).fill("32").join(" ") },
      quintuplet: { slots: [0, 0.2, 0.4, 0.6, 0.8], want: Array(5).fill("16<5>").join(" ") },
      sextuplet: { slots: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6], want: Array(6).fill("16<6>").join(" ") },
      septuplet: { slots: [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7], want: Array(7).fill("16<7>").join(" ") },
      swing: { slots: [0, 2 / 3], want: "q<3> 8<3>" },
      "e-and-a": { slots: [1 / 4, 2 / 4, 3 / 4], want: "-16 16 16 16" },
    },
  },
};

const BARS = 4;

function makeRng(s0) {
  let seed = s0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const gauss = (sd) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd()) * sd;
  return { rnd, gauss };
}

export function runGroup(transcribeTaps, group, seed0, collect) {
  const { rnd, gauss } = makeRng(seed0);
  const perFigure = {};
  let pass = 0;
  let total = 0;
  for (const [label, figure] of Object.entries(group.figures)) {
    perFigure[label] = { pass: 0, total: 0 };
    for (const bpm of group.bpms) {
      for (const sigma of group.sigmas) {
        for (let t = 0; t < group.takes; t++) {
          const beatMs = 60000 / bpm;
          const latency = rnd() * 90;
          // Half the takes are played to a click, half unaccompanied — the
          // second kind drifts off the set tempo and wanders as it goes.
          const free = t % 2 === 1;
          const tempoErr = 1 + (rnd() - 0.5) * (free ? 0.14 : 0.05);
          const wanderStep = beatMs * (free ? 0.02 : 0.004);
          let wander = 0;
          const taps = [];
          for (let b = 0; b < BARS * 4; b++) {
            wander += gauss(wanderStep);
            for (const s of figure.slots) {
              taps.push({ timestamp: 100000 + latency + (b + s) * beatMs * tempoErr + wander + gauss(sigma), velocity: 0.7, drum: 0 });
            }
          }
          const got = fmt(transcribeTaps(taps, bpm, { numerator: 4, denominator: 4 }, taps[0].timestamp));
          const ok = got === Array(BARS * 4).fill(figure.want).join(" ");
          if (ok) {
            pass++;
            perFigure[label].pass++;
          } else if (collect) collect(`${label} @${bpm} σ${sigma}: ${got}`);
          total++;
          perFigure[label].total++;
        }
      }
    }
  }
  return { pass, total, perFigure };
}

export async function score(overrides, collect) {
  const mod = await load(overrides);
  const out = { detail: {} };
  let weighted = 0;
  let weights = 0;
  let seed = Number(process.env.BENCH_SEED || 987654321);
  for (const [gname, group] of Object.entries(GROUPS)) {
    const r = runGroup(mod.transcribeTaps, group, seed, collect);
    seed += 13371337;
    out[gname] = r.pass / r.total;
    out.detail[gname] = r.perFigure;
    weighted += group.weight * (r.pass / r.total);
    weights += group.weight;
  }
  out.combined = weighted / weights;
  return out;
}

export function cleanup() {
  for (const f of fs.readdirSync(".")) if (f.startsWith(`_tv${process.pid}_`)) fs.unlinkSync(f);
}

export const summary = (s) =>
  `core ${(s.core * 100).toFixed(0)}%  named ${(s.named * 100).toFixed(0)}%  exotic ${(s.exotic * 100).toFixed(0)}%  →  ${(s.combined * 100).toFixed(1)}%`;

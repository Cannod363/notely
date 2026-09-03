// ─── MusicXML Import ───
// Reads a MusicXML file — plain `.xml`/`.musicxml` or zipped `.mxl` — into a
// score the app can draw and play. The counterpart to musicxml.js, which
// writes the format out.
//
// The parse keeps two views of the music, because the two things we do with it
// want different shapes:
//
//   events — every note in the part, flattened onto one timeline in sixteenths.
//            Voices and staves are all in here together, which is what playback
//            wants: it just needs to know what sounds when.
//
//   staves — the same notes grouped by staff and voice into chords, rests and
//            measures. That is what the engraver walks to draw a line of music.
//
// Anything the format allows but this app has no use for (lyrics, harmony
// symbols, layout hints) is skipped rather than half-supported.

// ─── Pitch helpers ───

// Diatonic step number: counts letter names, ignoring accidentals, so that
// staff position falls out as simple arithmetic. C0 = 0, D0 = 1 … B0 = 6.
const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const STEP_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function diatonicOf(step, octave) {
  return octave * 7 + (STEP_INDEX[step] ?? 0);
}

export function midiOf(step, octave, alter = 0) {
  return (octave + 1) * 12 + (STEP_SEMITONE[step] ?? 0) + alter;
}

// Where the middle line of the staff sits, as a diatonic number. A clef pins
// one pitch to one line; every other position follows from there, two diatonic
// steps per line.
const CLEF_PITCH = {
  G: { step: "G", octave: 4, defaultLine: 2 },
  F: { step: "F", octave: 3, defaultLine: 4 },
  C: { step: "C", octave: 4, defaultLine: 3 },
};

export function middleLineDiatonic(clef) {
  const sign = (clef?.sign || "G").toUpperCase();
  if (sign === "PERCUSSION" || sign === "TAB" || sign === "NONE") return null;
  const base = CLEF_PITCH[sign] || CLEF_PITCH.G;
  const line = clef?.line ?? base.defaultLine;
  const octaveShift = clef?.octaveChange || 0;
  return diatonicOf(base.step, base.octave + octaveShift) + (3 - line) * 2;
}

// ─── Note values ───

// MusicXML <type> → the app's note value, in sixteenths.
const TYPE_TO_NV = {
  breve: 32,
  whole: 16,
  half: 8,
  quarter: 4,
  eighth: 2,
  "16th": 1,
  "32nd": 0.5,
  "64th": 0.25,
  "128th": 0.125,
};

function nvFromType(type, dots) {
  const base = TYPE_TO_NV[type];
  if (!base) return null;
  // Each dot adds half of what came before it.
  let value = base;
  let add = base;
  for (let i = 0; i < dots; i++) {
    add /= 2;
    value += add;
  }
  return value;
}

// ─── XML helpers ───

const text = (parent, tag) => parent?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? null;
const num = (parent, tag) => {
  const raw = text(parent, tag);
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
// Direct children only — <note> inside <measure> must not reach into nested tags.
const childrenNamed = (parent, tag) =>
  Array.from(parent.children).filter((c) => c.tagName === tag);

// ─── Container formats ───

// `.mxl` is a zip. Rather than pull in a zip library for one file type, walk
// the central directory by hand and hand the compressed bytes to the platform's
// own inflater.
async function unzipMusicXML(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // The end-of-central-directory record lives in the last 64KB, after a
  // variable-length comment, so scan backwards for its signature.
  let eocd = -1;
  const scanFrom = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= scanFrom; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That .mxl file isn't a readable zip archive.");

  const entryCount = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);

  const entries = [];
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  const read = async (entry) => {
    // The local header repeats the name and extra fields at their own lengths.
    const localNameLength = view.getUint16(entry.localOffset + 26, true);
    const localExtraLength = view.getUint16(entry.localOffset + 28, true);
    const start = entry.localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return new TextDecoder().decode(raw);
    if (entry.method !== 8) throw new Error("This .mxl uses an unsupported compression method.");
    if (typeof DecompressionStream !== "function") {
      throw new Error(
        "This browser can't unzip .mxl files. Re-export the score as uncompressed .musicxml and try again."
      );
    }
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).text();
  };

  // META-INF/container.xml names the real score; fall back to the first score
  // file if the archive is missing it.
  const container = entries.find((e) => e.name === "META-INF/container.xml");
  if (container) {
    const doc = new DOMParser().parseFromString(await read(container), "application/xml");
    const path = doc.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
    const root = path && entries.find((e) => e.name === path);
    if (root) return read(root);
  }
  const fallback = entries.find(
    (e) => !e.name.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(e.name)
  );
  if (!fallback) throw new Error("No score found inside that .mxl file.");
  return read(fallback);
}

// ─── Entry point ───

export async function readMusicXMLFile(file) {
  const isZip = /\.mxl$/i.test(file.name);
  const xml = isZip ? await unzipMusicXML(await file.arrayBuffer()) : await file.text();
  return parseMusicXML(xml, file.name);
}

export function parseMusicXML(xml, fileName = "") {
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) throw new Error("That file isn't valid XML.");

  const partwise = doc.getElementsByTagName("score-partwise")[0];
  if (!partwise) {
    if (doc.getElementsByTagName("score-timewise")[0]) {
      throw new Error(
        "This is a timewise MusicXML file. Re-export it as partwise — nearly every notation app does that by default."
      );
    }
    throw new Error("That doesn't look like a MusicXML score.");
  }

  const work = doc.getElementsByTagName("work")[0];
  const title =
    text(work, "work-title") ||
    text(doc.getElementsByTagName("movement-title")[0]?.parentNode, "movement-title") ||
    fileName.replace(/\.(musicxml|xml|mxl)$/i, "") ||
    "Untitled score";

  let composer = null;
  for (const creator of Array.from(doc.getElementsByTagName("creator"))) {
    if ((creator.getAttribute("type") || "").toLowerCase() === "composer") {
      composer = creator.textContent.trim();
      break;
    }
  }

  // Part names come from the header; the music itself comes from <part>.
  const partNames = new Map();
  for (const scorePart of Array.from(doc.getElementsByTagName("score-part"))) {
    const id = scorePart.getAttribute("id");
    if (id) partNames.set(id, text(scorePart, "part-name") || id);
  }

  const parts = [];
  let tempo = null;

  for (const partEl of childrenNamed(partwise, "part")) {
    const part = parsePart(partEl, partNames.get(partEl.getAttribute("id")));
    if (part.tempo && !tempo) tempo = part.tempo;
    if (part.events.length > 0) parts.push(part);
  }

  if (parts.length === 0) throw new Error("That score has no playable notes in it.");

  return {
    title,
    composer,
    tempo: Math.round(tempo || 100),
    parts,
  };
}

// ─── One part ───

function parsePart(partEl, name) {
  let divisions = 1; // duration units per quarter note
  let keyFifths = 0;
  let timeSignature = { numerator: 4, denominator: 4 };
  let staffCount = 1;
  let tempo = null;
  const clefs = new Map(); // staff number → clef

  const events = [];
  const measures = [];
  let measureStart16 = 0; // where the current measure begins, in sixteenths

  for (const measureEl of childrenNamed(partEl, "measure")) {
    let cursor16 = measureStart16; // running position within the measure
    let furthest16 = measureStart16;
    let lastOnset16 = measureStart16; // where a <chord> note attaches
    const measureNumber = measureEl.getAttribute("number");

    for (const el of Array.from(measureEl.children)) {
      if (el.tagName === "attributes") {
        divisions = num(el, "divisions") ?? divisions;
        staffCount = num(el, "staves") ?? staffCount;
        const fifths = num(el, "fifths");
        if (fifths !== null) keyFifths = fifths;
        const beats = num(el, "beats");
        const beatType = num(el, "beat-type");
        if (beats && beatType) timeSignature = { numerator: beats, denominator: beatType };
        for (const clefEl of childrenNamed(el, "clef")) {
          const staff = Number(clefEl.getAttribute("number") || 1);
          clefs.set(staff, {
            sign: text(clefEl, "sign") || "G",
            line: num(clefEl, "line"),
            octaveChange: num(clefEl, "clef-octave-change") || 0,
          });
        }
        continue;
      }

      if (el.tagName === "direction") {
        const sound = el.getElementsByTagName("sound")[0];
        const perMinute = num(el.getElementsByTagName("metronome")[0], "per-minute");
        const soundTempo = sound?.getAttribute("tempo");
        if (!tempo && soundTempo) tempo = Number(soundTempo);
        else if (!tempo && perMinute) tempo = perMinute;
        continue;
      }

      if (el.tagName === "sound" && !tempo && el.getAttribute("tempo")) {
        tempo = Number(el.getAttribute("tempo"));
        continue;
      }

      // backup/forward move the cursor without sounding anything — this is how
      // MusicXML writes a second voice or a left hand.
      if (el.tagName === "backup") {
        cursor16 -= ((num(el, "duration") || 0) / divisions) * 4;
        continue;
      }
      if (el.tagName === "forward") {
        cursor16 += ((num(el, "duration") || 0) / divisions) * 4;
        furthest16 = Math.max(furthest16, cursor16);
        continue;
      }

      if (el.tagName !== "note") continue;

      const isChordNote = el.getElementsByTagName("chord").length > 0;
      const isGrace = el.getElementsByTagName("grace").length > 0;
      const durationDivisions = num(el, "duration") || 0;
      let dur16 = (durationDivisions / divisions) * 4;

      const restEl = el.getElementsByTagName("rest")[0];
      const isRest = !!restEl;
      const dots = el.getElementsByTagName("dot").length;
      const type = text(el, "type");

      // Tuplets compress the printed value; keep both so the engraver can draw
      // an eighth while the clock advances by two thirds of one.
      const timeMod = el.getElementsByTagName("time-modification")[0];
      const actual = num(timeMod, "actual-notes");
      const normal = num(timeMod, "normal-notes");
      const tuplet = actual && normal && actual !== normal ? `${actual}:${normal}` : null;

      let nv = nvFromType(type, dots);
      if (nv === null) nv = tuplet ? dur16 * (actual / normal) : dur16;

      // A grace note steals no time from the bar.
      if (isGrace) dur16 = 0;

      const onset16 = isChordNote ? lastOnset16 : cursor16;

      const pitchEl = el.getElementsByTagName("pitch")[0];
      const unpitchedEl = el.getElementsByTagName("unpitched")[0];
      let pitch = null;
      if (pitchEl) {
        const step = text(pitchEl, "step") || "C";
        const octave = num(pitchEl, "octave") ?? 4;
        const alter = num(pitchEl, "alter") || 0;
        pitch = { step, octave, alter, midi: midiOf(step, octave, alter), diatonic: diatonicOf(step, octave) };
      } else if (unpitchedEl) {
        const step = text(unpitchedEl, "display-step") || "C";
        const octave = num(unpitchedEl, "display-octave") ?? 4;
        // Unpitched notes still need a staff position; they just have no key.
        pitch = { step, octave, alter: 0, midi: null, diatonic: diatonicOf(step, octave), unpitched: true };
      }

      const ties = Array.from(el.getElementsByTagName("tie")).map((t) => t.getAttribute("type"));
      const notations = el.getElementsByTagName("notations")[0];
      const articulations = notations?.getElementsByTagName("articulations")[0];

      events.push({
        onset16,
        dur16,
        nv,
        dots,
        isRest,
        isGrace,
        isChordNote,
        pitch,
        tuplet,
        tieStart: ties.includes("start"),
        tieStop: ties.includes("stop"),
        accidental: text(el, "accidental"),
        accent: !!articulations?.getElementsByTagName("accent")[0],
        staccato: !!articulations?.getElementsByTagName("staccato")[0],
        staff: num(el, "staff") || 1,
        voice: text(el, "voice") || "1",
        measure: measureNumber,
      });

      if (!isChordNote) {
        lastOnset16 = cursor16;
        cursor16 += dur16;
        furthest16 = Math.max(furthest16, cursor16);
      }
    }

    const measure16 = furthest16 - measureStart16;
    measures.push({
      number: measureNumber,
      start16: measureStart16,
      length16: measure16 > 0 ? measure16 : (timeSignature.numerator * 16) / timeSignature.denominator,
    });
    measureStart16 = measures[measures.length - 1].start16 + measures[measures.length - 1].length16;
  }

  if (!clefs.has(1)) clefs.set(1, { sign: "G", line: 2, octaveChange: 0 });

  return {
    id: partEl.getAttribute("id"),
    name: name || partEl.getAttribute("id") || "Part",
    divisions,
    keyFifths,
    timeSignature,
    staffCount,
    clefs,
    tempo,
    events,
    measures,
    total16: measureStart16,
    isPercussion: (clefs.get(1)?.sign || "").toUpperCase() === "PERCUSSION",
  };
}

// ─── Views onto a parsed part ───

// Everything that sounds, in playback order. Notes tied *from* a previous note
// are folded into that note's length rather than re-struck.
export function playableNotes(part) {
  const sounding = part.events.filter((e) => !e.isRest && e.pitch && !e.tieStop);
  const tiedTails = part.events.filter((e) => !e.isRest && e.pitch && e.tieStop);

  return sounding
    .map((e) => {
      let dur16 = e.dur16;
      // Follow a chain of ties at the same pitch, extending the sounding length.
      let end = e.onset16 + e.dur16;
      let guard = 0;
      let extending = e.tieStart;
      while (extending && guard++ < 64) {
        const next = tiedTails.find(
          (t) => Math.abs(t.onset16 - end) < 1e-6 && t.pitch?.midi === e.pitch?.midi
        );
        if (!next) break;
        dur16 += next.dur16;
        end += next.dur16;
        extending = next.tieStart;
      }
      return {
        onset16: e.onset16,
        dur16,
        midi: e.pitch.midi,
        unpitched: !!e.pitch.unpitched,
        accent: e.accent,
        staccato: e.staccato,
        isGrace: e.isGrace,
      };
    })
    .sort((a, b) => a.onset16 - b.onset16);
}

// The notes of one staff, grouped into chords and ordered for engraving.
// Voices are merged: the highest voice wins the stem, which is enough for the
// single-line reading view this app draws.
export function staffItems(part, staffNumber = 1) {
  const onStaff = part.events.filter((e) => (e.staff || 1) === staffNumber && !e.isGrace);
  if (onStaff.length === 0) return [];

  // Keep only the leading voice so two hands don't collide into one line.
  const voiceCounts = new Map();
  for (const e of onStaff) voiceCounts.set(e.voice, (voiceCounts.get(e.voice) || 0) + 1);
  const primaryVoice = [...voiceCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const voiced = onStaff.filter((e) => e.voice === primaryVoice);

  const byOnset = new Map();
  for (const e of voiced) {
    const key = Math.round(e.onset16 * 1000) / 1000;
    if (!byOnset.has(key)) byOnset.set(key, []);
    byOnset.get(key).push(e);
  }

  return [...byOnset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([onset16, group]) => {
      const lead = group[0];
      const pitches = group
        .filter((e) => e.pitch)
        .map((e) => ({ ...e.pitch, accidental: e.accidental, tieStart: e.tieStart, tieStop: e.tieStop }))
        .sort((a, b) => a.diatonic - b.diatonic);
      return {
        onset16,
        dur16: Math.max(...group.map((e) => e.dur16)),
        nv: lead.nv,
        dots: lead.dots,
        isRest: lead.isRest && pitches.length === 0,
        tuplet: lead.tuplet,
        accent: group.some((e) => e.accent),
        staccato: group.some((e) => e.staccato),
        measure: lead.measure,
        pitches,
      };
    });
}

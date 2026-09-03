import { getOrnaments, beatGroups, noteValue } from "@/lib/rhythmEngine";

// ─── MusicXML Export (Mark 5 — Correct Note Types, Instrument Lock, Tuplets) ───
// Fixes:
//   Bug 1: Central durationToType() converts computed duration → correct <type>,
//          including tuplet-adjusted values (triplet eighth → "eighth" + time-mod)
//   Bug 2: Single snare-drum score-instrument + midi-instrument, every note references it
//   1.4:   <time-modification> + <notations><tuplet> start/stop markers

// Divisions per quarter note. 5040 = 2^4·3^2·5·7, so every subdivision the
// quantizer can produce — 64ths, triplets, quintuplets, sextuplets, septuplets,
// nonuplets — lands on a whole number of divisions.
const DIVISIONS = 5040;

// ─── Central type mapping (Bug 1 fix) ───
// Converts a computed duration (in 16th-note units) to the correct MusicXML <type>.
// For tuplet notes, the "normal" duration (what it would be without compression)
// determines the visual type; <time-modification> conveys the actual ratio.
function visualValue(note) {
  const nv = noteValue(note);
  if (!note.tuplet) return Math.round(nv * 100) / 100;
  // Pre-Mark-5 notation stored only the sounding duration; recover the visual
  // value from the tuplet ratio.
  if (note.nv) return Math.round(nv * 100) / 100;
  const [actual, normal] = note.tuplet.split(":").map(Number);
  return Math.round(nv * (actual / normal) * 100) / 100;
}

function durationToType(note) {
  const TYPE_MAP = {
    0.25: "64th", 0.375: "64th",
    0.5: "32nd", 0.75: "32nd",
    1: "16th", 1.5: "16th",
    2: "eighth", 3: "eighth",
    4: "quarter", 6: "quarter",
    8: "half", 12: "half",
    16: "whole",
  };
  return TYPE_MAP[visualValue(note)] || "16th";
}

function isDottedType(note) {
  return [0.375, 0.75, 1.5, 3, 6, 12].includes(visualValue(note));
}

function durationInDivisions(duration16) {
  return Math.max(1, Math.round((duration16 / 4) * DIVISIONS));
}

// ─── Instruments ───
// What the exported file says it is, and therefore what it sounds like and how
// it is engraved when someone opens it.
//
//   part-name is the real instrument name, and <instrument-sound> names the
//   instrument in MusicXML's own vocabulary. Those ids are not guessable — they
//   are whatever the receiving program's instrument table says, and a near miss
//   matches nothing at all. MuseScore's marching tenors are registered as
//   "drum.tenor-drum", NOT "drum.marching-tenor-drums"; exporting the plausible
//   name instead is what made a tenor take come back as six ordinary toms.
//
//   Once the part does match, the program swaps in that instrument's own kit,
//   and <midi-unpitched> has to name a drum that exists inside it — a pitch the
//   kit has nothing on is not a wrong drum, it is no drum. MuseScore's marching
//   tenors sit on 36·48·60·72·84·96, which is not General MIDI at all.
//
//   The snare has a further wrinkle: two MuseScore instruments claim the id
//   "drum.snare-drum" — the concert Snare Drum and the Marching Snare Drum — and
//   the concert one is declared first, so it is the one a match lands on. The
//   part-name does not break the tie. Its kit is the Orchestra Kit, where the
//   snare is GM's own pitch 38 and the marching kit's pitch 50 is a tom. So the
//   snare exports on 38: right in the instrument MuseScore actually picks, and
//   right again in any plain General MIDI player. Chasing the marching kit
//   instead buys a slightly different snare timbre and loses both.
//
//   <midi-unpitched> is 1-BASED, so each of those pitches is written one higher
//   than its number here. Getting that off by one is its own way to land on the
//   drum next door.
//
//   The display positions are the portable half of this. They are the same
//   lines the app draws on screen and the same ones MuseScore's kits sit on, so
//   a program that recognises neither the sound id nor the pitches still
//   engraves the part correctly.
//
//   On a FIVE-line staff those positions read the obvious way: F5 is the top
//   line, B4 the middle, E4 the bottom. The tenors are written that way and
//   land correctly.
//
//   A ONE-line staff does not keep the top line and drop the rest, which is the
//   assumption to resist here. The single line is drawn where the BOTTOM line of
//   a five-line staff would be, so the on-the-line position is E4 and everything
//   written above it floats off into space. Two exports proved it: B4 came out
//   two spaces above the line, F5 — four steps higher — came out four spaces
//   above it. The middle-line answer is the wrong one for a one-line staff.
//
//   staffLines is written out as <staff-details>. A snare take belongs on one
//   line, which is how a snare part is read; a tenor take needs the five lines
//   its six drums are spread over.

// One line, one drum. Pitch 38 is the snare of the kit this part lands in, and
// General MIDI's acoustic snare besides. Both of its drums are written on E4 —
// the bottom-line position, which is where a one-line staff draws its line — so
// the notehead sits on the line instead of floating above it.
//
// The side stick is declared but never played. It is here because a percussion
// part that declares exactly one instrument has been seen to regress to silent
// playback, and because it is the drum a rim-click articulation would move to if
// this export ever grows a second voice.
const SNARE_PART = {
  partName: "Marching Snare Drum",
  abbreviation: "S.D.",
  sound: "drum.snare-drum",
  staffLines: 1,
  voices: [
    { id: "P1-I1", name: "Snare", unpitched: 39, step: "E", octave: 4 },
    { id: "P1-I2", name: "Side Stick", unpitched: 38, step: "E", octave: 4 },
  ],
  defaultVoice: 0,
};

// Six drums, largest to smallest — the four mains then the two spocks — each on
// its own drum of the marching tenor kit, so a tenor take exports as six
// distinct voices instead of six copies of one drum.
//
// The staff positions are the ascending thirds a tenor part is engraved on:
// F4 A4 C5 E5 for the four mains, then G5 and A5 for the spocks, above the
// staff where they belong. That is both where the app draws them and where the
// marching tenor kit expects them, so the notation survives even in a program
// that recognises none of the ids below.
const TENOR_PART = {
  partName: "Marching Tenor Drums",
  abbreviation: "T.D.",
  sound: "drum.tenor-drum",
  staffLines: 5,
  voices: [
    { id: "P1-I1", name: "Drum 4", unpitched: 37, step: "F", octave: 4 },
    { id: "P1-I2", name: "Drum 3", unpitched: 49, step: "A", octave: 4 },
    { id: "P1-I3", name: "Drum 2", unpitched: 61, step: "C", octave: 5 },
    { id: "P1-I4", name: "Drum 1", unpitched: 73, step: "E", octave: 5 },
    { id: "P1-I5", name: "Spock 5", unpitched: 85, step: "G", octave: 5 },
    { id: "P1-I6", name: "Spock 6", unpitched: 97, step: "A", octave: 5 },
  ],
  defaultVoice: 0,
};

function partFor(instrument) {
  return instrument === "tenor" ? TENOR_PART : SNARE_PART;
}

// Which of the part's voices a given note is played on. Only tenors vary —
// a snare take is all one drum.
function voiceFor(part, note) {
  if (part !== TENOR_PART) return part.voices[part.defaultVoice];
  const drum = Math.max(0, Math.min(part.voices.length - 1, Math.round(note.drum ?? 0)));
  return part.voices[drum];
}

function partListXML(part) {
  let xml = `    <score-part id="P1">\n`;
  xml += `      <part-name>${escapeXML(part.partName)}</part-name>\n`;
  xml += `      <part-abbreviation>${escapeXML(part.abbreviation)}</part-abbreviation>\n`;
  for (const voice of part.voices) {
    xml += `      <score-instrument id="${voice.id}">\n`;
    xml += `        <instrument-name>${escapeXML(voice.name)}</instrument-name>\n`;
    xml += `        <instrument-sound>${part.sound}</instrument-sound>\n`;
    xml += `      </score-instrument>\n`;
  }
  xml += `      <midi-device port="1"></midi-device>\n`;
  for (const voice of part.voices) {
    xml += `      <midi-instrument id="${voice.id}">\n`;
    xml += `        <midi-channel>10</midi-channel>\n`;
    xml += `        <midi-program>1</midi-program>\n`;
    xml += `        <midi-unpitched>${voice.unpitched}</midi-unpitched>\n`;
    xml += `        <volume>78.7402</volume>\n`;
    xml += `        <pan>0</pan>\n`;
    xml += `      </midi-instrument>\n`;
  }
  xml += `    </score-part>\n`;
  return xml;
}

// A flam is one grace stroke before the main note; a drag is two. They were
// previously written as <ornaments><grace/></ornaments>, which isn't valid
// MusicXML — <grace> is a property of a note, not an ornament — so the extra
// strokes were silently dropped and a flam exported as a plain single hit.
function graceNotesXML(ornaments, voice) {
  const count = ornaments.includes("flam") ? 1 : ornaments.includes("drag") ? 2 : 0;
  let xml = "";
  for (let i = 0; i < count; i++) {
    xml += `      <note>\n`;
    xml += `        <grace slash="yes"/>\n`;
    xml += `        <unpitched><display-step>${voice.step}</display-step><display-octave>${voice.octave}</display-octave></unpitched>\n`;
    xml += `        <instrument id="${voice.id}"/>\n`;
    xml += `        <voice>1</voice>\n`;
    xml += `        <type>16th</type>\n`;
    xml += `        <stem>up</stem>\n`;
    xml += `      </note>\n`;
  }
  return xml;
}

function escapeXML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Dev validation: flag type/duration mismatches (Section 1.1 safeguard) ───
function validateTypeMapping(notation) {
  if (import.meta.env?.PROD) return;
  for (let i = 0; i < notation.length; i++) {
    const note = notation[i];
    const type = durationToType(note);
    // A type of "16th" with a duration of 4 (quarter) is a red flag
    if (note.duration_16ths >= 3.5 && type === "16th") {
      console.warn(`[MusicXML] Note ${i}: duration ${note.duration_16ths} maps to "${type}" — possible mismatch`);
    }
  }
}

// ─── Compute beat index for each note (to split tuplet groups at beat boundaries) ───
function computeBeatIndices(notation, timeSignature) {
  const groups = beatGroups(timeSignature);
  const beatStarts = [];
  let cum = 0;
  for (const g of groups) {
    beatStarts.push(cum);
    cum += g;
  }

  const indices = [];
  let pos16 = 0;
  let beatIdx = 0;
  let nextBoundary = groups[0];
  for (let i = 0; i < notation.length; i++) {
    indices[i] = beatIdx;
    pos16 += notation[i].duration_16ths;
    if (pos16 >= nextBoundary - 0.01) {
      beatIdx++;
      nextBoundary += groups[beatIdx % groups.length];
    }
  }
  return indices;
}

// ─── Compute tuplet start/stop markers per note index ───
function computeTupletMarkers(notation, beatIndices) {
  const markers = {};
  for (let i = 0; i < notation.length; i++) {
    if (!notation[i].tuplet) continue;
    const prevDiff = i === 0 || !notation[i - 1].tuplet || beatIndices[i] !== beatIndices[i - 1];
    const nextDiff = i === notation.length - 1 || !notation[i + 1].tuplet || beatIndices[i] !== beatIndices[i + 1];
    if (prevDiff) markers[i] = { ...(markers[i] || {}), start: true, tuplet: notation[i].tuplet };
    if (nextDiff) markers[i] = { ...(markers[i] || {}), stop: true };
  }

  // Compute group length for bracket decision (3+ notes = beamed = no bracket)
  const groupLengths = {};
  let i = 0;
  while (i < notation.length) {
    if (!notation[i].tuplet) { i++; continue; }
    let j = i;
    while (j < notation.length && notation[j].tuplet === notation[i].tuplet && beatIndices[j] === beatIndices[i]) j++;
    const len = j - i;
    for (let k = i; k < j; k++) {
      if (markers[k]) markers[k].groupLength = len;
    }
    i = j;
  }
  return markers;
}

export function generateMusicXML(notation, timeSignature, title, bpm, instrument = "snare") {
  const { numerator, denominator } = timeSignature;
  const spm = Math.round(numerator * (4 / denominator) * 4);
  const part = partFor(instrument);

  validateTypeMapping(notation);

  const beatIndices = computeBeatIndices(notation, timeSignature);
  const tupletMarkers = computeTupletMarkers(notation, beatIndices);

  // Group notes into measures
  const measures = [];
  let gridIdx = 0;
  let current = [];
  let measureStart = 0;
  for (const note of notation) {
    current.push(note);
    gridIdx += note.duration_16ths;
    if (gridIdx >= measureStart + spm - 0.01) {
      measures.push(current);
      current = [];
      measureStart += spm;
    }
  }
  if (current.length > 0) measures.push(current);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
  xml += `<score-partwise version="4.0">\n`;
  xml += `  <work><work-title>${escapeXML(title)}</work-title></work>\n`;
  xml += `  <part-list>\n`;
  xml += partListXML(part);
  xml += `  </part-list>\n`;
  xml += `  <part id="P1">\n`;

  let globalNoteIdx = 0;

  measures.forEach((notes, mIdx) => {
    xml += `    <measure number="${mIdx + 1}">\n`;
    if (mIdx === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${DIVISIONS}</divisions>\n`;
      xml += `        <time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time>\n`;
      xml += `        <clef><sign>percussion</sign><line>2</line></clef>\n`;
      xml += `        <staff-details><staff-lines>${part.staffLines}</staff-lines></staff-details>\n`;
      xml += `      </attributes>\n`;
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type>\n`;
      xml += `        <sound tempo="${bpm}"/>\n`;
      xml += `      </direction>\n`;
    }

    for (const note of notes) {
      const idx = globalNoteIdx++;
      const type = durationToType(note);
      const dotted = isDottedType(note);
      const dur = durationInDivisions(note.duration_16ths);
      const marker = tupletMarkers[idx];
      const voice = voiceFor(part, note);
      const ornaments = note.is_rest ? [] : getOrnaments(note);

      // Grace strokes are their own notes and have to come first.
      if (!note.is_rest) xml += graceNotesXML(ornaments, voice);

      xml += `      <note>\n`;
      if (note.is_rest) {
        xml += `        <rest/>\n`;
      } else {
        xml += `        <unpitched><display-step>${voice.step}</display-step><display-octave>${voice.octave}</display-octave></unpitched>\n`;
      }
      xml += `        <duration>${dur}</duration>\n`;
      if (!note.is_rest) {
        xml += `        <instrument id="${voice.id}"/>\n`;
      }
      xml += `        <voice>1</voice>\n`;
      xml += `        <type>${type}</type>\n`;
      if (dotted) xml += `        <dot/>\n`;

      // Time-modification for tuplet notes/rests
      if (note.tuplet) {
        const [actual, normal] = note.tuplet.split(":").map(Number);
        xml += `        <time-modification><actual-notes>${actual}</actual-notes><normal-notes>${normal}</normal-notes></time-modification>\n`;
      }

      if (!note.is_rest) {
        xml += `        <stem>up</stem>\n`;
      }

      // Notations: ornaments + tuplet markers
      const notations = [];
      if (!note.is_rest) {
        if (ornaments.includes("accent")) notations.push(`        <articulations><accent/></articulations>`);
        if (ornaments.includes("ghost")) notations.push(`        <articulations><tenuto/></articulations>`);
        if (ornaments.includes("rimshot")) notations.push(`        <articulations><staccato/></articulations>`);
        if (ornaments.includes("diddle") || ornaments.includes("roll")) {
          notations.push(`        <ornaments><tremolo type="start">3</tremolo></ornaments>`);
        }
      }

      if (marker) {
        const [actual] = note.tuplet.split(":").map(Number);
        const bracket = marker.groupLength >= 3 ? "no" : "yes";
        if (marker.start) {
          notations.push(`        <tuplet type="start" bracket="${bracket}" show-number="actual" number="${actual}"/>`);
        }
        if (marker.stop) {
          notations.push(`        <tuplet type="stop"/>`);
        }
      }

      if (notations.length > 0) {
        xml += `        <notations>\n`;
        for (const n of notations) xml += `${n}\n`;
        xml += `        </notations>\n`;
      }

      xml += `      </note>\n`;
    }
    xml += `    </measure>\n`;
  });

  xml += `  </part>\n`;
  xml += `</score-partwise>`;
  return xml;
}

export function downloadMusicXML(notation, timeSignature, title, bpm, instrument = "snare") {
  const xml = generateMusicXML(notation, timeSignature, title, bpm, instrument);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.musicxml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
import { getOrnaments } from "@/lib/rhythmEngine";
import { getSettings } from "@/lib/settings";

// ─── Web Audio Playback Engine — Crisp Snare ───
// Layered synthesis: tonal body + snare-wire noise + stick attack click.
// Velocity and ornament-aware for accent/ghost/flam/drag/roll differentiation.

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// ─── Crisp snare hit ───
// Layers a tonal membrane body, filtered snare-wire noise, and a sharp stick click.
function playSnare(time, velocity = 0.7, accent = false) {
  const ctx = getCtx();
  const v = Math.min(velocity, 1);

  // Layer 1: Tonal body (drum membrane — triangle wave with pitch drop)
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(accent ? 240 : 200, time);
  body.frequency.exponentialRampToValueAtTime(140, time + 0.04);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, time);
  bodyGain.gain.linearRampToValueAtTime(v * (accent ? 0.45 : 0.35), time + 0.002);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
  body.connect(bodyGain);

  // Layer 2: Snare-wire noise (highpass-filtered burst with fast decay)
  const noiseDur = 0.13;
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    const env = Math.pow(1 - i / noiseData.length, 3);
    noiseData[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = accent ? 3200 : 2400;
  noiseFilter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = v * (accent ? 0.65 : 0.48);
  noise.connect(noiseFilter).connect(noiseGain);

  // Layer 3: Stick attack click (very short, high-frequency square)
  const click = ctx.createOscillator();
  click.type = "square";
  click.frequency.value = accent ? 4200 : 3200;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(v * (accent ? 0.35 : 0.25), time);
  clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.018);
  click.connect(clickGain);

  // Mix
  const master = ctx.createGain();
  master.gain.value = 1;
  bodyGain.connect(master);
  noiseGain.connect(master);
  clickGain.connect(master);
  master.connect(ctx.destination);

  body.start(time);
  body.stop(time + 0.1);
  noise.start(time);
  click.start(time);
  click.stop(time + 0.02);
}

// ─── Rimshot ───
// A rimshot = stick striking head + rim simultaneously → a crisp, bright,
// punchy crack. Sharp metallic clicks + a tight mid body + bright short
// snare-wire noise. Quick decay so it reads as a single clean hit, not a flam.
function playRimshot(time, velocity = 0.7, accent = false) {
  const ctx = getCtx();
  const v = Math.min(velocity, 1);

  // Sharp metallic crack (primary)
  const crack = ctx.createOscillator();
  crack.type = "square";
  crack.frequency.setValueAtTime(4200, time);
  crack.frequency.exponentialRampToValueAtTime(3000, time + 0.015);
  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(v * 0.45, time);
  crackGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
  crack.connect(crackGain);

  // High metallic overtone for the "ring"
  const crack2 = ctx.createOscillator();
  crack2.type = "square";
  crack2.frequency.value = 6400;
  const crack2Gain = ctx.createGain();
  crack2Gain.gain.setValueAtTime(v * 0.25, time);
  crack2Gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
  crack2.connect(crack2Gain);

  // Tight, crisp snare body (mid pitch, short)
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(accent ? 260 : 230, time);
  body.frequency.exponentialRampToValueAtTime(150, time + 0.04);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, time);
  bodyGain.gain.linearRampToValueAtTime(v * (accent ? 0.5 : 0.42), time + 0.002);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  body.connect(bodyGain);

  // Bright, short snare-wire noise
  const noiseDur = 0.09;
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 1.8);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = accent ? 3400 : 3000;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = v * (accent ? 0.7 : 0.6);
  noise.connect(noiseFilter).connect(noiseGain);

  const master = ctx.createGain();
  master.gain.value = 1;
  crackGain.connect(master);
  crack2Gain.connect(master);
  bodyGain.connect(master);
  noiseGain.connect(master);
  master.connect(ctx.destination);

  body.start(time);
  body.stop(time + 0.09);
  noise.start(time);
  crack.start(time);
  crack.stop(time + 0.03);
  crack2.start(time);
  crack2.stop(time + 0.025);
}

// ─── Metronome click ───
function playTone(time, freq = 1800, velocity = 0.3, accent = false) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  osc.type = "square";
  const gain = ctx.createGain();
  const dur = 0.04;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(velocity * (accent ? 1.3 : 1), time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + dur);
}

export function playMetronomeClick(accent = false) {
  const ctx = getCtx();
  const { metronomeVolume = 0.8 } = getSettings();
  playTone(ctx.currentTime, accent ? 2000 : 1400, 0.35 * metronomeVolume, accent);
}

// ─── Play-along tap ───
// A dry woodblock knock for the strokes you play yourself. Deliberately not a
// drum and not the metronome pitch, so three layers of sound stay tellable
// apart while you're playing against the score.
export function playTapFeedback(velocity = 0.7) {
  const ctx = getCtx();
  const time = ctx.currentTime;
  const v = Math.min(velocity, 1);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1150, time);
  osc.frequency.exponentialRampToValueAtTime(820, time + 0.03);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(v * 0.28, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0005, time + 0.055);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.07);
}

// ─── Tenor drum voice (quads) ──
// A marching tenor is a high-tuned tom: no snare wires, a clear sung pitch, a
// quick bend down as the struck head releases its tension, and a ring that
// hangs on well past the attack. A single triangle wave with a square click on
// top reads as a beep, so the body here is built from the drum head's actual
// vibration modes instead.
//
// Ratios are the circular-membrane ones (1.59, 2.14, 2.30, 2.92), each with
// its own decay — the high modes die away fastest, which is what turns a stack
// of sine waves into something that sounds struck. A touch of detune per mode
// keeps them beating against each other rather than fusing into an organ tone.
const TENOR_FREQS = [175, 220, 262, 330, 392, 494]; // F3, A3, C4, E4, G4(spock), B4(spock)
const TENOR_MODES = [
  { ratio: 1.0, gain: 1.0, decay: 1.0, detune: 1.0 },
  { ratio: 1.593, gain: 0.36, decay: 0.5, detune: 1.004 },
  { ratio: 2.136, gain: 0.22, decay: 0.32, detune: 0.997 },
  { ratio: 2.295, gain: 0.14, decay: 0.24, detune: 1.006 },
  { ratio: 2.917, gain: 0.09, decay: 0.16, detune: 0.995 },
];

function playTenor(time, drum, velocity = 0.7, accent = false) {
  const ctx = getCtx();
  const v = Math.min(velocity, 1);
  const idx = Math.max(0, Math.min(TENOR_FREQS.length - 1, Math.round(drum) || 0));
  const f0 = TENOR_FREQS[idx];
  const spock = idx >= 4;
  // Big drums ring; the little spocks are choked by their own size.
  const ring = spock ? 0.36 : 0.95 - idx * 0.1;

  const out = ctx.createGain();
  out.gain.value = v * (accent ? 0.5 : 0.4);
  out.connect(ctx.destination);

  // The head is brightest the instant it's hit and darkens as it settles.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(accent ? 7600 : 5400, time);
  tone.frequency.exponentialRampToValueAtTime(Math.max(600, f0 * 3), time + ring);
  tone.Q.value = 0.4;
  tone.connect(out);

  for (const mode of TENOR_MODES) {
    const f = f0 * mode.ratio * mode.detune;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    // Struck heads start sharp and drop to pitch in the first few milliseconds.
    osc.frequency.setValueAtTime(f * (accent ? 1.3 : 1.22), time);
    osc.frequency.exponentialRampToValueAtTime(f, time + 0.035);

    const decay = Math.max(0.06, ring * mode.decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(mode.gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, time + decay);

    osc.connect(g).connect(tone);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  // Stick on mylar — a filtered noise tick, not a tuned square, so it reads as
  // wood hitting plastic instead of a second pitch on top of the drum.
  const tickDur = 0.05;
  const tickBuf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * tickDur)), ctx.sampleRate);
  const tickData = tickBuf.getChannelData(0);
  for (let i = 0; i < tickData.length; i++) {
    tickData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / tickData.length, 7);
  }
  const tick = ctx.createBufferSource();
  tick.buffer = tickBuf;
  const tickFilter = ctx.createBiquadFilter();
  tickFilter.type = "bandpass";
  tickFilter.frequency.value = accent ? 3800 : 3000;
  tickFilter.Q.value = 0.9;
  const tickGain = ctx.createGain();
  tickGain.gain.value = v * (accent ? 0.5 : 0.36);
  tick.connect(tickFilter).connect(tickGain).connect(out);
  tick.start(time);
}

// A rim tick to lay over an accented tenor stroke — bright, dry, and gone in
// twenty milliseconds, so it colours the attack instead of adding a pitch.
function playTenorRim(time, velocity = 0.7) {
  const ctx = getCtx();
  const v = Math.min(velocity, 1);
  const dur = 0.045;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 5);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 5200;
  filter.Q.value = 2.2;
  const gain = ctx.createGain();
  gain.gain.value = v * 0.34;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(time);
}

// ─── Play a full notation sequence ───
// Returns total duration in seconds. Ornament-aware: flams play grace+main,
// diddles play double strokes, buzz rolls play multiple rapid strokes,
// ghosts are quieter, accents are louder/sharper.
export function playRhythm(notation, bpm, timeSignature, opts = {}) {
  const ctx = getCtx();
  const { numerator, denominator } = timeSignature;
  const beatsPerMeasure = numerator * (4 / denominator);
  const sixteenthsPerBeat = 4;
  const speed = opts.speed || 1;
  const beatDur = 60 / bpm / speed;
  const sixteenthDur = beatDur / sixteenthsPerBeat;
  const startTime = ctx.currentTime + 0.12;

  // Metronome
  if (opts.metronome) {
    const { metronomeVolume = 0.8 } = getSettings();
    const total16 = notation.reduce((sum, n) => sum + n.duration_16ths, 0);
    const totalBeats = total16 / sixteenthsPerBeat;
    for (let b = 0; b < totalBeats; b++) {
      const accent = b % beatsPerMeasure === 0;
      playTone(startTime + b * beatDur, accent ? 2000 : 1400, 0.22 * metronomeVolume, accent);
    }
  }

  // Notes
  let gridIdx = 0;
  for (const note of notation) {
    if (!note.is_rest) {
      const noteTime = startTime + gridIdx * sixteenthDur;
      const baseVel = note.velocity || 0.7;
      const ornaments = getOrnaments(note);
      const isAccent = ornaments.includes("accent");
      const isGhost = ornaments.includes("ghost");

      // Velocity modifiers (accent/ghost stack with other ornaments)
      let vel = baseVel;
      if (isGhost) vel = baseVel * 0.3;
      else if (isAccent) vel = Math.min(baseVel * 1.5, 1);
      const accentFlag = isAccent && !isGhost;

      const drum = note.drum ?? 0;
      const voice = (t, v, a) =>
        opts.instrument === "tenor" ? playTenor(t, drum, v, a) : playSnare(t, v, a);

      if (ornaments.includes("flam")) {
        voice(noteTime - 0.03, baseVel * 0.4, false);
        voice(noteTime, vel, accentFlag);
      } else if (ornaments.includes("diddle")) {
        voice(noteTime, vel, accentFlag);
        voice(noteTime + sixteenthDur * 0.5, vel * 0.85, accentFlag);
      } else if (ornaments.includes("roll")) {
        // Sustained buzz across the full note duration (e.g. half-note roll)
        const strokeInterval = sixteenthDur * 0.5;
        const strokeCount = Math.max(3, Math.round(note.duration_16ths * 2));
        for (let s = 0; s < strokeCount; s++) {
          voice(noteTime + s * strokeInterval, vel * 0.5, false);
        }
      } else if (ornaments.includes("drag")) {
        voice(noteTime - 0.025, baseVel * 0.25, false);
        voice(noteTime - 0.012, baseVel * 0.25, false);
        voice(noteTime, vel, accentFlag);
      } else if (ornaments.includes("rimshot")) {
        if (opts.instrument === "tenor") {
          // Rim on a tenor is the shell, not a snare crack — the drum's own
          // voice with a hard metallic tick riding on the attack.
          playTenor(noteTime, drum, vel, true);
          playTenorRim(noteTime, vel);
        } else {
          playRimshot(noteTime, vel, accentFlag);
        }
      } else {
        voice(noteTime, vel, accentFlag);
      }
    }
    gridIdx += note.duration_16ths;
  }

  const total16 = notation.reduce((sum, n) => sum + n.duration_16ths, 0);
  return total16 * sixteenthDur;
}

// ─── Play raw tap events (for "compare to original") ───
export function playRawTaps(taps, opts = {}) {
  const ctx = getCtx();
  if (!taps || taps.length === 0) return 0;
  const speed = opts.speed || 1;
  const firstTap = taps[0].timestamp;
  const startTime = ctx.currentTime + 0.12;
  for (const tap of taps) {
    const t = startTime + (tap.timestamp - firstTap) / 1000 / speed;
    playSnare(t, tap.velocity || 0.7);
  }
  const lastTap = taps[taps.length - 1].timestamp;
  return (lastTap - firstTap) / 1000 / speed + 0.5;
}

// ─── Continuous metronome clicks (for "metronome always active" during recording) ───
// Returns a stop() function that clears the scheduler.
export function startMetronomeClicks(bpm, beatsPerMeasure) {
  const ctx = getCtx();
  const { metronomeVolume = 0.8 } = getSettings();
  const beatDur = 60 / bpm;
  let nextTime = ctx.currentTime + 0.1;
  let beat = 0;
  const schedule = () => {
    while (nextTime < ctx.currentTime + 0.25) {
      const accent = beat % Math.max(1, beatsPerMeasure) === 0;
      playTone(nextTime, accent ? 2000 : 1400, 0.3 * metronomeVolume, accent);
      nextTime += beatDur;
      beat++;
    }
  };
  schedule();
  const timer = setInterval(schedule, 60);
  return () => clearInterval(timer);
}

// ─── Pitched voice (for imported sheet music) ───
// A soft mallet/piano-ish tone: a triangle body for weight, a quiet sine an
// octave up for shimmer, and a lowpass that closes as the note decays so long
// notes darken instead of buzzing on.
function playPitch(time, midi, duration, velocity = 0.7) {
  const ctx = getCtx();
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const v = Math.min(velocity, 1);
  const hold = Math.max(0.08, Math.min(duration, 6));
  const release = Math.min(0.5, hold * 0.6);
  const end = time + hold + release;

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = freq;

  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = freq * 2;

  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 1;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.22;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(9000, freq * 8), time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(500, freq * 2.5), end);
  filter.Q.value = 0.6;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(v * 0.32, time + 0.012);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, v * 0.16), time + hold);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);

  body.connect(bodyGain).connect(filter);
  shimmer.connect(shimmerGain).connect(filter);
  filter.connect(envelope).connect(ctx.destination);

  body.start(time);
  shimmer.start(time);
  body.stop(end + 0.02);
  shimmer.stop(end + 0.02);
}

// ─── Play an imported score ───
// Notes are scheduled a fraction of a second ahead rather than all at once, so
// a ten-minute piece doesn't build ten minutes of oscillators before the first
// sound. Returns a handle the UI can poll to follow along, and stop.
export function playScore(notes, bpm, opts = {}) {
  const ctx = getCtx();
  const speed = opts.speed || 1;
  const sixteenthDur = 60 / bpm / 4 / speed;
  const beatDur = sixteenthDur * 4;
  const { metronomeVolume = 0.8 } = getSettings();
  const beatsPerMeasure = opts.timeSignature
    ? opts.timeSignature.numerator * (4 / opts.timeSignature.denominator)
    : 4;

  // Count-in. Bar one starts when the clicks stop, so playing along doesn't
  // begin with a guess about where the downbeat landed.
  const leadInBeats = Math.max(0, Math.round(opts.leadInBeats || 0));
  const startTime = ctx.currentTime + 0.15 + leadInBeats * beatDur;
  for (let b = 0; b < leadInBeats; b++) {
    const at = startTime - (leadInBeats - b) * beatDur;
    const accent = (leadInBeats - b) % Math.max(1, beatsPerMeasure) === 0;
    playTone(at, accent ? 2000 : 1400, 0.32 * metronomeVolume, accent);
  }

  const total16 = notes.reduce((max, n) => Math.max(max, n.onset16 + n.dur16), 0);
  const totalBeats = Math.ceil(total16 / 4);

  let index = 0;
  let clickBeat = 0;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    const horizon = ctx.currentTime + 0.6;
    while (index < notes.length) {
      const note = notes[index];
      const at = startTime + note.onset16 * sixteenthDur;
      if (at > horizon) break;
      index++;
      const duration = Math.max(0.05, note.dur16 * sixteenthDur);
      const velocity = note.accent ? 0.95 : 0.7;
      const sounding = note.staccato ? Math.min(duration, sixteenthDur * 1.2) : duration;
      if (note.unpitched || note.midi == null) playSnare(at, velocity);
      else playPitch(at, note.midi, sounding, velocity);
    }
    // Clicks ride the same horizon as the notes so a long piece doesn't build
    // its whole metronome up front, and they sit on the score's own grid
    // rather than on whatever moment playback happened to start.
    if (opts.metronome) {
      while (clickBeat <= totalBeats) {
        const at = startTime + clickBeat * beatDur;
        if (at > horizon) break;
        const accent = clickBeat % Math.max(1, beatsPerMeasure) === 0;
        playTone(at, accent ? 2000 : 1400, 0.22 * metronomeVolume, accent);
        clickBeat++;
      }
    }
    if (index >= notes.length && (!opts.metronome || clickBeat > totalBeats)) stop();
  };

  let timer = setInterval(schedule, 50);
  schedule();

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    stop,
    durationMs: (leadInBeats * beatDur + total16 * sixteenthDur) * 1000 + 600,
    sixteenthMs: sixteenthDur * 1000,
    // Where the playhead is now, in sixteenths. Negative during the lead-in.
    position16() {
      if (!audioCtx || audioCtx.state === "closed") return null;
      return (audioCtx.currentTime - startTime) / sixteenthDur;
    },
  };
}

export function stopAllPlayback() {
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
}
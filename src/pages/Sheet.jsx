import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileMusic, Upload, Play, Square, Loader2, X, Music4, AlertCircle, Target } from "lucide-react";
import { toast } from "sonner";
import { readMusicXMLFile, playableNotes, staffItems } from "@/lib/musicxmlImport";
import { engraveScore } from "@/lib/scoreEngraving";
import ScoreRenderer from "@/components/Score/ScoreRenderer";
import { playScore, stopAllPlayback, playTapFeedback } from "@/lib/playback";
import { scorePlayAlong, toleranceWindowMs, timingReferenceMs } from "@/lib/playAlong";
import { PlayAlongPad, PlayAlongResult } from "@/components/PlayAlong";
import { useSize } from "@/hooks/use-size";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

export default function Sheet() {
  const [score, setScore] = useState(null);
  const [partIndex, setPartIndex] = useState(0);
  const [staffNumber, setStaffNumber] = useState(1);
  const [bpm, setBpm] = useState(100);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);

  // Play-along
  const [isAlong, setIsAlong] = useState(false);
  const [countingIn, setCountingIn] = useState(false);
  const [beatsLeft, setBeatsLeft] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [lastTapKey, setLastTapKey] = useState(null);
  const [result, setResult] = useState(null);

  const handleRef = useRef(null);
  const frameRef = useRef(0);
  const endTimerRef = useRef(null);
  const staffRef = useRef(null);
  const staffSize = useSize(staffRef);
  // Strokes land faster than React re-renders, so they're collected in a ref
  // and only counted into state for the display.
  const tapsRef = useRef([]);
  const isAlongRef = useRef(false);

  const part = score?.parts[partIndex] || null;

  const items = useMemo(
    () => (part ? staffItems(part, staffNumber) : []),
    [part, staffNumber]
  );

  const notes = useMemo(() => (part ? playableNotes(part) : []), [part]);

  // What you're expected to play: one stroke per moment the part sounds. Two
  // hands landing together, or a chord, is one stroke on a pad — so onsets are
  // collapsed before they're compared to your taps.
  const expectedOnsets16 = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const note of notes) {
      const key = Math.round(note.onset16 * 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(note.onset16);
    }
    return out.sort((a, b) => a - b);
  }, [notes]);

  const layout = useMemo(() => {
    if (!part || items.length === 0) return null;
    return engraveScore(items, {
      clef: part.clefs.get(staffNumber) || part.clefs.get(1),
      keyFifths: part.keyFifths,
      timeSignature: part.timeSignature,
      systemWidth: Math.max(320, (staffSize?.width || 640) - 8),
    });
  }, [part, items, staffNumber, staffSize?.width]);

  // How long one sixteenth lasts in real time at the current tempo and speed —
  // the bridge between the score's grid and the clock your taps arrive on.
  const sixteenthMs = useMemo(() => (60 / bpm / 4 / speed) * 1000, [bpm, speed]);

  const stopPlayback = useCallback(() => {
    if (handleRef.current) handleRef.current.stop();
    handleRef.current = null;
    cancelAnimationFrame(frameRef.current);
    clearTimeout(endTimerRef.current);
    stopAllPlayback();
    isAlongRef.current = false;
    setIsPlaying(false);
    setIsAlong(false);
    setCountingIn(false);
    setActiveIndex(null);
  }, []);

  // Ends a play-along run and reports on it. Scoring happens off the taps
  // already collected, so stopping early still grades what you played.
  const finishAlong = useCallback(() => {
    const taps = tapsRef.current;
    const expectedMs = expectedOnsets16.map((onset) => onset * sixteenthMs);
    stopPlayback();
    if (taps.length === 0) {
      setResult(null);
      toast.message("No strokes recorded — nothing to score.");
      return;
    }
    setResult(
      scorePlayAlong(expectedMs, taps, {
        windowMs: toleranceWindowMs(bpm, speed),
        referenceMs: timingReferenceMs(bpm, speed),
      })
    );
  }, [expectedOnsets16, sixteenthMs, bpm, speed, stopPlayback]);

  useEffect(() => stopPlayback, [stopPlayback]);

  // Changing what's on screen mid-playback would leave the playhead chasing
  // notes that are no longer there.
  useEffect(() => {
    stopPlayback();
  }, [partIndex, staffNumber, stopPlayback]);

  const loadFile = async (file) => {
    if (!file) return;
    stopPlayback();
    setLoading(true);
    setError(null);
    try {
      const parsed = await readMusicXMLFile(file);
      setScore(parsed);
      setPartIndex(0);
      setStaffNumber(1);
      setBpm(parsed.tempo || 100);
      toast.success(`Imported "${parsed.title}"`);
    } catch (e) {
      console.error(e);
      setScore(null);
      setError(e.message || "Couldn't read that file.");
    } finally {
      setLoading(false);
    }
  };

  // One transport for both modes. Play-along adds a counted-in bar, a click
  // over the top so there's a pulse to hold onto when the part thins out, and
  // a scorecard at the end instead of a silent stop.
  const handlePlay = (along = false) => {
    if (!notes.length) return;
    stopAllPlayback();
    setResult(null);
    tapsRef.current = [];
    setTapCount(0);
    setLastTapKey(null);

    const beatsPerMeasure = part.timeSignature
      ? part.timeSignature.numerator * (4 / part.timeSignature.denominator)
      : 4;
    const leadInBeats = along ? Math.max(2, Math.round(beatsPerMeasure)) : 0;

    const handle = playScore(notes, bpm, {
      speed,
      timeSignature: part.timeSignature,
      metronome: along,
      leadInBeats,
    });
    handleRef.current = handle;
    isAlongRef.current = along;
    setIsPlaying(true);
    setIsAlong(along);
    setCountingIn(along);
    setBeatsLeft(leadInBeats);

    const follow = () => {
      const position = handle.position16();
      if (position === null) return;
      if (along) {
        // Negative position means the count-in is still running.
        setCountingIn(position < 0);
        setBeatsLeft(position < 0 ? Math.ceil(-position / 4) : 0);
      }
      // The last item that has started and not yet finished is the one lit up.
      let current = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].onset16 <= position + 1e-6) current = i;
        else break;
      }
      setActiveIndex(current);
      const total = items.length ? items[items.length - 1].onset16 + items[items.length - 1].dur16 : 0;
      if (position > total + 1) {
        if (along) finishAlong();
        else stopPlayback();
        return;
      }
      frameRef.current = requestAnimationFrame(follow);
    };
    frameRef.current = requestAnimationFrame(follow);
    // The frame loop stops running if the tab is hidden, so the transport also
    // resets on a plain timer — otherwise it would sit on "stop" forever.
    endTimerRef.current = setTimeout(
      along ? finishAlong : stopPlayback,
      handle.durationMs + 300
    );
  };

  // A stroke. The position is read off the audio clock rather than a wall
  // clock, then walked back by however long the handler took to run — a busy
  // main thread otherwise reports every tap as late, which would quietly tell
  // every player they drag.
  const handleTap = useCallback((e) => {
    const handle = handleRef.current;
    if (!handle || !isAlongRef.current) return;
    const eventMs = e?.nativeEvent?.timeStamp ?? e?.timeStamp;
    const lagMs =
      typeof eventMs === "number" && eventMs > 0
        ? Math.max(0, Math.min(120, performance.now() - eventMs))
        : 0;

    const position = handle.position16();
    if (position === null) return;
    const atMs = position * handle.sixteenthMs - lagMs;

    setLastTapKey(performance.now());
    playTapFeedback();
    if (navigator.vibrate) navigator.vibrate(8);

    // Strokes during the count-in are someone finding the pulse, not playing
    // the piece. Anything within a beat of the downbeat is a real (early)
    // first note and still counts.
    if (atMs < -handle.sixteenthMs * 4) return;

    tapsRef.current = [...tapsRef.current, atMs];
    setTapCount(tapsRef.current.length);
  }, []);

  // Space is the natural key for this, and holding it shouldn't machine-gun.
  useEffect(() => {
    if (!isAlong) return;
    const onKey = (e) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      handleTap(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAlong, handleTap]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  const staffChoices = part ? Array.from({ length: part.staffCount }, (_, i) => i + 1) : [];

  return (
    <div className="px-5 pt-6 pb-24 min-h-screen">
      <h1 className="notely-title text-[44px] leading-none text-center mb-6">sheet</h1>

      {!score && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <input
            type="file"
            accept=".musicxml,.xml,.mxl"
            className="hidden"
            onChange={(e) => loadFile(e.target.files?.[0])}
          />
          {loading ? (
            <Loader2 size={30} className="animate-spin text-primary" />
          ) : (
            <Upload size={30} className="text-primary" />
          )}
          <div>
            <p className="text-[15px] font-semibold">
              {loading ? "Reading score…" : "Drop a score here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              MusicXML — .musicxml, .xml or .mxl
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/70 max-w-[280px]">
            Export one from MuseScore, Sibelius, Finale, Dorico or Flat.io. A picture
            or PDF of a score won't work — it has to be a MusicXML file.
          </p>
        </label>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 mt-3">
          <AlertCircle size={18} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Import failed</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>
      )}

      {score && (
        <div className="space-y-4">
          {/* Title bar */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">{score.title}</h2>
              {score.composer && (
                <p className="text-xs text-muted-foreground truncate">{score.composer}</p>
              )}
            </div>
            <button
              onClick={() => {
                stopPlayback();
                setScore(null);
              }}
              className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileMusic size={14} />
              new
            </button>
          </div>

          {/* Part / staff pickers */}
          {(score.parts.length > 1 || staffChoices.length > 1) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {score.parts.length > 1 &&
                score.parts.map((p, i) => (
                  <button
                    key={p.id || i}
                    onClick={() => setPartIndex(i)}
                    className={`px-3 h-8 rounded-lg border text-xs font-medium transition-all ${
                      i === partIndex
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              {staffChoices.length > 1 && (
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">staff</span>
                  {staffChoices.map((n) => (
                    <button
                      key={n}
                      onClick={() => setStaffNumber(n)}
                      className={`w-8 h-8 rounded-lg border text-xs font-medium transition-all ${
                        n === staffNumber
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* The music */}
          <div
            ref={staffRef}
            className="rounded-xl border border-border bg-card p-3 overflow-x-hidden"
          >
            {layout ? (
              <ScoreRenderer
                layout={layout}
                activeIndex={activeIndex}
                onSelectNote={setActiveIndex}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nothing on this staff.
              </p>
            )}
          </div>

          {/* Transport */}
          <div className="rounded-xl border border-border bg-card p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => (isPlaying ? (isAlong ? finishAlong() : stopPlayback()) : handlePlay(false))}
                disabled={!notes.length}
                className="flex items-center justify-center gap-2 px-5 h-11 rounded-xl border border-primary bg-primary/10 text-primary text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                {isPlaying ? <Square size={16} /> : <Play size={16} />}
                {isPlaying ? "stop" : "play"}
              </button>

              <button
                onClick={() => handlePlay(true)}
                disabled={!notes.length || isPlaying}
                className="flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-40 enabled:hover:border-primary/50 active:scale-[0.98] transition-all"
              >
                <Target size={16} className="text-primary" />
                play along
              </button>

              <div className="flex items-center gap-1 px-3 h-11 rounded-xl border border-border bg-card">
                <button
                  onClick={() => setBpm((b) => Math.max(20, b - 5))}
                  className="text-muted-foreground px-1"
                  aria-label="Slower"
                >
                  −
                </button>
                <span className="text-sm font-semibold tabular-nums w-9 text-center">{bpm}</span>
                <button
                  onClick={() => setBpm((b) => Math.min(300, b + 5))}
                  className="text-muted-foreground px-1"
                  aria-label="Faster"
                >
                  +
                </button>
                <span className="text-[9px] text-muted-foreground ml-0.5">bpm</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground pr-1">
                speed
              </span>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2.5 h-8 rounded-lg border text-xs font-medium transition-all ${
                    s === speed
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}×
                </button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {notes.length} notes
              </span>
            </div>
          </div>

          {isAlong && (
            <PlayAlongPad
              countingIn={countingIn}
              beatsLeft={beatsLeft}
              taps={tapCount}
              lastTapKey={lastTapKey}
              onTap={handleTap}
              onStop={finishAlong}
            />
          )}

          {result && !isAlong && (
            <PlayAlongResult
              result={result}
              onRetry={() => handlePlay(true)}
              onDismiss={() => setResult(null)}
            />
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80">
            <Music4 size={13} className="shrink-0 mt-0.5" />
            <span>
              The staff shows the leading voice of the chosen part. Playback sounds
              every note in that part, including the voices underneath it. Play
              along counts you in, then scores how close your strokes sat to the
              score — drop the speed if a passage is getting away from you.
            </span>
          </p>
        </div>
      )}

      {loading && score && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/70"
        >
          <Loader2 size={30} className="animate-spin text-primary" />
        </motion.div>
      )}
    </div>
  );
}

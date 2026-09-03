import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/api/base44Client";
import { transcribeTaps } from "@/lib/rhythmEngine";
import { startMetronomeClicks } from "@/lib/playback";
import { getSettings } from "@/lib/settings";
import RecordButton from "@/components/RecordButton";
import TenorPad from "@/components/TenorPad";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import logoHeader from "@/assets/logo-header.png";
import { toast } from "sonner";

const TIME_SIGS = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 2, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 7, denominator: 8 },
];

// When a stroke happened, not when the handler got around to running. Pointer
// events carry a high-resolution timestamp taken at input time, so a busy main
// thread — animations, re-renders — can no longer smear the timing that the
// whole transcription is built on.
function tapTime(e) {
  const ts = e?.nativeEvent?.timeStamp ?? e?.timeStamp;
  if (typeof ts === "number" && ts > 0 && typeof performance !== "undefined" && performance.timeOrigin) {
    const absolute = performance.timeOrigin + ts;
    if (Math.abs(absolute - Date.now()) < 2000) return absolute;
  }
  return Date.now();
}

const MIN_BPM = 40;
const MAX_BPM = 500;
const clampBpm = (n) => Math.min(MAX_BPM, Math.max(MIN_BPM, n));

export default function Home() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [taps, setTaps] = useState([]);
  const [bpm, setBpm] = useState(120);
  const [bpmInput, setBpmInput] = useState("120");
  const [timeSignature, setTimeSignature] = useState({ numerator: 4, denominator: 4 });
  const [isArmed, setIsArmed] = useState(false);
  const [instrument, setInstrument] = useState("snare");
  const [lastHit, setLastHit] = useState(null);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const recordingStartRef = useRef(0);
  const metronomeStopRef = useRef(null);
  // Taps can arrive faster than React re-renders (a flam is ~25 ms), so the
  // handler reads the live recording state from a ref, not from state.
  const isRecordingRef = useRef(false);

  useEffect(() => {
    const settings = getSettings();
    setBpm(settings.defaultTempo);
    setBpmInput(String(settings.defaultTempo));
    setTimeSignature(settings.defaultTimeSignature);
    setInstrument(settings.defaultInstrument || "snare");
  }, []);

  // Keep the text input in sync whenever bpm changes via the steppers.
  useEffect(() => {
    setBpmInput(String(bpm));
  }, [bpm]);

  useEffect(() => {
    return () => {
      if (metronomeStopRef.current) metronomeStopRef.current();
    };
  }, []);

  const commitBpmInput = () => {
    const n = parseInt(bpmInput, 10);
    setBpm(clampBpm(Number.isNaN(n) ? bpm : n));
  };

  // One press arms the pad and starts the click, so you can lock in for as long
  // as you like; the next tap is both the downbeat and the start of the
  // recording. Nothing counts you in and nothing waits — you start when you
  // play. The click keeps running through the take when "metronome always
  // active" is on, and drops out at the downbeat when it isn't.
  const handleCapture = (e, drum = 0) => {
    if (!isRecordingRef.current && !isArmed) {
      setIsArmed(true);
      stopMetronome();
      const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);
      metronomeStopRef.current = startMetronomeClicks(bpm, beatsPerMeasure);
      return;
    }

    const now = tapTime(e);
    if (!isRecordingRef.current) {
      isRecordingRef.current = true;
      recordingStartRef.current = now;
      setIsArmed(false);
      setIsRecording(true);
      // Leave the click running mid-phase rather than restarting it — a stutter
      // at the downbeat is exactly what you don't want to play against.
      if (!getSettings().metronomeAlwaysActive) stopMetronome();
    }

    const velocity = 0.65 + Math.random() * 0.35;
    setTaps((prev) => [...prev, { timestamp: now, velocity, drum }]);
    setPulseKey((k) => k + 1);
    setLastHit({ drum, key: now });
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const stopMetronome = () => {
    if (metronomeStopRef.current) {
      metronomeStopRef.current();
      metronomeStopRef.current = null;
    }
  };

  const handleStop = async () => {
    stopMetronome();
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsArmed(false);
    if (taps.length < 1) {
      setTaps([]);
      return;
    }
    setIsProcessing(true);
    const finalBpm = bpm;
    const notation = transcribeTaps(taps, finalBpm, timeSignature, recordingStartRef.current);

    try {
      const { data: existing, error: listError } = await supabase
        .from("rhythms")
        .select("id, archived")
        .limit(100);
      if (listError) throw listError;

      const activeCount = (existing || []).filter((r) => !r.archived).length;
      if (activeCount >= 30) {
        toast.error("Library full — 30 rhythm limit. Archive or delete some to record more.");
        setIsProcessing(false);
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("You need to be signed in to save a rhythm.");

      const { data: rhythm, error: insertError } = await supabase
        .from("rhythms")
        .insert({
          user_id: user.id,
          title: `Take ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
          tempo_bpm: finalBpm,
          time_signature: timeSignature,
          raw_tap_events: taps,
          notation,
          instrument,
          status: "draft",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      navigate(`/result/${rhythm.id}`);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Couldn't save that transcription. Your taps are still here — try again.");
      setIsProcessing(false);
    }
  };

  const handleRedo = () => {
    stopMetronome();
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsArmed(false);
    setTaps([]);
  };

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary"
        />
        <div className="text-center">
          <p className="text-lg font-semibold">Analyzing rhythm…</p>
          <p className="text-sm text-muted-foreground mt-1">
            Quantizing taps to the grid
          </p>
        </div>
        <div className="w-48 space-y-1.5">
          {["Grid quantization", "Sticking suggestions", "Pattern matching"].map((step, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.4 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Check size={12} className="text-green-500" />
              {step}
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    // Sizes below are measured off the reference layout (350px-wide viewport):
    // logo 310w, pills 104x64 with a 57px gap, drum 188, action pills 32 tall.
    // The 96px subtracted here matches the Layout's pb-24 so the page fills
    // exactly one screen and never scrolls.
    <div className="flex flex-col min-h-[calc(100dvh-96px)] px-5 pt-0.5">
      <motion.img
        src={logoHeader}
        alt="notely"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[310px] mx-auto"
        draggable={false}
      />

      {/* Centers the rest of the block (pills, drum, buttons) as one unit so
          leftover vertical space splits evenly instead of pooling at the
          bottom of the page. */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Instrument — swaps the pad below between the snare and a set of
            quads, and rides along with the take so the staff knows how to draw
            it later. */}
        <div className="flex items-center gap-1 p-1 rounded-full border border-border bg-card mb-3.5 -mt-3">
          {[
            { id: "snare", label: "snare", heads: 1 },
            { id: "tenor", label: "tenors", heads: 4 },
          ].map((option) => {
            const active = instrument === option.id;
            return (
              <button
                key={option.id}
                onClick={() => setInstrument(option.id)}
                disabled={isRecording || isArmed}
                aria-pressed={active}
                className={`flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[13px] transition-all disabled:opacity-50 ${
                  active
                    ? "bg-primary/20 text-primary font-semibold shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.45)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* One drum head, or the four of a quad set */}
                <svg width={option.heads === 1 ? 11 : 18} height="11" viewBox={option.heads === 1 ? "0 0 11 11" : "0 0 18 11"} aria-hidden>
                  {option.heads === 1 ? (
                    <circle cx="5.5" cy="5.5" r="4.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  ) : (
                    [
                      [3.6, 6.4, 3.2],
                      [8.2, 4.6, 2.8],
                      [12.4, 4.6, 2.5],
                      [15.8, 6.2, 2.1],
                    ].map(([cx, cy, r], i) => (
                      <circle key={i} cx={cx} cy={cy} r={r} stroke="currentColor" strokeWidth="1.2" fill="none" />
                    ))
                  )}
                </svg>
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-[57px]">
          {/* Tempo */}
          <div className="flex items-center justify-between w-[104px] h-[64px] px-3 rounded-2xl border border-border bg-card">
            <span className="flex flex-col items-center leading-none">
              <input
                value={bpmInput}
                onChange={(e) => setBpmInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                onBlur={commitBpmInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                inputMode="numeric"
                aria-label="Tempo in beats per minute"
                className="font-display w-[48px] bg-transparent text-[20px] font-semibold tabular-nums text-center outline-none text-foreground p-0"
              />
              <span className="font-display text-[9px] text-primary/80 mt-[7px]">
                bpm
              </span>
            </span>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setBpm((b) => clampBpm(b + 5))}
                className="text-primary/80 hover:text-primary leading-none"
                aria-label="Increase tempo by 5"
              >
                <ChevronUp size={13} />
              </button>
              <button
                onClick={() => setBpm((b) => clampBpm(b - 5))}
                className="text-primary/80 hover:text-primary leading-none"
                aria-label="Decrease tempo by 5"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </div>

          {/* Time signature */}
          <div className="relative">
            <button
              onClick={() => setShowTimeMenu(!showTimeMenu)}
              className="flex items-center justify-between w-[104px] h-[64px] px-3 rounded-2xl border border-border bg-card"
            >
              <span className="flex flex-col items-center leading-none flex-1">
                <span className="font-display text-[20px] font-semibold tabular-nums text-foreground">
                  {timeSignature.numerator}/{timeSignature.denominator}
                </span>
                <span className="font-display text-[9px] text-primary/80 mt-[7px] whitespace-nowrap">
                  Time signature
                </span>
              </span>
              <ChevronDown size={13} className="text-primary/80 shrink-0" />
            </button>
            <AnimatePresence>
              {showTimeMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowTimeMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute top-[70px] left-0 z-20 w-full rounded-xl border border-border bg-popover shadow-xl py-1"
                  >
                    {TIME_SIGS.map((ts) => (
                      <button
                        key={`${ts.numerator}/${ts.denominator}`}
                        onClick={() => {
                          setTimeSignature(ts);
                          setShowTimeMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between"
                      >
                        {ts.numerator}/{ts.denominator}
                        {timeSignature.numerator === ts.numerator &&
                          timeSignature.denominator === ts.denominator && (
                            <Check size={14} className="text-primary" />
                          )}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-[64px] flex justify-center">
          {instrument === "tenor" ? (
            <TenorPad
              isRecording={isRecording}
              isArmed={isArmed}
              onCapture={handleCapture}
              lastHit={lastHit}
            />
          ) : (
            <RecordButton
              isRecording={isRecording}
              isArmed={isArmed}
              onCapture={handleCapture}
              pulseKey={pulseKey}
            />
          )}
        </div>

        <div className="flex items-center justify-center gap-[13px] mt-[34px]">
          <button
            onClick={handleRedo}
            disabled={!isRecording && !isArmed && taps.length === 0}
            className="w-[60px] h-[32px] rounded-full border border-border bg-card text-[15px] text-primary transition-all disabled:opacity-40 enabled:hover:bg-primary/5 enabled:active:scale-95"
          >
            Redo
          </button>
          <button
            onClick={handleStop}
            disabled={taps.length === 0}
            className="w-[110px] h-[32px] rounded-full border border-border bg-card text-[15px] text-primary transition-all disabled:opacity-40 enabled:hover:bg-primary/5 enabled:active:scale-95"
          >
            Transcribe
          </button>
        </div>
      </div>
    </div>
  );
}

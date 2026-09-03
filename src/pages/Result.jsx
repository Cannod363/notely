import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/api/base44Client";
import { playRhythm, stopAllPlayback } from "@/lib/playback";
import { findClosestMatches, buildNotationFromPattern } from "@/lib/rhythmEngine";
import { downloadMusicXML } from "@/lib/musicxml";
import NotationStaff from "@/components/NotationStaff";
import PlaybackControls from "@/components/PlaybackControls";
import AppBackground from "@/components/AppBackground";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  RotateCcw,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Share2,
  Download,
  Wand2,
} from "lucide-react";

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rhythm, setRhythm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [matches, setMatches] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [matchedPattern, setMatchedPattern] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [stickingVisible, setStickingVisible] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    (async () => {
      try {
        const { data: r, error } = await supabase
          .from("rhythms")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        if (cancelled) return;
        setRhythm(r);

        // The pattern library is optional: matching is a nice-to-have, so a
        // missing or unreadable table must never block the transcription.
        const { data: p, error: patternError } = await supabase
          .from("pattern_library")
          .select("*");
        if (patternError) console.warn("Pattern library unavailable:", patternError.message);
        const library = patternError ? [] : p || [];
        if (cancelled) return;
        setPatterns(library);

        // Match against the pattern library; if a known pattern matches
        // strongly (>=95%), notate from the database instead of the grid guess.
        const allMatches = findClosestMatches(r.notation || [], library);
        let finalNotation = r.notation || [];
        let matchedName = null;
        const isSnare = (r.instrument || "snare") === "snare";
        const top = allMatches[0];
        if (isSnare && top && top.match_confidence >= 0.95) {
          const pat = library.find((pp) => pp.song_name === top.song_name);
          // Never auto-apply ornamented patterns (buzz/flam/drag/diddle) —
          // those are interpretations the user must add explicitly. Only plain
          // rhythms auto-notate from the database.
          const hasOrnaments = (pat?.reference_pattern || []).some(
            (x) => (x.ornaments && x.ornaments.length) || (x.ornament && x.ornament !== "none")
          );
          if (pat && pat.reference_pattern && !hasOrnaments) {
            finalNotation = buildNotationFromPattern(pat.reference_pattern, r.time_signature);
            matchedName = pat.song_name;
            const { error: updateError } = await supabase
              .from("rhythms")
              .update({ notation: finalNotation })
              .eq("id", r.id);
            if (updateError) console.error(updateError);
          }
        }
        // Simulate processing delay
        timer = setTimeout(() => {
          if (cancelled) return;
          setRhythm({ ...r, notation: finalNotation });
          setMatches(allMatches);
          setMatchedPattern(matchedName);
          setProcessing(false);
        }, 1400);
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        // Clear the spinner too — otherwise the page hangs on "Transcribing…".
        setLoadError(e.message || "Could not load this rhythm.");
        setProcessing(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopAllPlayback();
    };
  }, [id]);

  const handlePlay = () => {
    if (!rhythm) return;
    setIsPlaying(true);
    playRhythm(rhythm.notation, rhythm.tempo_bpm, rhythm.time_signature, {
      instrument: rhythm.instrument || "snare",
    });
    const total16 = rhythm.notation.reduce((s, n) => s + n.duration_16ths, 0);
    const dur = (total16 / 4) * (60 / rhythm.tempo_bpm) * 1000 + 300;
    setTimeout(() => setIsPlaying(false), dur);
  };

  const handleStop = () => {
    stopAllPlayback();
    setIsPlaying(false);
  };

  const commitRename = async () => {
    const t = draftTitle.trim();
    setEditingTitle(false);
    if (!t || t === rhythm.title) return;
    setRhythm((r) => ({ ...r, title: t }));
    const { error } = await supabase.from("rhythms").update({ title: t }).eq("id", rhythm.id);
    if (error) toast.error("Rename failed");
  };

  const handleExport = () => {
    downloadMusicXML(rhythm.notation, rhythm.time_signature, rhythm.title, rhythm.tempo_bpm, rhythm.instrument);
  };

  const handleShare = async () => {
    const text = `${rhythm.title} — ${rhythm.tempo_bpm} BPM, ${rhythm.time_signature.numerator}/${rhythm.time_signature.denominator}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: rhythm.title, text });
      } catch {
        // user cancelled — no-op
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !rhythm) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
        <AlertCircle size={32} className="text-primary" />
        <div>
          <p className="text-lg font-semibold">Couldn't load that rhythm</p>
          <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-4 h-11 rounded-xl border border-border bg-card text-[15px] text-primary hover:bg-primary/5 transition-colors"
        >
          <ArrowLeft size={18} />
          back
        </button>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary"
        />
        <div className="text-center">
          <p className="text-lg font-semibold">Transcribing your rhythm…</p>
          <p className="text-sm text-muted-foreground mt-1">
            Quantizing taps to the grid
          </p>
        </div>
      </div>
    );
  }

  const noteCount = (rhythm.notation || []).filter((n) => !n.is_rest).length;
  const avgConfidence =
    noteCount > 0
      ? Math.round(
          ((rhythm.notation || []).filter((n) => !n.is_rest).reduce((s, n) => s + n.confidence_score, 0) /
            noteCount) *
            100
        )
      : 0;

  const visibleMatches = matches.filter((m) => m.match_confidence >= 0.75);

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden bg-background">
      <AppBackground intensity={0.75} width="max-w-2xl" />

      {/* Header */}
      <div className="relative z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-4 px-5 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-4 h-11 rounded-xl border border-border bg-card text-[15px] text-primary hover:bg-primary/5 transition-colors"
          >
            <ArrowLeft size={18} />
            back
          </button>
          <h2 className="notely-title text-[34px] leading-none">results</h2>
        </div>
      </div>

      <div className="relative z-10 flex-1 px-5 py-5 space-y-5 overflow-y-auto max-w-2xl mx-auto w-full">
        {/* Stat pills & rename */}
        <div className="flex items-center gap-2.5">
          <span className="px-4 h-9 inline-flex items-center rounded-xl border border-border bg-card text-sm tabular-nums">
            {rhythm.time_signature.numerator}/{rhythm.time_signature.denominator}
          </span>
          <span className="px-4 h-9 inline-flex items-center rounded-xl border border-border bg-card text-sm tabular-nums">
            {rhythm.tempo_bpm} bpm
          </span>
          <span className="text-xs text-muted-foreground">{noteCount} notes</span>
          <button
            onClick={() => {
              setDraftTitle(rhythm.title);
              setEditingTitle(true);
            }}
            className="ml-auto shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-xl border border-border bg-card text-sm text-primary hover:bg-primary/5 transition-colors"
          >
            <Pencil size={13} />
            rename
          </button>
        </div>

        {editingTitle ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            className="w-full text-lg bg-transparent border-b border-primary outline-none"
          />
        ) : (
          <h1 className="text-lg truncate">{rhythm.title}</h1>
        )}

        {/* Confidence indicator */}
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
          {avgConfidence >= 80 ? (
            <CheckCircle2 size={20} className="text-success shrink-0" />
          ) : (
            <AlertCircle size={20} className="text-primary shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-xs font-semibold">
              {avgConfidence >= 80 ? "High confidence" : "Some notes need review"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {avgConfidence >= 80
                ? "Taps aligned cleanly to the grid"
                : "Amber notes had timing ambiguity — fix them in the editor"}
            </p>
          </div>
          <div className="text-2xl font-black tabular-nums">{avgConfidence}%</div>
        </div>

        {/* Notation preview */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Your Rhythm
          </p>
          {matchedPattern && (
            <div className="inline-flex items-center gap-1.5 mb-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <CheckCircle2 size={13} /> Matched known pattern: {matchedPattern}
            </div>
          )}
          <NotationStaff
            notation={rhythm.notation}
            timeSignature={rhythm.time_signature}
            confidenceColors={true}
            stickingVisible={stickingVisible}
            instrument={rhythm.instrument || "snare"}
          />
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            <span className="inline-block w-2 h-2 rounded-full bg-primary mr-1" />
            Amber notes = lower confidence
          </p>
        </div>

        {/* Playback */}
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
            Playback
          </p>
          <PlaybackControls
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onStop={handleStop}
          />
        </div>

        {/* Closest matches */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles size={14} className="text-primary" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Closest Matches
            </p>
          </div>
          {visibleMatches.length > 0 ? (
            <div className="space-y-2">
              {visibleMatches.map((m, i) => (
                <motion.div
                  key={m.song_name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{m.song_name}</p>
                    {m.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {m.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-success"
                        style={{ width: `${m.match_confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums w-8 text-right">
                      {Math.round(m.match_confidence * 100)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground rounded-xl border border-border bg-card p-3">
              No close matches yet (75%+ confidence).
            </p>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="relative z-10 border-t border-border bg-background/90 backdrop-blur-sm">
        <div className="px-5 py-4 space-y-2.5 max-w-2xl mx-auto">
          <div className="flex gap-2.5">
            <button
              onClick={() => setStickingVisible((v) => !v)}
              aria-pressed={stickingVisible}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border bg-card text-sm transition-all ${
                stickingVisible
                  ? "border-primary/60 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wand2 size={15} />
              sticking
            </button>
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
            >
              <Download size={15} />
              export
            </button>
            <button
              onClick={handleShare}
              aria-label="Share"
              className="w-11 flex items-center justify-center h-10 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
            >
              <Share2 size={15} />
            </button>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => navigate("/")}
              className="flex items-center justify-center gap-1.5 px-4 h-12 rounded-xl border border-border bg-card text-sm font-medium hover:border-foreground/30 transition-all"
            >
              <RotateCcw size={16} />
              Re-record
            </button>
            <button
              onClick={() => navigate(`/editor/${rhythm.id}`)}
              className="flex-1 flex items-center justify-center gap-1.5 h-12 rounded-xl border border-primary bg-primary/10 text-primary text-sm font-bold shadow-lg active:scale-[0.98] transition-all"
            >
              <Pencil size={16} />
              Edit This
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
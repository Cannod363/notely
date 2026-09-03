import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/base44Client";
import {
  generateSticking,
  getOrnaments,
} from "@/lib/rhythmEngine";
import {
  playRhythm,
  playRawTaps,
  stopAllPlayback,
} from "@/lib/playback";
import NotationStaff from "@/components/NotationStaff";
import NotePalette from "@/components/NotePalette";
import PlaybackControls from "@/components/PlaybackControls";
import {
  ArrowLeft,
  Save,
  Undo2,
  Redo2,
  ChevronDown,
  Check,
  Loader2,
  Download,
  Share2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";
import PrintLayout from "@/components/PrintLayout";

const TIME_SIGS = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 2, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 7, denominator: 8 },
];

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rhythm, setRhythm] = useState(null);
  const [notation, setNotation] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [timeSignature, setTimeSignature] = useState({ numerator: 4, denominator: 4 });
  const [bpm, setBpm] = useState(120);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metronome, setMetronome] = useState(() => getSettings().metronomeAlwaysActive);
  const [showOriginal, setShowOriginal] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Undo/redo
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const playTimeoutRef = useRef(null);

  const loadRhythm = useCallback(async () => {
    try {
      const { data: r, error } = await supabase
        .from("rhythms")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      // Normalize old ornament strings to ornaments arrays
      const normalizedNotation = (r.notation || []).map((n) => {
        const ornaments = getOrnaments(n);
        const { ornament, ...rest } = n;
        return { ...rest, ornaments };
      });
      setRhythm(r);
      setNotation(normalizedNotation);
      setTimeSignature(r.time_signature || { numerator: 4, denominator: 4 });
      setBpm(r.tempo_bpm || 120);
      setTitle(r.title || "Untitled");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRhythm();
    return () => {
      stopAllPlayback();
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    };
  }, [id]);

  // Push current state to undo stack before a mutation
  const pushUndo = () => {
    setUndoStack((prev) => [...prev.slice(-30), notation]);
    setRedoStack([]);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    setRedoStack((prev) => [...prev, notation]);
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setNotation(prev);
    setSelectedIndex(null);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    setUndoStack((prev) => [...prev, notation]);
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setNotation(next);
    setSelectedIndex(null);
  };

  const selectedNote = selectedIndex != null ? notation[selectedIndex] : null;

  // ─── Mutations ───
  const applyDuration = (d16) => {
    if (selectedIndex == null) return;
    pushUndo();
    setNotation((prev) => {
      const next = [...prev];
      // Picking a value from the palette makes it a plain note, tuplet and all
      next[selectedIndex] = { ...next[selectedIndex], duration_16ths: d16, nv: d16, tuplet: null };
      return next;
    });
  };

  const applyDrum = (drum) => {
    if (selectedIndex == null) return;
    pushUndo();
    setNotation((prev) => {
      const next = [...prev];
      next[selectedIndex] = { ...next[selectedIndex], drum };
      return next;
    });
  };

  const applyOrnament = (ornament) => {
    if (selectedIndex == null) return;
    pushUndo();
    setNotation((prev) => {
      const next = [...prev];
      const cur = next[selectedIndex];
      const currentOrnaments = [...getOrnaments(cur)];
      const has = currentOrnaments.includes(ornament);
      const newOrnaments = has
        ? currentOrnaments.filter((o) => o !== ornament)
        : [...currentOrnaments, ornament];
      const { ornament: _old, ...rest } = cur;
      next[selectedIndex] = { ...rest, ornaments: newOrnaments };
      return next;
    });
  };

  const toggleRest = () => {
    if (selectedIndex == null) return;
    pushUndo();
    setNotation((prev) => {
      const next = [...prev];
      const cur = next[selectedIndex];
      const { ornament, ...rest } = cur;
      if (cur.is_rest) {
        next[selectedIndex] = { ...rest, is_rest: false, ornaments: [], sticking: cur.sticking || "R" };
      } else {
        next[selectedIndex] = { ...rest, is_rest: true, ornaments: [], sticking: null };
      }
      return next;
    });
  };

  const deleteNote = () => {
    if (selectedIndex == null) return;
    pushUndo();
    setNotation((prev) => {
      const next = [...prev];
      const { ornament, ...rest } = next[selectedIndex];
      next[selectedIndex] = {
        ...rest,
        is_rest: true,
        ornaments: [],
        sticking: null,
      };
      return next;
    });
  };

  const addNote = () => {
    pushUndo();
    const insertIdx = selectedIndex != null ? selectedIndex + 1 : notation.length;
    setNotation((prev) => {
      const newNote = {
        duration_16ths: 2,
        nv: 2,
        tuplet: null,
        start_time: 0,
        is_rest: false,
        ornaments: [],
        sticking: "R",
        confidence_score: 1,
        velocity: 0.7,
        drum: 0,
      };
      const next = [...prev];
      next.splice(insertIdx, 0, newNote);
      return next;
    });
    setSelectedIndex(insertIdx);
  };

  const nudgeNote = (direction) => {
    if (selectedIndex == null) return;
    const cur = notation[selectedIndex];
    if (!cur || cur.is_rest) return;
    const targetIdx = selectedIndex + direction;
    if (targetIdx < 0 || targetIdx >= notation.length) return;
    pushUndo();
    setNotation((prev) => {
      const next = [...prev];
      const curNote = next[selectedIndex];
      const target = next[targetIdx];
      next[selectedIndex] = { ...curNote, duration_16ths: target.duration_16ths, nv: target.nv, tuplet: target.tuplet };
      next[targetIdx] = { ...target, duration_16ths: curNote.duration_16ths, nv: curNote.nv, tuplet: curNote.tuplet };
      return next;
    });
    setSelectedIndex(targetIdx);
  };

  const flipSticking = (idx) => {
    pushUndo();
    setNotation((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (cur.is_rest) return prev;
      next[idx] = { ...cur, sticking: cur.sticking === "R" ? "L" : "R" };
      return next;
    });
  };

  const regenerateSticking = () => {
    pushUndo();
    setNotation((prev) => {
      const next = prev.map((n) => ({ ...n }));
      generateSticking(next);
      return next;
    });
    toast.success("Sticking regenerated");
  };

  // ─── Playback ───
  const handlePlay = () => {
    if (!notation.length) return;
    stopAllPlayback();
    setIsPlaying(true);
    let dur;
    if (showOriginal && rhythm?.raw_tap_events?.length) {
      dur = playRawTaps(rhythm.raw_tap_events, { speed });
    } else {
      dur = playRhythm(notation, bpm, timeSignature, {
        metronome,
        speed,
        instrument: rhythm?.instrument || "snare",
      });
    }
    playTimeoutRef.current = setTimeout(() => setIsPlaying(false), dur * 1000 + 200);
  };

  const handleStop = () => {
    stopAllPlayback();
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    setIsPlaying(false);
  };

  // ─── Save ───
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("rhythms")
        .update({
          notation,
          time_signature: timeSignature,
          tempo_bpm: bpm,
          title,
          status: "saved",
        })
        .eq("id", id);
      if (error) throw error;
      setRhythm((r) => ({ ...r, notation, time_signature: timeSignature, tempo_bpm: bpm, title, status: "saved" }));
      toast.success("Saved to Library");
    } catch (e) {
      toast.error("Save failed");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-2 px-4 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => navigate("/library")}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
              className="flex-1 min-w-0 text-sm font-bold bg-transparent border-b border-primary outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="flex-1 min-w-0 text-sm font-bold text-left truncate hover:text-primary transition-colors"
            >
              {title}
            </button>
          )}
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <Redo2 size={18} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>

      {/* Toolbar: tempo, time sig, sticking regen */}
      <div className="border-b border-border bg-card/50">
        <div
          className="flex items-center gap-2 px-4 py-2.5 max-w-2xl mx-auto overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {/* Time signature */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowTimeMenu(!showTimeMenu)}
              className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border bg-card text-xs font-semibold"
            >
              {timeSignature.numerator}/{timeSignature.denominator}
              <ChevronDown size={12} className="text-muted-foreground" />
            </button>
            {showTimeMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTimeMenu(false)} />
                <div className="absolute top-9 left-0 z-20 w-28 rounded-xl border border-border bg-popover shadow-xl py-1">
                  {TIME_SIGS.map((ts) => (
                    <button
                      key={`${ts.numerator}/${ts.denominator}`}
                      onClick={() => {
                        setTimeSignature(ts);
                        setShowTimeMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted flex items-center justify-between"
                    >
                      {ts.numerator}/{ts.denominator}
                      {timeSignature.numerator === ts.numerator && (
                        <Check size={12} className="text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* BPM */}
          <div className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border bg-card shrink-0">
            <button onClick={() => setBpm((b) => Math.max(40, b - 5))} className="text-muted-foreground text-sm px-0.5">−</button>
            <span className="text-xs font-semibold tabular-nums w-7 text-center">{bpm}</span>
            <button onClick={() => setBpm((b) => Math.min(500, b + 5))} className="text-muted-foreground text-sm px-0.5">+</button>
            <span className="text-[9px] text-muted-foreground">BPM</span>
          </div>

          <button
            onClick={regenerateSticking}
            className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border bg-card text-xs font-medium hover:border-primary/40 transition-all shrink-0"
          >
            <Wand2 size={13} className="text-primary" />
            Sticking
          </button>

          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border bg-card text-xs font-medium shrink-0"
          >
            <Download size={13} />
            Export
          </button>

          <button
            onClick={() => toast.success("Share link copied")}
            className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border bg-card text-xs font-medium shrink-0"
          >
            <Share2 size={13} />
          </button>
        </div>
      </div>

      {/* Notation area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-2xl mx-auto w-full">
        <NotationStaff
          notation={notation}
          timeSignature={timeSignature}
          selectedIndex={selectedIndex}
          onSelectNote={setSelectedIndex}
          stickingVisible={true}
          scrollIntoView={true}
          instrument={rhythm?.instrument || "snare"}
        />

        {/* Sticking row hint */}
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] text-muted-foreground">
            Tap a note to select · Tap an <span className="font-bold text-indigo-500">R</span>/<span className="font-bold text-pink-500">L</span> below to flip sticking
          </p>
          {selectedNote && (
            <span className="text-[10px] font-semibold text-primary">
              Note {selectedIndex + 1} selected
            </span>
          )}
        </div>

        {/* Sticking flip row */}
        <StickingFlipRow notation={notation} onFlip={flipSticking} selectedIndex={selectedIndex} />

        {/* Playback */}
        <div className="rounded-xl border border-border bg-card p-3">
          <PlaybackControls
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onStop={handleStop}
            metronome={metronome}
            onToggleMetronome={() => setMetronome(!metronome)}
            showOriginal={showOriginal}
            onToggleOriginal={() => setShowOriginal(!showOriginal)}
            hasOriginal={rhythm?.raw_tap_events?.length > 0}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        </div>

        {/* Note palette */}
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
            {selectedNote ? (selectedNote.is_rest ? "Rest Selected" : "Note Selected") : "Select a note"}
          </p>
          <NotePalette
            selectedNote={selectedNote}
            onApplyDuration={applyDuration}
            onApplyOrnament={applyOrnament}
            onToggleRest={toggleRest}
            onDeleteNote={deleteNote}
            onAddNote={addNote}
            onNudge={nudgeNote}
            instrument={rhythm?.instrument || "snare"}
            onApplyDrum={applyDrum}
          />
        </div>
      </div>

      {showExport && rhythm && (
        <PrintLayout rhythm={rhythm} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}

function StickingFlipRow({ notation, onFlip, selectedIndex }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div className="flex items-center gap-0.5 min-w-fit">
        {notation.map((note, i) => {
          const w = Math.max(18, note.duration_16ths * 24);
          return (
            <button
              key={i}
              onClick={() => !note.is_rest && onFlip(i)}
              disabled={note.is_rest}
              className={`flex items-center justify-center rounded-md text-xs font-bold transition-all ${
                note.is_rest
                  ? "opacity-20"
                  : i === selectedIndex
                  ? "bg-primary text-primary-foreground"
                  : note.sticking === "R"
                  ? "text-indigo-500 hover:bg-indigo-500/10"
                  : "text-pink-500 hover:bg-pink-500/10"
              }`}
              style={{ width: w, height: 28 }}
            >
              {note.is_rest ? "" : note.sticking || "·"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
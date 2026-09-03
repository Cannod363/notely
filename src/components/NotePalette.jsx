import React from "react";
import { DURATIONS, ORNAMENTS, getOrnaments, noteValue } from "@/lib/rhythmEngine";
import { cn } from "@/lib/utils";
import { Pause, Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";

// Which drum of the set a note sits on. Four tenors plus the two spocks, in the
// order they sit on a carrier — 4·2·1·3 then the spocks — so the row of buttons
// matches the pad you played the take on rather than running by size or number.
// The `drum` value stays keyed to size, which is what the rest of the app reads.
const TENOR_DRUMS = [
  { drum: 0, label: "4" },
  { drum: 2, label: "2" },
  { drum: 3, label: "1" },
  { drum: 1, label: "3" },
  { drum: 4, label: "5" },
  { drum: 5, label: "6" },
];

export default function NotePalette({
  selectedNote,
  onApplyDuration,
  onApplyOrnament,
  onToggleRest,
  onDeleteNote,
  onAddNote,
  onNudge,
  instrument = "snare",
  onApplyDrum,
}) {
  return (
    <div className="space-y-2.5">
      {/* Durations */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 pr-1">
          Notes
        </span>
        {DURATIONS.map((d) => {
          const active = selectedNote && !selectedNote.is_rest && noteValue(selectedNote) === d.d16;
          return (
            <button
              key={d.d16}
              onClick={() => onApplyDuration(d.d16)}
              className={cn(
                "shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-lg border transition-all",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-border bg-card hover:border-foreground/30"
              )}
            >
              <span className="text-lg leading-none">{d.symbol}</span>
              <span className="text-[8px] font-medium mt-0.5">{d.label}</span>
            </button>
          );
        })}
        <button
          onClick={onToggleRest}
          className={cn(
            "shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-lg border transition-all",
            selectedNote?.is_rest
              ? "border-primary bg-primary text-primary-foreground shadow-md"
              : "border-border bg-card hover:border-foreground/30"
          )}
        >
          <Pause size={16} />
          <span className="text-[8px] font-medium mt-0.5">Rest</span>
        </button>
      </div>

      {/* Drums — tenor takes only; a snare has nowhere else to put a note */}
      {instrument === "tenor" && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 pr-1">
            Drum
          </span>
          {TENOR_DRUMS.map((d) => {
            const active = selectedNote && !selectedNote.is_rest && (selectedNote.drum ?? 0) === d.drum;
            return (
              <button
                key={d.drum}
                onClick={() => onApplyDrum?.(d.drum)}
                disabled={!selectedNote || selectedNote.is_rest}
                className={cn(
                  "shrink-0 flex items-center justify-center w-10 h-10 rounded-lg border text-sm font-bold transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-md"
                    : "border-border bg-card hover:border-foreground/30",
                  (!selectedNote || selectedNote.is_rest) && "opacity-40"
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Ornaments */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 pr-1">
          Orna
        </span>
        {ORNAMENTS.map((o) => {
          const active = selectedNote && !selectedNote.is_rest && getOrnaments(selectedNote).includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => onApplyOrnament(o.id)}
              disabled={!selectedNote || selectedNote.is_rest}
              className={cn(
                "shrink-0 flex flex-col items-center justify-center px-2.5 h-10 rounded-lg border transition-all",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-border bg-card hover:border-foreground/30",
                (!selectedNote || selectedNote.is_rest) && "opacity-40"
              )}
            >
              <span className="text-sm font-bold leading-none">{o.short}</span>
              <span className="text-[8px] font-medium mt-0.5">{o.label}</span>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onNudge(-1)}
          disabled={!selectedNote}
          className="flex items-center gap-1 px-3 h-10 rounded-lg border border-border bg-card text-sm font-medium hover:border-foreground/30 disabled:opacity-40 transition-all"
        >
          <ChevronLeft size={16} /> Nudge
        </button>
        <button
          onClick={() => onNudge(1)}
          disabled={!selectedNote}
          className="flex items-center gap-1 px-3 h-10 rounded-lg border border-border bg-card text-sm font-medium hover:border-foreground/30 disabled:opacity-40 transition-all"
        >
          Nudge <ChevronRight size={16} />
        </button>
        <button
          onClick={onAddNote}
          className="flex items-center gap-1 px-3 h-10 rounded-lg border border-border bg-card text-sm font-medium hover:border-foreground/30 transition-all"
        >
          <Plus size={16} /> Add
        </button>
        <button
          onClick={onDeleteNote}
          disabled={!selectedNote}
          className="flex items-center gap-1 px-3 h-10 rounded-lg border border-border bg-card text-sm font-medium hover:border-destructive/30 hover:text-destructive disabled:opacity-40 transition-all ml-auto"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
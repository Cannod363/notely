import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Music4,
  Calendar,
  Lock,
  Pencil,
  ArchiveRestore,
  Trash2,
  MoreVertical,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function RhythmCard({
  rhythm,
  onDelete,          // soft delete -> archive (library view)
  onPermanentDelete, // hard delete (archive view)
  onRestore,
  onRename,
  onToggleLock,
  selectMode,
  isSelected,
  onToggleSelect,
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(rhythm.title);
  const noteCount = (rhythm.notation || []).filter((n) => !n.is_rest).length;

  const handleClick = () => {
    if (selectMode) onToggleSelect?.(rhythm.id);
    else if (!editing) navigate(`/editor/${rhythm.id}`);
  };

  const commitRename = () => {
    const t = draftTitle.trim();
    if (t && t !== rhythm.title) onRename?.(rhythm.id, t);
    else setDraftTitle(rhythm.title);
    setEditing(false);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group relative rounded-2xl border bg-card p-4 transition-all active:scale-[0.98]",
        isSelected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-foreground/30 cursor-pointer"
      )}
    >
      {rhythm.locked && (
        <div className="absolute top-2 left-2 w-5 h-5 rounded-md bg-muted flex items-center justify-center">
          <Lock size={11} className="text-primary" />
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraftTitle(rhythm.title);
                  setEditing(false);
                }
              }}
              className="w-full text-[15px] bg-transparent border-b border-primary outline-none"
            />
          ) : (
            <h3 className="text-[15px] truncate">{rhythm.title}</h3>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
            <span>{rhythm.tempo_bpm} bpm</span>
            <span>
              {rhythm.time_signature?.numerator}/{rhythm.time_signature?.denominator}
            </span>
            <span>{noteCount} notes</span>
          </div>
        </div>
        <div className="shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          {selectMode ? (
            <div
              className={cn(
                "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
                isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
              )}
            >
              {isSelected && <Check size={13} className="text-primary-foreground" />}
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <MoreVertical size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Pencil size={14} className="mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleLock?.(rhythm.id)}>
                  <Lock size={14} className="mr-2" /> {rhythm.locked ? "Unlock" : "Lock"}
                </DropdownMenuItem>
                {rhythm.archived ? (
                  <>
                    <DropdownMenuItem onClick={() => onRestore?.(rhythm.id)}>
                      <ArchiveRestore size={14} className="mr-2" /> Restore
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onPermanentDelete?.(rhythm.id)}
                      disabled={rhythm.locked}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 size={14} className="mr-2" /> Delete permanently
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete?.(rhythm.id)}
                      disabled={rhythm.locked}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 size={14} className="mr-2" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Mini notation preview */}
      <div className="h-12 rounded-lg bg-muted/40 flex items-center justify-center mb-2 overflow-hidden">
        <div className="flex items-center gap-0.5 px-2">
          {(rhythm.notation || []).slice(0, 24).map((n, i) =>
            n.is_rest ? (
              <div key={i} className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            ) : (
              <div
                key={i}
                className="rounded-full bg-foreground/70"
                style={{
                  width: 4,
                  height: n.duration_16ths >= 4 ? 10 : 6,
                }}
              />
            )
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Calendar size={13} className="text-primary" />
          {rhythm.created_date
            ? format(new Date(rhythm.created_date), "MMM d, yyyy")
            : ""}
        </span>
        <span className="flex items-center gap-1">
          <Music4 size={12} />
          {rhythm.status === "draft" ? "Draft" : "Saved"}
        </span>
      </div>
    </div>
  );
}
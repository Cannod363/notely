import React from "react";
import { Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PlaybackControls({ isPlaying, onPlay, onStop }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={isPlaying ? onStop : onPlay}
        className={cn(
          "flex items-center gap-2 px-5 h-10 rounded-xl border bg-card text-sm transition-all active:scale-95",
          isPlaying
            ? "border-destructive/60 text-destructive"
            : "border-border text-primary hover:bg-primary/5"
        )}
      >
        {isPlaying ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        {isPlaying ? "stop" : "play"}
      </button>
    </div>
  );
}
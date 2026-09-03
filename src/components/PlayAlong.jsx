import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Square, RotateCcw, X } from "lucide-react";

// The play-along half of the sheet page: the pad you tap while the score
// plays, and the card that reports how close you were afterwards. Timing and
// scoring live outside this file — everything here is presentation and the
// tap handler.

const JUDGEMENT_COLOR = {
  perfect: "hsl(var(--primary))",
  good: "hsl(var(--gold))",
  loose: "hsl(var(--destructive))",
  missed: "hsl(var(--muted-foreground))",
};

const TONE_COLOR = {
  great: "hsl(var(--primary))",
  good: "hsl(var(--gold))",
  ok: "hsl(var(--muted-foreground))",
  weak: "hsl(var(--destructive))",
};

// ─── The pad ───
// One big target rather than a scatter of them: play-along is about when you
// hit, not which drum, so anywhere on the pad counts as a stroke.
export function PlayAlongPad({ countingIn, beatsLeft, taps, lastTapKey, onTap, onStop }) {
  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-primary">
          {countingIn ? "count in" : "play along"}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{taps} strokes</span>
      </div>

      <button
        onPointerDown={(e) => {
          e.preventDefault();
          onTap(e);
        }}
        className="relative w-full h-40 rounded-2xl border border-border bg-background overflow-hidden active:border-primary/60 transition-colors"
        style={{ touchAction: "manipulation" }}
        aria-label="Tap in time with the score"
      >
        <motion.span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            width: 260,
            height: 160,
            background: countingIn
              ? "radial-gradient(ellipse, rgba(150,235,90,0.30) 0%, transparent 62%)"
              : "radial-gradient(ellipse, rgba(255,169,60,0.30) 0%, transparent 62%)",
          }}
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: countingIn ? 0.6 : 1.8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Ripple on every stroke, so the pad reads as responding even when the
            score underneath is loud. */}
        <AnimatePresence>
          {lastTapKey != null && (
            <motion.span
              key={lastTapKey}
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full border-2 pointer-events-none"
              style={{ borderColor: "hsl(var(--primary))", x: "-50%", y: "-50%" }}
              initial={{ width: 60, height: 60, opacity: 0.6 }}
              animate={{ width: 230, height: 230, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        <span className="relative flex flex-col items-center justify-center h-full gap-1">
          {countingIn ? (
            <>
              <span className="font-display text-[44px] leading-none font-semibold text-[hsl(var(--success))] tabular-nums">
                {beatsLeft > 0 ? beatsLeft : "go"}
              </span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                get ready
              </span>
            </>
          ) : (
            <>
              <span className="font-display text-[20px] font-semibold text-foreground">tap here</span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                or press space
              </span>
            </>
          )}
        </span>
      </button>

      <button
        onClick={onStop}
        className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Square size={14} />
        stop and score
      </button>
    </div>
  );
}

// ─── Timing scatter ───
// The whole take on one strip: time left to right, how early or late each
// stroke was up and down. The shaded band is the ±25 ms "perfect" zone, so a
// tidy run reads as a line hugging the middle and a rushed one visibly drifts.
function TimingStrip({ result }) {
  const W = 300;
  const H = 64;
  const mid = H / 2;
  const span = Math.max(1, result.matches[result.matches.length - 1]?.at || 1);
  const yOf = (errorMs) => mid + (errorMs / result.windowMs) * (mid - 7);
  const perfectBand = (25 / result.windowMs) * (mid - 7);

  return (
    <div className="rounded-lg border border-border bg-background/60 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
        <rect
          x="0"
          y={mid - perfectBand}
          width={W}
          height={perfectBand * 2}
          fill="hsl(var(--primary))"
          fillOpacity={0.08}
        />
        <line
          x1="0"
          y1={mid}
          x2={W}
          y2={mid}
          stroke="hsl(var(--primary))"
          strokeOpacity={0.45}
          strokeDasharray="3 3"
        />
        {result.matches.map((m, i) => {
          const x = 5 + (m.at / span) * (W - 10);
          if (m.tapAt === null) {
            return (
              <g key={i} stroke={JUDGEMENT_COLOR.missed} strokeOpacity={0.55} strokeWidth={1.2}>
                <line x1={x - 2.5} y1={mid - 2.5} x2={x + 2.5} y2={mid + 2.5} />
                <line x1={x - 2.5} y1={mid + 2.5} x2={x + 2.5} y2={mid - 2.5} />
              </g>
            );
          }
          return (
            <circle
              key={i}
              cx={x}
              cy={Math.max(4, Math.min(H - 4, yOf(m.errorMs)))}
              r={2.4}
              fill={JUDGEMENT_COLOR[m.judgement]}
              fillOpacity={0.9}
            />
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground/70 px-0.5">
        <span>early</span>
        <span>on the grid</span>
        <span>late</span>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-semibold tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── The scorecard ───
export function PlayAlongResult({ result, onRetry, onDismiss }) {
  const ring = 2 * Math.PI * 34;
  const tone = TONE_COLOR[result.grade.tone];
  const bias = Math.round(result.biasMs);
  const biasHint =
    result.hits === 0
      ? "nothing landed"
      : Math.abs(bias) < 8
      ? "sitting right on it"
      : bias < 0
      ? `${Math.abs(bias)} ms ahead — you're rushing`
      : `${bias} ms behind — you're dragging`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90" aria-hidden>
            <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
            <motion.circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={tone}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ring}
              initial={{ strokeDashoffset: ring }}
              animate={{ strokeDashoffset: ring * (1 - result.score / 100) }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-[24px] font-semibold tabular-nums">
            {result.score}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-display text-[20px] font-semibold leading-tight" style={{ color: tone }}>
            {result.grade.label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {result.hits} of {result.expectedCount} notes caught
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">{biasHint}</p>
        </div>

        <button onClick={onDismiss} aria-label="Close scorecard" className="self-start shrink-0">
          <X size={16} className="text-muted-foreground" />
        </button>
      </div>

      <TimingStrip result={result} />

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="timing"
          value={`±${Math.round(result.meanAbsErrorMs)} ms`}
          hint="average distance off the note"
        />
        <Stat
          label="consistency"
          value={`±${Math.round(result.spreadMs)} ms`}
          hint="spread around your own feel"
        />
        <Stat label="missed" value={result.missed} hint="notes with no stroke" />
        <Stat label="extra" value={result.extra} hint="strokes with no note" />
      </div>

      {/* Where the strokes that did land fell, at a glance. */}
      {result.hits > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-2 rounded-full overflow-hidden bg-background">
            {[
              ["perfect", result.perfect],
              ["good", result.good],
              ["loose", result.loose],
            ].map(([key, n]) =>
              n > 0 ? (
                <div
                  key={key}
                  style={{ width: `${(n / result.hits) * 100}%`, background: JUDGEMENT_COLOR[key] }}
                />
              ) : null
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {[
              ["perfect", result.perfect, "≤25 ms"],
              ["good", result.good, "≤60 ms"],
              ["loose", result.loose, "beyond"],
            ].map(([key, n, range]) => (
              <span key={key} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: JUDGEMENT_COLOR[key] }}
                />
                {n} {key}
                <span className="text-muted-foreground/60">({range})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 flex-1 h-10 rounded-xl border border-primary bg-primary/10 text-primary text-sm font-bold active:scale-[0.98] transition-all"
        >
          <RotateCcw size={14} />
          again
        </button>
        <button
          onClick={onDismiss}
          className="h-10 px-5 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          done
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-snug">
        Scored on how many notes you caught and how far each stroke sat from the
        grid, inside a ±{Math.round(result.windowMs)} ms window. It's a guide, not a
        judge — Notely can mishear a stroke.
      </p>
    </motion.div>
  );
}

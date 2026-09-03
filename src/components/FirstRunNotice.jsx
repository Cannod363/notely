import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { getSettings, updateSetting } from "@/lib/settings";

// Shown once, the first time the app opens on a device. Notely guesses: it
// quantises taps onto a grid and reads other people's MusicXML, and both of
// those are judgement calls it will sometimes get wrong. Better to say so
// before someone trusts a transcription than to let them find out from a
// wrong-looking bar.
export default function FirstRunNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getSettings().hasSeenAccuracyNotice) setOpen(true);
  }, []);

  const acknowledge = () => {
    updateSetting("hasSeenAccuracyNotice", true);
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="accuracy-notice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: "rgba(8,7,6,0.82)", backdropFilter: "blur(3px)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="accuracy-notice-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 shrink-0">
                <AlertTriangle size={19} className="text-primary" />
              </span>
              <h2
                id="accuracy-notice-title"
                className="font-display text-[19px] font-semibold leading-tight"
              >
                Notely is not 100% accurate
              </h2>
            </div>

            <div className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                Notely <span className="text-foreground font-semibold">will make mistakes</span>.
                Transcription reads your taps and guesses at the rhythm you meant,
                imported scores are read by a parser that doesn't understand every
                file, and play-along scores are one algorithm's opinion of your
                timing.
              </p>
              <p>
                Check the notation before you trust it, and edit anything it got
                wrong — the transcription is a starting point, not the final word.
              </p>
            </div>

            <button
              onClick={acknowledge}
              className="mt-6 w-full h-11 rounded-xl border border-primary bg-primary/10 text-primary text-sm font-bold active:scale-[0.98] transition-all"
            >
              got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

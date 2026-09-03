import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import splashBg from "@/assets/splash-bg.png";

export default function SplashScreen({ onFinish }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const holdTimer = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(holdTimer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onFinish}>
      {visible && (
        <motion.div
          key="splash"
          // The backdrop itself never fades — only its exit does — so the app
          // underneath is never visible while the artwork is fading in.
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
          style={{ background: "#080706" }}
        >
          {/* Squiggle artwork at full design size — the wordmark region was
              painted out of this asset and is re-rendered below as real text
              so it can be sized independently of the background art. */}
          <img
            src={splashBg}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="relative flex flex-col items-center"
          >
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                letterSpacing: "-0.03em",
                fontSize: "3.75rem",
                backgroundImage: "linear-gradient(135deg, #C99A4E 0%, #8A6329 55%, #5F451F 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              notely
            </h1>
            <p
              className="mt-3 text-center leading-snug text-gold"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 400,
                letterSpacing: "0.04em",
                fontSize: "0.875rem",
              }}
            >
              write music.
              <br />
              sound ideas.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

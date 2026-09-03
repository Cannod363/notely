import React, { useMemo, useRef, useEffect } from "react";
import { engrave } from "@/lib/engraving";
import SystemRenderer from "@/components/notation/SystemRenderer";
import { getSettings } from "@/lib/settings";

// Scroll-mode notation staff for the editor and result screens.
// Renders a single horizontally-scrolling system using the engraving engine.
export default function NotationStaff({
  notation,
  timeSignature,
  selectedIndex,
  onSelectNote,
  stickingVisible = true,
  confidenceColors = true,
  scrollIntoView = false,
  instrument = "snare",
}) {
  const scrollRef = useRef(null);
  const { showMeasureNumbers } = useMemo(() => getSettings(), []);

  const { systems, totalWidth } = useMemo(
    () => engrave(notation, timeSignature),
    [notation, timeSignature]
  );

  const system = systems[0] || { items: [], barlines: [], beamGroups: [], width: 320 };

  useEffect(() => {
    if (scrollIntoView && selectedIndex != null && scrollRef.current) {
      const item = system.items.find((it) => it.index === selectedIndex);
      if (item) {
        scrollRef.current.scrollTo({ left: Math.max(0, item.x - 100), behavior: "smooth" });
      }
    }
  }, [selectedIndex, scrollIntoView, system]);

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto overflow-y-hidden rounded-xl bg-card border border-border"
      style={{ scrollbarWidth: "thin" }}
    >
      <div style={{ width: Math.max(totalWidth, 320), minWidth: "100%" }}>
        <SystemRenderer
          system={system}
          timeSignature={timeSignature}
          showClef={true}
          showTimeSig={true}
          selectedIndex={selectedIndex}
          onSelectNote={onSelectNote}
          stickingVisible={stickingVisible}
          confidenceColors={confidenceColors}
          showMeasureNumbers={showMeasureNumbers}
          interactive={true}
          instrument={instrument}
        />
      </div>
    </div>
  );
}
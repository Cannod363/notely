import React, { useMemo } from "react";
import { engrave } from "@/lib/engraving";
import { downloadMusicXML } from "@/lib/musicxml";
import SystemRenderer from "@/components/Notation/SystemRenderer";
import { Printer, FileCode2, X } from "lucide-react";
import { toast } from "sonner";

// Print/export modal: renders notation in page layout (Letter-size, wrapped systems)
// with a title block. Print via browser (→ Save as PDF), or export MusicXML.
export default function PrintLayout({ rhythm, onClose }) {
  const { systems } = useMemo(
    () => engrave(rhythm.notation || [], rhythm.time_signature || { numerator: 4, denominator: 4 }, { systemWidth: 700 }),
    [rhythm]
  );

  const handlePrint = () => {
    window.print();
  };

  const handleExportXML = () => {
    downloadMusicXML(rhythm.notation, rhythm.time_signature, rhythm.title, rhythm.tempo_bpm, rhythm.instrument);
    toast.success("MusicXML downloaded");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="print-layout bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 p-8 text-black">
        {/* Title block */}
        <div className="text-center mb-6 pb-4 border-b-2 border-black">
          <h1 className="text-2xl font-bold tracking-tight">{rhythm.title}</h1>
          <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-700">
            <span className="font-mono">♩ = {rhythm.tempo_bpm}</span>
            <span>·</span>
            <span>{rhythm.time_signature?.numerator}/{rhythm.time_signature?.denominator}</span>
            <span>·</span>
            <span>Snare Drum</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Notation — page layout (wrapped systems) */}
        <div className="space-y-3">
          {systems.map((system, i) => (
            <div key={i} className="overflow-x-auto print-system">
              <SystemRenderer
                system={system}
                timeSignature={rhythm.time_signature}
                showClef={i === 0}
                showTimeSig={i === 0}
                stickingVisible={true}
                confidenceColors={false}
                interactive={false}
              />
            </div>
          ))}
        </div>

        {/* Action buttons (hidden in print) */}
        <div className="no-print flex items-center justify-center gap-3 mt-8 pt-4 border-t border-gray-200">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 h-11 rounded-xl bg-black text-white text-sm font-bold hover:bg-gray-800 transition-colors"
          >
            <Printer size={16} />
            Print / Save PDF
          </button>
          <button
            onClick={handleExportXML}
            className="flex items-center gap-2 px-5 h-11 rounded-xl border-2 border-black text-black text-sm font-bold hover:bg-gray-100 transition-colors"
          >
            <FileCode2 size={16} />
            Export MusicXML
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 h-11 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <X size={16} />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
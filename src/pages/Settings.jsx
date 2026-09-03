import React, { useState } from "react";
import { getSettings, updateSetting } from "@/lib/settings";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, Check, Volume2, VolumeX } from "lucide-react";

const TIME_SIGS = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 2, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 7, denominator: 8 },
];

export default function Settings() {
  const [settings, setSettings] = useState(getSettings());
  const [openMenu, setOpenMenu] = useState(null);

  const update = (key, value) => {
    const next = updateSetting(key, value);
    setSettings(next);
  };

  return (
    <div className="px-5 pt-6 pb-24 min-h-screen">
      <h1 className="notely-title text-[44px] leading-none text-center mb-9">settings</h1>

      {/* Metronome */}
      <Section title="metronome">
        <p className="text-[15px] text-muted-foreground mb-3">volume</p>
        <div className="flex items-center gap-4">
          <Slider
            value={[settings.metronomeVolume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={([v]) => update("metronomeVolume", v)}
            className="flex-1"
          />
          {settings.metronomeVolume === 0 ? (
            <VolumeX size={26} className="text-primary shrink-0" />
          ) : (
            <Volume2 size={26} className="text-primary shrink-0" />
          )}
        </div>
        <ToggleRow
          label="always active"
          value={settings.metronomeAlwaysActive}
          onChange={(v) => update("metronomeAlwaysActive", v)}
        />
      </Section>

      {/* General */}
      <Section title="general">
        <ToggleRow
          label="auto advance"
          value={settings.autoAdvance}
          onChange={(v) => update("autoAdvance", v)}
        />
      </Section>

      {/* Recording Defaults */}
      <Section title="recording defaults">
        <div className="flex items-center justify-between">
          <span className="text-[15px] text-muted-foreground">default time signature</span>
          <Dropdown
            open={openMenu === "ts"}
            onToggle={() => setOpenMenu(openMenu === "ts" ? null : "ts")}
            value={`${settings.defaultTimeSignature.numerator}/${settings.defaultTimeSignature.denominator}`}
            options={TIME_SIGS.map((ts) => ({
              label: `${ts.numerator}/${ts.denominator}`,
              onClick: () => {
                update("defaultTimeSignature", ts);
                setOpenMenu(null);
              },
              selected:
                settings.defaultTimeSignature.numerator === ts.numerator &&
                settings.defaultTimeSignature.denominator === ts.denominator,
            }))}
          />
        </div>
        <div className="flex items-center justify-between mt-6">
          <span className="text-[15px] text-muted-foreground">default instrument</span>
          <Dropdown
            open={openMenu === "instrument"}
            onToggle={() => setOpenMenu(openMenu === "instrument" ? null : "instrument")}
            value={settings.defaultInstrument === "tenor" ? "tenors" : "snare"}
            options={[
              { id: "snare", label: "snare" },
              { id: "tenor", label: "tenors" },
            ].map((o) => ({
              label: o.label,
              onClick: () => {
                update("defaultInstrument", o.id);
                setOpenMenu(null);
              },
              selected: (settings.defaultInstrument || "snare") === o.id,
            }))}
          />
        </div>
        <div className="flex items-center justify-between mt-6">
          <span className="text-[15px] text-muted-foreground">default tempo</span>
          <div className="flex items-center gap-2">
            <Stepper
              value={settings.defaultTempo}
              min={40}
              max={500}
              step={5}
              onChange={(v) => update("defaultTempo", v)}
            />
            <span className="text-xs text-muted-foreground">bpm</span>
          </div>
        </div>
      </Section>

      {/* Notation Display */}
      <Section title="notation">
        <ToggleRow
          label="show measure numbers"
          value={settings.showMeasureNumbers}
          onChange={(v) => update("showMeasureNumbers", v)}
        />
      </Section>

      <p className="text-center text-[11px] text-muted-foreground mt-10">
        Notely · Rhythm Transcription & Editor
      </p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="text-[19px] text-primary mb-3">{title}</h2>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between mt-6">
      <span className="text-[15px] text-muted-foreground">{label}</span>
      {/* Visual switch matches the mockup (46x28); the button keeps a 44px
          tall hit area so it stays within iOS touch-target guidance. */}
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={label}
        className="flex items-center justify-end h-11 pl-4"
      >
        <span
          className={`relative block w-[46px] h-[28px] rounded-full transition-colors ${
            value ? "bg-primary" : "bg-secondary"
          }`}
        >
          <span
            className={`absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full shadow transition-transform ${
              value ? "translate-x-[18px] bg-[#4a3418]" : "bg-muted-foreground"
            }`}
          />
        </span>
      </button>
    </div>
  );
}

function Stepper({ value, min, max, step, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm"
      >
        −
      </button>
      <span className="text-sm font-semibold tabular-nums w-8 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm"
      >
        +
      </button>
    </div>
  );
}

function Dropdown({ open, onToggle, value, options }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center justify-between gap-3 w-[140px] px-4 h-11 rounded-xl border border-border bg-card text-[15px] text-primary"
      >
        {value}
        <ChevronDown size={16} className="text-primary" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute top-[50px] right-0 z-20 w-[140px] rounded-xl border border-border bg-popover shadow-xl py-1">
            {options.map((opt) => (
              <button
                key={opt.label}
                onClick={opt.onClick}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted flex items-center justify-between"
              >
                {opt.label}
                {opt.selected && <Check size={14} className="text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

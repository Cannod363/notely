// ─── User Settings (localStorage) ───

const KEY = "mark1_settings";

const DEFAULTS = {
  defaultTimeSignature: { numerator: 4, denominator: 4 },
  defaultTempo: 120,
  defaultInstrument: "snare",
  metronomeSound: "click",
  metronomeAlwaysActive: false,
  metronomeVolume: 0.8,
  autoAdvance: true,
  stickingConvention: "alternating",
  showMeasureNumbers: true,
  // Cleared on a fresh install, so the accuracy notice shows once and then
  // stays out of the way.
  hasSeenAccuracyNotice: false,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function updateSetting(key, value) {
  const current = getSettings();
  const next = { ...current, [key]: value };
  saveSettings(next);
  return next;
}
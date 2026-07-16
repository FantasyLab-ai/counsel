// settings.ts — the app's persisted preferences. Small, honest, local.
// Every Settings row that LOOKS interactive must actually work — values
// persist across sessions and the rest of the app reads them from here.

export interface CounselSettings {
  showMathByDefault: boolean;
  alertThreshold: "High" | "Moderate";
  tone: "Direct" | "Gentle";
  briefTime: string; // "7:30 AM"
  onlyRealChanges: boolean;
  quietHours: string; // "9 PM–7 AM"
}

const KEY = "counsel.settings";

const DEFAULTS: CounselSettings = {
  showMathByDefault: true,
  alertThreshold: "Moderate",
  tone: "Direct",
  briefTime: "7:30 AM",
  onlyRealChanges: true,
  quietHours: "9 PM–7 AM",
};

export function getSettings(): CounselSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSetting<K extends keyof CounselSettings>(key: K, value: CounselSettings[K]): CounselSettings {
  const s = getSettings();
  s[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* preference just won't persist */
  }
  return s;
}

// Tap-to-cycle options for the chevron rows.
export const CYCLES: { [K in "alertThreshold" | "tone" | "briefTime" | "quietHours"]: CounselSettings[K][] } = {
  alertThreshold: ["Moderate", "High"],
  tone: ["Direct", "Gentle"],
  briefTime: ["7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM"],
  quietHours: ["9 PM–7 AM", "10 PM–6 AM", "off"],
};

export function cycleSetting<K extends keyof typeof CYCLES>(key: K): CounselSettings {
  const s = getSettings();
  const opts = CYCLES[key] as CounselSettings[K][];
  const idx = opts.indexOf(s[key] as CounselSettings[K]);
  return setSetting(key, opts[(idx + 1) % opts.length]);
}

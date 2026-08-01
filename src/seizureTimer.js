import { Preferences } from "@capacitor/preferences";

const KEY = "aura-active-seizure";
export const ALERT_SEC = 5 * 60;      // status epilepticus riba
export const STALE_SEC = 60 * 60;     // po valandos laikmatis nebelaikomas patikimu

/**
 * Rašoma TIESIAI į Preferences, apeinant pagrindinį įrašymą.
 * Pagrindinis `update()` yra debounce'intas 700 ms — jei programėlė būtų nužudyta
 * per tą langą, priepuolio pradžia dingtų. Čia to leisti negalima.
 */
export async function startTimer(at = Date.now()) {
  await Preferences.set({ key: KEY, value: JSON.stringify({ startedAt: at }) });
  return at;
}

export async function loadTimer() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return null;
    const v = JSON.parse(value);
    if (!v || typeof v.startedAt !== "number") return null;
    if (v.startedAt > Date.now() + 60000) return null;   // laikrodis pasuktas atgal
    return v;
  } catch (e) { return null; }
}

export async function clearTimer() {
  await Preferences.remove({ key: KEY });
}

/** Praėjęs laikas visada iš sieninio laikrodžio, ne iš setInterval tiksėjimų. */
export const elapsedSec = (startedAt, now = Date.now()) => Math.max(0, Math.floor((now - startedAt) / 1000));

export const isStale = (startedAt, now = Date.now()) => elapsedSec(startedAt, now) > STALE_SEC;

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Išmatuotos sekundės paverčiamos esamu ataskaitos intervalu, kad senoji logika nesulūžtų. */
export function bucketOf(sec) {
  if (sec < 60) return "<1 min";
  if (sec < 120) return "1–2 min";
  if (sec <= 300) return "2–5 min";
  return ">5 min";
}

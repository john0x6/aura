import { Preferences } from "@capacitor/preferences";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";

export const SCHEMA_VERSION = 1;
const isNative = () => Capacitor.isNativePlatform();
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

/** Nuskaito VISUS Preferences raktus, o ne vien "aura-data" — kad ateity pridėti raktai
 *  nebūtų tyliai praleisti iš atsarginės kopijos. */
async function collect() {
  const { keys } = await Preferences.keys();
  const data = {};
  for (const k of keys) {
    const { value } = await Preferences.get({ key: k });
    if (value != null) data[k] = value;      // laikom kaip eilutes: nereikia spėlioti tipo
  }
  return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

/**
 * Sukuria kopiją ir atiduoda ją vartotojui per Android dalinimosi langą.
 * Tinklo kodo nėra: failas parašomas į cache, o kur jį siųsti, sprendžia vartotojas.
 */
export async function exportBackup(prefix = "aura-backup") {
  const payload = await collect();
  const json = JSON.stringify(payload, null, 2);
  const name = `${prefix}-${stamp()}.json`;

  if (!isNative()) {
    // naršyklėje – įprastas atsisiuntimas
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, name, shared: false };
  }

  const res = await Filesystem.writeFile({
    path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: name, url: res.uri, dialogTitle: name });
    return { ok: true, name, shared: true };
  } catch (e) {
    // vartotojas uždarė dalinimosi langą – failas vis tiek egzistuoja
    return { ok: true, name, shared: false, uri: res.uri };
  }
}

/** Tyli kopija prieš atkūrimą: jei importuojamas failas pasirodys ne toks, seni duomenys nedingsta. */
export async function safetyBackup() {
  const payload = await collect();
  const json = JSON.stringify(payload);
  const name = `aura-before-restore-${stamp()}.json`;
  if (!isNative()) {
    try { localStorage.setItem("aura-safety-backup", json); } catch (e) { /* pilna atmintis */ }
    return { ok: true, name };
  }
  await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
  return { ok: true, name };
}

/** Tikrina formą prieš liečiant esamus duomenis. Klaidos kodas grąžinamas, o ne tekstas —
 *  vertimą parenka sąsaja. */
export function validateBackup(raw) {
  let p;
  try { p = JSON.parse(raw); } catch (e) { return { ok: false, code: "parse" }; }
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, code: "shape" };
  if (typeof p.schemaVersion !== "number") return { ok: false, code: "shape" };
  if (p.schemaVersion > SCHEMA_VERSION) return { ok: false, code: "newer" };
  if (!p.data || typeof p.data !== "object" || Array.isArray(p.data)) return { ok: false, code: "shape" };
  if (!Object.keys(p.data).length) return { ok: false, code: "empty" };

  const main = p.data["aura-data"];
  if (typeof main !== "string") return { ok: false, code: "shape" };
  let d;
  try { d = JSON.parse(main); } catch (e) { return { ok: false, code: "shape" }; }
  for (const f of ["meds", "seizures", "notes", "events"]) {
    if (f in d && !Array.isArray(d[f])) return { ok: false, code: "shape" };
  }
  const counts = {
    seizures: (d.seizures || []).length,
    meds: (d.meds || []).length,
    notes: (d.notes || []).length,
    events: (d.events || []).length,
  };
  return { ok: true, payload: p, counts, exportedAt: p.exportedAt || null };
}

/** Atkuria patikrintą kopiją. Prieš tai visada pasidaro apsauginę esamų duomenų kopiją. */
export async function restoreBackup(payload) {
  await safetyBackup();
  await Preferences.clear();
  for (const [k, v] of Object.entries(payload.data)) {
    await Preferences.set({ key: k, value: String(v) });
  }
  return { ok: true };
}

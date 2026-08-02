import { Preferences } from "@capacitor/preferences";

const KEY = "aura-data";

// Preferences veikia ir naršyklėje (localStorage), ir native (SharedPreferences / UserDefaults),
// todėl atskiros web/native šakos nereikia.
export async function load() {
  const { value } = await Preferences.get({ key: KEY });
  return value ? JSON.parse(value) : null;
}

export async function save(data) {
  await Preferences.set({ key: KEY, value: JSON.stringify(data) });
  return true;
}

export async function clear() {
  await Preferences.remove({ key: KEY });
}

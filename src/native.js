import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App as CapApp } from "@capacitor/app";

export const isNative = () => Capacitor.isNativePlatform();
const isAndroid = () => Capacitor.getPlatform() === "android";

/**
 * Splash slepiamas ne pagal taimerį, o kai duomenys jau užkrauti —
 * kitaip vartotojas pamatytų tuščią sąrašą, kuris po akimirkos „šokteltų“.
 */
export async function hideSplash() {
  if (!isNative()) return;
  try { await SplashScreen.hide({ fadeOutDuration: 250 }); } catch (e) { /* jau paslėptas */ }
}

export async function initStatusBar() {
  if (!isNative()) return;
  try {
    // Style.Light = tamsus tekstas šviesiam fonui (mūsų fonas kreminis)
    await StatusBar.setStyle({ style: Style.Light });
    if (isAndroid()) {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: "#F0EEE5" });
    }
  } catch (e) { /* kai kuriuose įrenginiuose neprivaloma */ }
}

/**
 * Android „atgal“ mygtukas. Be šito pirmas paspaudimas iškart uždaro programėlę —
 * net kai atidarytas lapas su nebaigtu įrašu.
 */
export function onBackButton(handler) {
  if (!isNative()) return () => {};
  const p = CapApp.addListener("backButton", handler);
  return () => { p.then((h) => h.remove()).catch(() => {}); };
}

export function exitApp() {
  if (isNative()) CapApp.exitApp();
}

/**
 * Grįžimas iš fono. Svarbu ne tik native: programėlė palikta atidaryta per naktį
 * rodytų vakarykštę dieną, nes „šiandien“ apskaičiuojama piešiant.
 */
export function onResume(handler) {
  const cleanups = [];
  if (isNative()) {
    const p = CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) handler(); });
    cleanups.push(() => p.then((h) => h.remove()).catch(() => {}));
  }
  const onVis = () => { if (document.visibilityState === "visible") handler(); };
  document.addEventListener("visibilitychange", onVis);
  cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
  return () => cleanups.forEach((c) => c());
}

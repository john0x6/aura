import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App as CapApp } from "@capacitor/app";
import { Share } from "@capacitor/share";

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
    if (isAndroid()) await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (e) { /* kai kuriuose įrenginiuose neprivaloma */ }
}

/**
 * Sistemos juostų atsargos, kai WebView jų nepraneša per CSS `env()`.
 *
 * Nuo Android 15 langas visada piešiamas PO būsenos ir naršymo juostomis —
 * atsisakyti to nebegalima. Capacitor tokiu atveju siūlo apkarpyti WebView
 * paraštėmis (`adjustMarginsForEdgeToEdge`), bet tos paraštės nuspalvinamos
 * sistemos DayNight fonu, o ne programėlės tema: pasirinkus tamsią temą
 * šviesiame telefone viršus ir apačia likdavo balti. Todėl paraštės išjungtos,
 * o vietą juostoms palieka pati programėlė.
 *
 * `env(safe-area-inset-*)` tam ir skirtas, tik WebView jį teisingai praneša nuo
 * 140 versijos. Senesnėje gaunam nulius, ir antraštė atsidurtų po laikrodžiu.
 * Tada viršų imam iš `StatusBar.getInfo()` (tikras dp aukštis), o apačiai lieka
 * gestų juostos plotis. Iki Android 15 langas įsprausdinamas pats, ir jokių
 * atsargų nereikia.
 */
export async function systemBarInsets() {
  if (!isNative() || !isAndroid()) return null;
  const m = /Android (\d+)/.exec(navigator.userAgent || "");
  if (!m || Number(m[1]) < 15) return null;
  let top = 0;
  try { top = (await StatusBar.getInfo()).height || 0; } catch (e) { /* liks atsarginis */ }
  return { top: top || 28, bottom: 24 };
}

/**
 * Būsenos juosta perpiešiama kartu su tema. Spalva paduodama HEX, ne CSS
 * kintamuoju: čia jau native pusė, ir `var(--c-bg)` jai nieko nereiškia.
 *
 * Style.Light = tamsus tekstas šviesiam fonui; Style.Dark = šviesus tekstas.
 * Pavadinimai atvirkštiniai tam, ko tikiesi, todėl verta perskaityti du kartus.
 */
export async function setNativeTheme(bgHex, dark) {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (isAndroid()) await StatusBar.setBackgroundColor({ color: bgHex });
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
 * Dalinimosi langas atsiliepimui.
 *
 * `mailto:` reikalauja, kad telefone būtų sukonfigūruota pašto programa. Jos
 * neturint niekas neįvyksta ir apie tai nepranešama. Dalinimasis veikia ir tada,
 * bet adresatą renkasi vartotojas, todėl čia jis yra antras kelias, ne pirmas.
 *
 * Grąžina `false`, kai langas neatsidarė arba vartotojas jį atšaukė, kad
 * sąsaja neteigtų įvykus to, kas neįvyko.
 */
export async function shareText(title, text) {
  if (!isNative()) return false;
  try {
    const can = await Share.canShare();
    if (!can.value) return false;
    await Share.share({ title, text, dialogTitle: title });
    return true;
  } catch (e) {
    return false;   // atšaukimas irgi patenka čia: Capacitor meta klaidą
  }
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

import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { dkey, addDays, doseAt, notifId, doseKey, followKey } from "./dates";

export const isNative = () => Capacitor.isNativePlatform();
const isAndroid = () => Capacitor.getPlatform() === "android";

export const FOLLOWUP_MIN = 30;
const BACKUP_ID = 1900000001;   // už doseKey/followKey hash'ų ribų
const HORIZON_DAYS = 14;
const MAX_PENDING = 400;   // Android riba ~500 vienai programėlei; laikom atsargą

export async function permissionState() {
  if (!isNative()) return "unsupported";
  const p = await LocalNotifications.checkPermissions();
  return p.display; // "granted" | "denied" | "prompt"
}

export async function requestPermission() {
  if (!isNative()) return false;
  const p = await LocalNotifications.requestPermissions();
  return p.display === "granted";
}

export async function pendingCount() {
  if (!isNative()) return null;
  try { return (await LocalNotifications.getPending()).notifications.length; }
  catch (e) { return null; }
}

export async function cancelAll() {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel(pending);
}

/**
 * Sudaro konkrečių laiko taškų sąrašą artimiausioms dienoms.
 *
 * Pakartojami žadintuvai (schedule.on) yra trapiausias primityvas: juos nutildo
 * DND, riboja Doze, o po force-stop jie nebeatsistato. Todėl planuojam tikslius
 * `at` momentus ir papildom sąrašą kiekvieną kartą atidarius programėlę.
 *
 * Kiekvienai nepažymėtai dozei — VIENAS pakartojimas po 30 min. Be eskalacijos:
 * begalinis kalimas baigiasi tuo, kad vartotojas išjungia pranešimus visai.
 */
export function planNotifications(meds, doseLog, t, now = new Date()) {
  const perDay = meds.reduce((a, m) => a + m.times.length, 0);
  if (!perDay) return [];
  const days = Math.max(1, Math.min(HORIZON_DAYS, Math.floor(MAX_PENDING / (perDay * 2))));
  const out = [];

  for (let d = 0; d < days; d++) {
    const day = addDays(now, d);
    const dk = dkey(day);
    const taken = doseLog[dk] || {};
    for (const m of meds) {
      for (const time of m.times) {
        if (taken[`${m.id}@${time}`]) continue;   // jau išgerta – nei priminimo, nei pakartojimo
        const at = doseAt(day, time);
        const base = { channelId: "meds", smallIcon: "ic_stat_aura" };
        if (at > now) {
          out.push({
            ...base, id: notifId(doseKey(m.id, time, dk)),
            title: t.n.title, body: t.n.body(m),
            schedule: { at, allowWhileIdle: true },
          });
        }
        const fu = new Date(at.getTime() + FOLLOWUP_MIN * 60000);
        if (fu > now) {
          out.push({
            ...base, id: notifId(followKey(m.id, time, dk)),
            title: t.n.fuTitle, body: t.n.fuBody(m),
            schedule: { at: fu, allowWhileIdle: true },
          });
        }
      }
    }
  }
  return out;
}

/**
 * Perplanuoja viską pagal dabartinę būseną.
 *
 * Leidimas tikrinamas PRIEŠ atšaukimą. Anksčiau buvo atvirkščiai: trumpas
 * leidimo nuskaitymo trūkis atšaukdavo visus priminimus ir nesuplanuodavo naujų,
 * todėl priminimai „suveikdavo vieną kartą, o paskui nustodavo“.
 */
export async function syncMedReminders(meds, doseLog, t, enabled) {
  if (!isNative()) return { ok: false, reason: "web" };
  if (!enabled) { await cancelAll(); return { ok: true, scheduled: 0 }; }

  const perm = await permissionState();
  if (perm !== "granted") return { ok: false, reason: perm };   // nieko neatšaukiam

  const notifications = planNotifications(meds, doseLog, t);
  await cancelAll();
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return { ok: true, scheduled: notifications.length };
}

/** Pažymėjus dozę – nutildom tik ją, viso tvarkaraščio neperkuriam. */
export async function cancelDose(medId, time, dk) {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [
      { id: notifId(doseKey(medId, time, dk)) },
      { id: notifId(followKey(medId, time, dk)) },
    ] });
  } catch (e) { /* galėjo jau būti pristatyta */ }
}

/** Atšaukus pažymėjimą – grąžinam priminimus, kurių laikas dar nepraėjo. */
export async function restoreDose(med, time, dk, t) {
  if (!isNative()) return;
  if ((await permissionState()) !== "granted") return;
  const at = doseAt(new Date(dk.replace(/-/g, "/")), time);
  const fu = new Date(at.getTime() + FOLLOWUP_MIN * 60000);
  const now = new Date();
  const base = { channelId: "meds", smallIcon: "ic_stat_aura" };
  const notifications = [];
  if (at > now) notifications.push({ ...base, id: notifId(doseKey(med.id, time, dk)), title: t.n.title, body: t.n.body(med), schedule: { at, allowWhileIdle: true } });
  if (fu > now) notifications.push({ ...base, id: notifId(followKey(med.id, time, dk)), title: t.n.fuTitle, body: t.n.fuBody(med), schedule: { at: fu, allowWhileIdle: true } });
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

// Android 8+ reikalauja kanalo; svarbumas HIGH, kad priminimas būtų matomas.
export async function initChannel(t) {
  if (!isNative() || !isAndroid()) return;
  await LocalNotifications.createChannel({
    id: "meds", name: t.n.channel, importance: 5, visibility: 1, vibration: true,
  });
  await LocalNotifications.createChannel({
    id: "backup", name: t.n.bkChannel, importance: 3, visibility: 1, vibration: false,
  });
}

/**
 * Mėnesinis priminimas pasidaryti kopiją. Atskiras kanalas: vaistų priminimai
 * yra kritiniai, o šis – ne, ir vartotojas turi galėti nutildyti tik jį.
 */
export async function syncBackupReminder(t, enabled) {
  if (!isNative()) return { ok: false, reason: "web" };
  try { await LocalNotifications.cancel({ notifications: [{ id: BACKUP_ID }] }); } catch (e) { /* nebuvo */ }
  if (!enabled) return { ok: true, scheduled: 0 };
  if ((await permissionState()) !== "granted") return { ok: false, reason: "perm" };

  const at = new Date();
  at.setMonth(at.getMonth() + 1);
  at.setHours(11, 0, 0, 0);
  await LocalNotifications.schedule({ notifications: [{
    id: BACKUP_ID, title: t.n.bkTitle, body: t.n.bkBody,
    schedule: { at, every: "month", allowWhileIdle: true },
    channelId: "backup", smallIcon: "ic_stat_aura",
  }] });
  return { ok: true, scheduled: 1 };
}

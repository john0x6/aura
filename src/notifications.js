import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { dkey, addDays, dayFrom, doseAt, notifId, slotKey, slotFollowKey, doseInSchedule, doseFor } from "./dates";

export const isNative = () => Capacitor.isNativePlatform();
const isAndroid = () => Capacitor.getPlatform() === "android";

export const FOLLOWUP_MIN = 30;
export const DOSE_ACTION_TYPE = "meds-dose";
export const DOSE_ACTION_TAKEN = "taken";
const BACKUP_ID = 2000000001;   // notifId grąžina 0…1999999999, tad čia susidūrimas neįmanomas
const BED_BASE = 2000000100;    // 14 iš eilės einančių ID, po vieną kiekvienai dienai
const BED_DAYS = 14;
const HORIZON_DAYS = 14;
const MAX_PENDING = 400;   // Android riba ~500 vienai programėlei; laikom atsargą

const bedIds = () => Array.from({ length: BED_DAYS }, (_, i) => BED_BASE + i);

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

/**
 * Veiksmo mygtukas „Išgėriau“ pačiame pranešime.
 *
 * Be jo dozės pažymėjimas kainuoja keturis veiksmus: atrakinti telefoną,
 * atidaryti Aurą, surasti dozę, paspausti. Realiai tabletė išgeriama, o
 * pažymėjimas neįvyksta — ir ataskaitoje tai atrodo identiškai kaip praleista
 * dozė. Vienintelis skaičius, dėl kurio programėlė egzistuoja, krypsta žemyn
 * be jokios priežasties.
 *
 * Registruoti PRIVALOMA prieš planavimą: `actionTypeId`, nurodantis
 * neužregistruotą tipą, tyliai lieka be mygtuko.
 */
export async function initActions(t) {
  if (!isNative()) return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [{ id: DOSE_ACTION_TYPE, actions: [{ id: DOSE_ACTION_TAKEN, title: t.n.actTaken }] }],
    });
  } catch (e) { /* nepalaikoma – priminimas lieka be mygtuko, bet ateina */ }
}

/**
 * Praneša, kad vartotojas paspaudė „Išgėriau“.
 *
 * `extra` yra vienintelis kelias atgal į dozę: pranešimo ID yra `notifId`
 * maiša, o iš jos medId, laiko ir datos neatstatysi.
 *
 * Klausytoją registruoti galima ir vėliau nei įvyksta paspaudimas —
 * paleidžiant programėlę iš pranešimo įvykis pristatomas tada, kai atsiranda
 * kas jį priima. Tuo naudojamasi: laukiam, kol duomenys bus įkelti.
 */
export function onDoseAction(cb) {
  if (!isNative()) return () => {};
  const h = LocalNotifications.addListener("localNotificationActionPerformed", (ev) => {
    if (ev.actionId !== DOSE_ACTION_TAKEN) return;
    const x = ev.notification && ev.notification.extra;
    if (!x || !x.time || !x.dk) return;
    // `medId` – senos, dar prieš sujungimą suplanuotos žinutės. Jos telefone
    // gali gulėti iki 14 d., tad abu pavidalus priimam.
    const ids = Array.isArray(x.medIds) ? x.medIds : x.medId ? [x.medId] : [];
    if (ids.length) cb({ medIds: ids, time: x.time, dk: x.dk });
  });
  return () => { Promise.resolve(h).then((s) => s && s.remove()).catch(() => {}); };
}

export async function pendingCount() {
  if (!isNative()) return null;
  try { return (await LocalNotifications.getPending()).notifications.length; }
  catch (e) { return null; }
}

/**
 * Atšaukia VAISTŲ priminimus, bet ne svetimus ID.
 *
 * Anksčiau čia buvo `cancel(pending)` be filtro, todėl kartu dingdavo ir mėnesinis
 * kopijos priminimas. `syncMedReminders` perplanuoja ir grįžus iš fono (`dayTick`),
 * o `syncBackupReminder` tada nesuveikia — priminimas apie kopiją būdavo ištrinamas
 * po pirmo programėlės minimizavimo ir nebeatsistatydavo.
 */
export async function cancelAll(keepIds = [BACKUP_ID, ...bedIds()]) {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending();
  const mine = pending.notifications.filter((n) => !keepIds.includes(n.id));
  if (mine.length) await LocalNotifications.cancel({ notifications: mine });
}

/** Ko tuo laiku tą dieną dar laukiam: sąraše lieka nepažymėti ir jau galiojantys. */
function pendingAt(meds, doseLog, time, dk) {
  const taken = doseLog[dk] || {};
  return meds.filter((m) => m.times.includes(time)
    && !taken[`${m.id}@${time}`]              // jau išgerta – nei priminimo, nei pakartojimo
    && doseInSchedule(m, dk, time));          // vaistas įrašytas vėliau – tos dozės nebuvo
}

/**
 * Vieno laiko priminimai: PO VIENĄ pranešimą, kad ir kiek vaistų tuo metu geriama.
 *
 * Du vaistai 08:00 anksčiau duodavo du vienodus pranešimus vienas ant kito, o po
 * 30 min – dar du. Realiai tai vienas veiksmas: išgeriama viskas, kas tuo metu
 * geriama. Todėl vardai surašomi į vieną kūną, o „Išgėriau“ pažymi visus iš karto –
 * pranešime išvardyti būtent tie, kurie dar nepažymėti.
 */
function slotNotifications(meds, doseLog, t, time, dk, now = new Date()) {
  const due = pendingAt(meds, doseLog, time, dk);
  if (!due.length) return [];
  const at = doseAt(dayFrom(dk), time);
  const fu = new Date(at.getTime() + FOLLOWUP_MIN * 60000);
  const base = {
    channelId: "meds", smallIcon: "ic_stat_aura",
    actionTypeId: DOSE_ACTION_TYPE, extra: { medIds: due.map((m) => m.id), time, dk },
  };
  const out = [];
  if (at > now) {
    out.push({
      ...base, id: notifId(slotKey(time, dk)),
      title: t.n.title,
      body: t.n.body(due.map((m) => `${m.name}${doseFor(m, time) ? " " + doseFor(m, time) : ""}`)),
      schedule: { at, allowWhileIdle: true },
    });
  }
  if (fu > now) {
    out.push({
      ...base, id: notifId(slotFollowKey(time, dk)),
      title: t.n.fuTitle, body: t.n.fuBody(due.map((m) => m.name)),
      schedule: { at: fu, allowWhileIdle: true },
    });
  }
  return out;
}

/**
 * Sudaro konkrečių laiko taškų sąrašą artimiausioms dienoms.
 *
 * Pakartojami žadintuvai (schedule.on) yra trapiausias primityvas: juos nutildo
 * DND, riboja Doze, o po force-stop jie nebeatsistato. Todėl planuojam tikslius
 * `at` momentus ir papildom sąrašą kiekvieną kartą atidarius programėlę.
 *
 * Kiekvienam nepažymėtam laikui — VIENAS pakartojimas po 30 min. Be eskalacijos:
 * begalinis kalimas baigiasi tuo, kad vartotojas išjungia pranešimus visai.
 *
 * Biudžetas skaičiuojamas laikais, ne vaistais: sujungus priminimus, penki vaistai
 * dviem laikais telpa į tiek pat pranešimų, kiek vienas vaistas.
 */
export function planNotifications(meds, doseLog, t, now = new Date()) {
  const times = [...new Set(meds.flatMap((m) => m.times))].sort();
  if (!times.length) return [];
  const days = Math.max(1, Math.min(HORIZON_DAYS, Math.floor(MAX_PENDING / (times.length * 2))));
  const out = [];

  for (let d = 0; d < days; d++) {
    const dk = dkey(addDays(now, d));
    for (const time of times) out.push(...slotNotifications(meds, doseLog, t, time, dk, now));
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

/**
 * Perplanuoja VIENO laiko priminimą, viso tvarkaraščio neliesdamas.
 *
 * Kviečiama pažymėjus arba atžymėjus dozę. Kadangi pranešimas bendras, pažymėjus
 * vieną iš dviejų to paties laiko vaistų jo tiesiog nutildyti negalima – jį reikia
 * perrašyti taip, kad liktų tik antrasis. Todėl visada pirma atšaukiam, paskui
 * sudarom iš naujo pagal ką tik pasikeitusį žurnalą.
 *
 * `doseLog` privalo būti JAU atnaujintas: React būsena atsinaujina vėliau, tad
 * kviečiantysis paduoda tai, kaip žurnalas atrodys.
 */
export async function syncDoseSlot(meds, doseLog, t, time, dk, enabled) {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [
      { id: notifId(slotKey(time, dk)) },
      { id: notifId(slotFollowKey(time, dk)) },
    ] });
  } catch (e) { /* galėjo jau būti pristatyta */ }
  if (!enabled) return;
  if ((await permissionState()) !== "granted") return;
  const notifications = slotNotifications(meds, doseLog, t, time, dk);
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
  // Atskiras kanalas: miego priminimas nėra kritinis kaip vaistai, ir vartotojas
  // turi galėti nutildyti būtent jį, neliesdamas dozių.
  await LocalNotifications.createChannel({
    id: "bed", name: t.n.bedChannel, importance: 3, visibility: 1, vibration: false,
  });
}

/**
 * Miego priminimas nurodytu laiku.
 *
 * Planuojam tikslius `at` taškus 14 d. į priekį, kaip ir vaistams, o ne
 * `every: "day"`: pakartojamus žadintuvus nutildo DND, riboja Doze ir jie
 * neatsistato po force-stop. Atsarginės kopijos priminimas sau leidžia `every`,
 * nes praleistas mėnesinis priminimas nieko nekainuoja — praleistas miego laikas
 * kainuoja.
 *
 * Tekstas sąmoningai neutralus. Programėlė negali teigti, kad miegas mažina
 * priepuolius — tai būtų medicininis nurodymas. Ji tik primena laiką, kurį
 * vartotojas nusistatė pats.
 */
export async function syncBedtimeReminder(t, enabled, time) {
  if (!isNative()) return { ok: false, reason: "web" };
  try { await LocalNotifications.cancel({ notifications: bedIds().map((id) => ({ id })) }); }
  catch (e) { /* nebuvo suplanuota */ }
  if (!enabled || !time) return { ok: true, scheduled: 0 };
  if ((await permissionState()) !== "granted") return { ok: false, reason: "perm" };

  const now = new Date();
  const notifications = [];
  for (let d = 0; d < BED_DAYS; d++) {
    const at = doseAt(addDays(now, d), time);
    if (at <= now) continue;               // šiandienos laikas jau praėjo
    notifications.push({
      id: BED_BASE + d, title: t.n.bedTitle, body: t.n.bedBody,
      schedule: { at, allowWhileIdle: true },
      channelId: "bed", smallIcon: "ic_stat_aura",
    });
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return { ok: true, scheduled: notifications.length };
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

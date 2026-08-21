// Bendros datų funkcijos. Svarbu, kad App.jsx ir notifications.js naudotų
// TĄ PATĮ dkey(): nesutapimas tyliai sugadintų pakartojimų atšaukimą.
export const pad = (n) => String(n).padStart(2, "0");
export const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dkey(new Date());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// "2026-08-21" → vietinė tos dienos pradžia. new Date("2026-08-21") duotų UTC vidurnaktį.
export const dayFrom = (dk) => { const [y, m, d] = dk.split("-").map(Number); return new Date(y, m - 1, d); };

// Dozės momentas konkrečią dieną pagal "HH:MM"
export function doseAt(day, time) {
  const [h, m] = time.split(":").map(Number);
  const x = new Date(day);
  x.setHours(h, m, 0, 0);
  return x;
}

// Vaisto ID tekstinis, o pranešimo ID turi būti 32-bit sveikasis.
// Raktas apima ir datą, todėl kiekviena dozė turi savo atšaukiamą ID.
export function notifId(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) || 1;
}

// Pranešimo raktai eina per LAIKĄ, ne per vaistą: to paties laiko vaistai
// sudedami į vieną priminimą, tad ir ID jiems reikia vieno bendro.
export const slotKey = (time, dk) => `@${time}|${dk}`;
export const slotFollowKey = (time, dk) => `@${time}|${dk}|f`;

/**
 * Konkretaus laiko dozė. `doses` yra neprivalomi laikų nutarimai, `dose` –
 * bendras: tas pats vaistas ryte ir vakare dažnai geriamas skirtingu kiekiu,
 * bet vardas ir sąrašo eilutė lieka viena.
 */
export const doseFor = (med, time) => (med.doses && med.doses[time]) || med.dose || "";

/**
 * Ar dozė tą dieną apskritai priklausė grafikui.
 *
 * `timesFrom` žymi tik DIENĄ, o vaistas įrašomas konkrečią valandą: vakare
 * pridėjus rytinį laiką, tos dienos 08:00 dozė nebuvo praleista — jos dar
 * nebuvo. Todėl pirmą dieną lyginam su tikslia įrašymo akimirka (`timesAt`).
 * Seni įrašai jos neturi, ir tada elgiamės kaip anksčiau: visa diena skaitoma.
 */
export function doseInSchedule(med, dk, time) {
  const from = med.timesFrom || "0000-00-00";
  if (dk < from) return false;
  if (dk > from || !med.timesAt) return true;
  const at = new Date(med.timesAt);
  if (isNaN(at.getTime())) return true;
  return doseAt(dayFrom(dk), time) >= at;
}

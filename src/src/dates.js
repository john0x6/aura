// Bendros datų funkcijos. Svarbu, kad App.jsx ir notifications.js naudotų
// TĄ PATĮ dkey(): nesutapimas tyliai sugadintų pakartojimų atšaukimą.
export const pad = (n) => String(n).padStart(2, "0");
export const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dkey(new Date());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

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

export const doseKey = (medId, time, dk) => `${medId}@${time}|${dk}`;
export const followKey = (medId, time, dk) => `${medId}@${time}|${dk}|f`;

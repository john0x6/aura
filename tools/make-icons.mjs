/**
 * Generuoja visas piktogramas iš to paties šaltinio, kaip ir sąsajos ženklas —
 * EEG ramybės kreivės sin(3πu)·(1−0.62u).
 *
 * Paleisti: npm run icons
 *
 * Kodėl scriptas, o ne piešti ranka: ženklas yra formulė. Pakeitus amplitudę ar
 * storį, vienuolika failų turi pasikeisti kartu, kitaip sąsaja ir piktograma
 * pradeda skirtis, o to niekas nepastebi iki pat įdiegimo į telefoną.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = path.resolve("assets");

// --- ta pati kreivė kaip src/App.jsx AuraMark ---
function curvePath(simple = false) {
  const N = 72;
  const W = simple ? 12.4 : 13.2;
  const A = simple ? 9.4 : 10.4;
  const SHIFT = A * (0.897 - 0.690) / 2;
  let d = "";
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = -W + 2 * W * u;
    const y = -A * Math.sin(3 * Math.PI * u) * (1 - 0.62 * u) + SHIFT;
    d += (i ? "L" : "M") + x.toFixed(3) + " " + y.toFixed(3) + " ";
  }
  return { d: d.trim(), W, A, sw: simple ? 3.5 : 2.9 };
}

// Kreivės gabaritai su brūkšnio storiu — nuo jų skaičiuojamas mastelis.
function extent(simple) {
  const { W, A, sw } = curvePath(simple);
  const SHIFT = A * (0.897 - 0.690) / 2;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 720; i++) {
    const u = i / 720;
    const y = -A * Math.sin(3 * Math.PI * u) * (1 - 0.62 * u) + SHIFT;
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return { w: 2 * W + sw, h: (hi - lo) + sw };
}

/**
 * @param fill  santykinė kreivės plotis nuo drobės (0..1)
 * @param bg    fono spalva arba null = permatomas
 */
function svg(size, stroke, bg, { simple = false, fill = 0.7 } = {}) {
  const { d, sw } = curvePath(simple);
  const ext = extent(simple);
  const span = ext.w / fill;                 // viewBox plotis vidiniais vienetais
  const half = (span / 2).toFixed(3);
  const rect = bg ? `<rect x="${-half}" y="${-half}" width="${span.toFixed(3)}" height="${span.toFixed(3)}" fill="${bg}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${span.toFixed(3)} ${span.toFixed(3)}" width="${size}" height="${size}">` +
    rect +
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

const C = { petrol: "#1F6E6B", cream: "#EDF1F2", ink: "#1B2A31", white: "#FFFFFF", black: "#000000" };

const jobs = [
  // --- pagrindinė piktograma. Vardas „icon-only“ nėra laisvai pasirinktas:
  //     būtent jo ieško @capacitor/assets. Senasis „icon.png“ būtų tyliai ignoruotas. ---
  ["icon-only.png", svg(1024, C.petrol, C.cream, { fill: 0.72 })],

  // --- adaptyvi piktograma: sluoksniai atskirai, Android pats parenka formą ---
  // priekinis planas siauresnis: išorinį kraštą sistema gali nukirpti
  ["icon-foreground.png", svg(1024, C.petrol, null, { fill: 0.56 })],
  ["icon-background.png", svg(1024, "none", C.cream, { fill: 0.56 })],

  // --- nespalvoti variantai pasirinkimui ---
  ["icon-bw-light.png", svg(1024, C.black, C.white, { fill: 0.72 })],
  ["icon-bw-dark.png", svg(1024, C.white, C.black, { fill: 0.72 })],

  // --- pradžios ekranas ---
  ["splash.png", svg(2732, C.petrol, C.cream, { fill: 0.22 })],
  ["splash-dark.png", svg(2732, C.cream, C.ink, { fill: 0.22 })],
];

/**
 * Android 13+ temuota piktograma: sistema pati piešia foną pagal tapetus ir
 * ekrano temą, o iš mūsų ima tik siluetą. Baltas ant permatomo.
 *
 * @capacitor/assets to negeneruoja, todėl failai daromi čia ir įdedami workflow'e.
 * Adaptyvių sluoksnių drobė yra 108 dp, ne 48 — iš čia ir dydžiai.
 */
for (const [dpi, px] of [["mdpi", 108], ["hdpi", 162], ["xhdpi", 216], ["xxhdpi", 324], ["xxxhdpi", 432]]) {
  jobs.push([`ic_launcher_monochrome_${dpi}.png`, svg(px, C.white, null, { fill: 0.56 })]);
}

// --- pranešimų piktogramos: Android jas perpiešia baltai ant permatomo fono,
//     bet vis tiek turi būti baltos — kitaip kai kur pasirodo juodas kvadratas ---
for (const px of [24, 48, 72, 96, 144, 192]) {
  jobs.push([`ic_stat_aura_${px}.png`, svg(px, C.white, null, { simple: true, fill: 0.86 })]);
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [name, buf] of jobs) {
  await sharp(buf).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  const st = fs.statSync(path.join(OUT, name));
  console.log(String(name).padEnd(26), (st.size / 1024).toFixed(1) + " kB");
  n++;
}
console.log(`\nSugeneruota ${n} failų kataloge ${OUT}`);

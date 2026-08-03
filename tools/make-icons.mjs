/**
 * Generuoja visas piktogramas iš to paties šaltinio, kaip ir sąsajos ženklas —
 * šešialapės formos r(θ) = R·(1 + 0,22·cos(6θ)).
 *
 * Paleisti: npm run icons
 *
 * Kodėl scriptas, o ne piešti ranka: ženklas yra formulė. Pakeitus lopelių kiekį
 * ar kontūro storį, visi failai turi pasikeisti kartu, kitaip sąsaja ir piktograma
 * pradeda skirtis, o to niekas nepastebi iki pat įdiegimo į telefoną.
 *
 * Formos parametrai turi sutapti su AuraMark komponentu src/App.jsx.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = path.resolve("assets");
const K = 6, A = 0.22;

function blobPath(R, steps = 480) {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const r = R * (1 + A * Math.cos(K * th));
    d += (i ? "L" : "M") + (Math.cos(th) * r).toFixed(3) + " " + (Math.sin(th) * r).toFixed(3) + " ";
  }
  return d.trim() + " Z";
}

/**
 * @param fill  kiek drobės pločio užima forma su kontūru (0..1)
 * @param sw    kontūro storis kaip R dalis
 * @param bg    fono spalva arba null = permatomas
 */
function svg(size, stroke, bg, { fill = 0.72, sw = 0.20 } = {}) {
  const span = 100;
  // kraštinė viršūnė su puse brūkšnio turi tilpti į fill·span/2
  const R = (fill * span / 2) / (1 + A + sw / 2);
  const w = R * sw;
  const half = span / 2;
  const rect = bg ? `<rect x="${-half}" y="${-half}" width="${span}" height="${span}" fill="${bg}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${span} ${span}" width="${size}" height="${size}">` +
    rect +
    `<path d="${blobPath(R)}" fill="none" stroke="${stroke}" stroke-width="${w.toFixed(3)}" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

const C = { petrol: "#1F6E6B", cream: "#EDF1F2", ink: "#1B2A31", white: "#FFFFFF" };

const jobs = [
  // Vardas „icon-only“ nėra laisvai pasirinktas: būtent jo ieško @capacitor/assets.
  ["icon-only.png", svg(1024, C.cream, C.petrol)],

  // Adaptyvi piktograma: sluoksniai atskirai, Android pats parenka kaukės formą.
  // Priekinis planas siauresnis – išorinį kraštą sistema gali nukirpti.
  ["icon-foreground.png", svg(1024, C.cream, null, { fill: 0.58 })],
  ["icon-background.png", svg(1024, "none", C.petrol, { fill: 0.58 })],

  // Pradžios ekranas: forma maža, aplink daug oro.
  ["splash.png", svg(2732, C.petrol, C.cream, { fill: 0.24 })],
  ["splash-dark.png", svg(2732, C.cream, C.ink, { fill: 0.24 })],
];

/**
 * Android 13+ temuota piktograma: sistema pati piešia foną pagal tapetus ir
 * ekrano temą, o iš mūsų ima tik siluetą. Baltas ant permatomo.
 * @capacitor/assets to negeneruoja, todėl failai daromi čia.
 * Adaptyvių sluoksnių drobė yra 108 dp, ne 48 — iš čia ir dydžiai.
 */
for (const [dpi, px] of [["mdpi", 108], ["hdpi", 162], ["xhdpi", 216], ["xxhdpi", 324], ["xxxhdpi", 432]]) {
  jobs.push([`ic_launcher_monochrome_${dpi}.png`, svg(px, C.white, null, { fill: 0.58 })]);
}

// Pranešimų piktogramos: baltos ant permatomo, storesnis kontūras – ties 24 px
// plonas subyra į taškelius.
for (const px of [24, 48, 72, 96, 144, 192]) {
  jobs.push([`ic_stat_aura_${px}.png`, svg(px, C.white, null, { fill: 0.88, sw: 0.28 })]);
}

// Senų variantų likučiai: kol jie guli assets/, neaišku, kuris ženklas galioja.
const pasenę = ["icon.png", "icon-bw-light.png", "icon-bw-dark.png", "icon-monochrome.png"];
for (const f of pasenę) {
  const p = path.join(OUT, f);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log("ištrinta", f); }
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, buf] of jobs) {
  await sharp(buf).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  const st = fs.statSync(path.join(OUT, name));
  console.log(String(name).padEnd(34), (st.size / 1024).toFixed(1) + " kB");
}
console.log(`\nSugeneruota ${jobs.length} failų kataloge ${OUT}`);

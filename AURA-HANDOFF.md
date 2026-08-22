# Aura: projekto perdavimas (v2.1 / ataskaita, sujungti priminimai, dozės pagal laiką, planšetės)

Įklijuok šį failą į naują pokalbį. Kodas yra `C:\Users\Vartotojas\Desktop\aura`.

Paskutinis darbas yra `main` šakoje. Prieš pradėdamas patikrink `git status`, `git branch`
ir `git log --oneline -3`.

---

## Kas tai

**Aura** (`lt.aura.epilepsy`) yra epilepsijos dienynas. Asmeninis projektas, kuriamas laisvalaikiu.
Autorius: Kęstutis (software dev, project lead).

**Stekas:** React 18 + Vite, Capacitor 7 (Android pirmiausia), vienas `App.jsx`.
**Kalbos:** LT, EN, RU, PL. Visos keturios pilnos.
**Duomenys:** tik įrenginyje, per `@capacitor/preferences` kaip JSON. Nėra backend'o, paskyrų,
debesies, analitikos. Nulis tinklo užklausų.

---

## Failų struktūra

```
src/App.jsx           visa sąsaja + vertimai (~3060 eil.)
src/backup.js         eksportas/importas, schemaVersion validacija
src/seizureTimer.js   priepuolio laikmatis (Preferences, sieninis laikrodis)
src/notifications.js  vaistų priminimai, mėnesinis kopijos, miego priminimas
src/dates.js          BENDROS datų funkcijos (dkey turi būti vienas!), `doseInSchedule`,
                      `doseFor`, pranešimų raktai
src/native.js         splash, status bar, „atgal", grįžimas iš fono, temos spalvos,
                      dalinimasis (shareText)
src/storage.js        Preferences adapteris
tools/make-icons.mjs  generuoja visas piktogramas iš formulės (npm run icons)
.github/workflows/build-apk.yml   APK generavimas debesyje
assets/               16 sugeneruotų failų
```

**Skirtukai:** Priepuoliai · Vaistai · Kalendorius · Būsena (4). Užrašų skirtukas pašalintas.
Pradinis skirtukas yra `HOME_TAB` konstantoje; jis naudojamas ir „atgal“ mygtukui, ir apžvalgos
pradžiai bei pabaigai. Nerašyk skirtuko ID tiesiai į tas vietas.

---

## Kas pasikeitė šioje sesijoje

Ataskaitos perstatymas, dvi naujos galimybės ir trys vartotojo praneštos klaidos.
Visos trys klaidos buvo atkurtos naršyklėje prieš taisant.

### Ataskaita gydytojui perstatyta

Vartotojo pastaba: „atrodo labai komplikuota". Išmatuota telefono plotyje (375 px): viena
kortelė, **12 vienodo svorio eilučių**, iš jų „Žymėjimo laikas" reikšmė lūžta į **4 eilutes**
191 px stulpelyje, „Pasekmės" ir „Vaistų laikymasis" – į dvi. Priepuolių skaičius atrodė
lygiai taip pat svarbiai kaip „Alkoholis · atsakyta 20 iš 30".

- **Trys skyriai vietoj vienos lentelės:** Priepuoliai · Vaistai · Savijauta. Du pirmieji
  turi po vieną didelį skaičių (priepuolių kiekis, laikymosi procentas), po jais – smulkmenos,
  kurios tą skaičių paaiškina. Naujas `ReportBlock`.
- **Ilga reikšmė gula PO etikete** (`Stat` su automatiniu `stack`, kai reikšmė > 26 simbolių).
  Lentelė, kurios pusė langelių aukštesni už kitus, atrodo sudėtingesnė, nei yra.
- **Priepuolių DATOS.** Iki tol ataskaita nesakė nė vienos: nei ekrane, nei tekste. Gydytojas
  klausia ne „kiek", o „kada". Dabar `07-28, 07-21, 07-14` abiejose vietose.
- **Ankstesnis toks pat langas** („Ankstesnės 30 d.: 4“). Rodomas TIK tada, kai dienyne yra
  įrašų iš anksčiau nei langas prasideda. Kitaip „0" reikštų ne ramų mėnesį, o programėlę,
  kurios dar nebuvo, ir gydytojas pamatytų pagerėjimą, kurio niekas nematavo.
- **Jokio vertinimo.** Ankstesnis skaičius rodomas be rodyklių, be spalvos, be procentų:
  tai faktas, ne išvada. Laikymosi procentas lieka vienintelis spalvintas — ten riba aritmetinė.
- Vaistų sąrašas kortelėje eina eilutėmis su dozėmis prie laikų, ne etiketė–reikšmė pora.
- Paaiškinimas apie apytikslį procentą rodomas tik tada, kai procentas apskritai yra.
- Tekstinėje ataskaitoje `(73 iš 90 dozių) (skaičiuota 30 iš 30 d.)` dvigubi skliaustai
  pakeisti į `· skaičiuota …`.

**Kas SĄMONINGAI nekeista.** Ataskaita tebėra suvestinė, ne priepuolių sąrašas: pilnas
sąrašas su tipais ir trukmėmis gyvena Priepuolių skirtuke, ir jo kartojimas ataskaitą vėl
pailgintų. Jei gydytojui reikia detalių, jos yra `Pastabose` ir dienyne.

### To paties laiko priminimai sujungti į vieną

- Du vaistai 08:00 duodavo du vienodus pranešimus vienas ant kito, o po 30 min – dar du.
  Realiai tai vienas veiksmas: išgeriama viskas, kas tuo metu geriama.
- Pranešimo ID dabar eina per LAIKĄ, ne per vaistą (`slotKey`, `slotFollowKey` –
  `src/dates.js`). `extra.medIds` yra masyvas, ir „Išgėriau" pažymi visus išvardytus.
  Senos, dar prieš pakeitimą suplanuotos žinutės su `extra.medId` telefone gali gulėti iki
  14 d., todėl `onDoseAction` priima abu pavidalus.
- Kūne surašomi tik NEPAŽYMĖTI vaistai. Pažymėjus vieną iš dviejų, žinutės nutildyti
  nebegalima – ją reikia perrašyti taip, kad liktų antrasis. Tam `cancelDose` ir
  `restoreDose` pakeisti vienu `syncDoseSlot(meds, doseLog, t, time, dk, enabled)`:
  atšaukia to laiko ID ir sudaro iš naujo.
- **`doseLog` jam paduodamas JAU atnaujintas.** `update()` React būseną atnaujina vėliau,
  o priminimui reikšmės reikia dabar, todėl kviečiantysis pats sudaro, kaip žurnalas
  atrodys. Pranešimo klausytojas šviežius duomenis ir kalbą ima iš `dataRef` / `tRef`:
  jis registruojamas vieną kartą ir kitaip matytų tik pirmąją būseną.
- Pranešimų biudžetas dabar skaičiuojamas laikais, ne vaistais: penki vaistai dviem laikais
  telpa į tiek pat pranešimų, kiek vienas vaistas. Anksčiau `MAX_PENDING` dalybas mažino
  horizontą iki kelių dienų.

### Skirtingos to paties vaisto dozės ryte ir vakare

- Levetiracetamas 250 mg ryte ir 1000 mg vakare buvo įmanomas tik kaip du atskiri įrašai
  tuo pačiu pavadinimu — dvigubas sąrašas ir dvigubas priminimas.
- Naujas neprivalomas laukas `doses` (`{ "20:00": "1000 mg" }`). `dose` lieka bendra:
  `doseFor(med, time)` grąžina laiko dozę arba bendrą. Seni įrašai `doses` neturi ir
  elgiasi kaip anksčiau.
- Formoje laikai laikomi eilutėmis `{ time, dose }`, ne dviem lygiagrečiais masyvais:
  ištrynus 08:00 kartu turi dingti būtent jo dozė. Įrašant virsta `times` + `doses`.
  Tuščias laukelis reiškia bendrą dozę, ir ji rodoma vietos ženkle.
- Rodymas: kai visų laikų dozė ta pati, ji lieka kortelės antraštėje kaip anksčiau; kai
  skiriasi — antraštėje jos nebėra, o kiekviena eilutė rodo savo. Ataskaitos tekste
  atitinkamai `Levetiracetamas · 08:00 250 mg, 20:00 1000 mg`.
- Dozės pakeitimas NEATSTATO `timesFrom` / `timesAt`: pasikeitė kiekis, ne grafikas.

### Vaistas, pridėtas jau po dozės laiko, iškart „vėluodavo"

- 19:21 įrašius vaistą su 08:00 laiku, ta diena iškart rodė „Vėluoja", o suvestinėje
  atsirasdavo 0 % laikymosi. Dozės nebuvo praleista — jos tą dieną apskritai nebuvo.
- Priežastis: `timesFrom` žymėjo tik DIENĄ (`todayKey()`), o vaistas pridedamas konkrečią
  valandą. Visa įrašymo diena buvo skaitoma nuo vidurnakčio.
- Naujas laukas `timesAt` (ISO akimirka) rašomas kartu su `timesFrom`. `doseInSchedule`
  (`src/dates.js`) pirmą dieną lygina su ta akimirka, vėlesnėms dienoms atsako `true`.
  Seni įrašai `timesAt` neturi ir elgiasi kaip anksčiau — migracijos nereikia.
- Tokia dozė rodoma pilkai su „Nuo rytojaus" (`stLater`, visos keturios kalbos).
  **Pažymėti ją vis tiek galima**: ryte išgertą tabletę vakare įrašo pats vartotojas, ir
  pažymėta dozė visada skaitosi į abu skaičius.
- `planNotifications` tokiai dozei nebeplanuoja nė pakartojimo: 08:20 pridėjus 08:00 vaistą,
  08:30 ateidavo „nepažymėjai".
- Laikymosi procentas dabar atmeta ir dar NEATĖJUSIAS šiandienos dozes (`cutoff` argumentas
  `scheduledOn`). Vakarinė dozė 19:00 nėra praleista. Kai skaičiuoti nėra ko, rodoma „—",
  ne „0 %".

### Apžvalga („gidas") lūždavo, kai vaistų jau buvo

- 5 žingsnis rodo „Pridėti vaistą". Su keliomis vaistų kortelėmis tas mygtukas nukeliauja
  žemiau ekrano ribos, o apvedimo žiedas likdavo prie ankstesnio elemento arba visai už
  ekrano. Puslapis tuo metu jau būdavo užrakintas — vartotojui likdavo tamsus ekranas.
- Priežastis: `scrollIntoView({ behavior: "smooth" })` ir fiksuoti 420 ms iki matavimo.
  Sklandus slinkimas trunka neapibrėžtai ilgai, o kai langas nepiešiamas, **nevyksta iš
  viso** — tada matuojama sena vieta.
- Dabar slenkama pačiam: `window.scrollTo(0, y)` be animacijos, matavimas po 60 ms.
  Šuolis be judesio čia dar ir saugesnis fotosensityvumui.
- Pataisytas ir v1.7 teiginys, kad „programinis slinkimas veikia ir užrakintame puslapyje":
  `scrollTo` veikia, o `behavior: "smooth"` be piešiamo lango — ne.
- Patikrinta: visi 8 žingsniai su dviem vaistais, žiedas sutampa su taikiniu per 6 px `pad`,
  taikinys matomas ekrane, užraktas atsileidžia pabaigoje.

### Tamsi tema: balta juosta viršuje ir apačioje

- **Tai Android 15 pokytis, ne CSS klaida.** Nuo API 35 langas visada piešiamas po sistemos
  juostomis, o `StatusBar.setBackgroundColor` yra tuščias veiksmas.
- `adjustMarginsForEdgeToEdge: "auto"` (buvusi reikšmė) tokiu atveju apkarpo WebView
  paraštėmis, o jas nuspalvina temos `Theme.AppCompat.DayNight` fonas — SISTEMOS, ne
  programėlės tema. Pasirinkus tamsią temą šviesiame telefone viršus ir apačia lieka balti.
- Dabar `"disable"`: WebView užima visą langą, o vietą juostoms palieka pati programėlė per
  `--sa-top` / `--sa-bottom` (`env(safe-area-inset-*)`). Fonas visur savas, tema nesvarbu.
- WebView `env()` reikšmes teisingai praneša tik nuo 140 versijos. Todėl `App.jsx` startuojant
  pamatuoja zondu: jei gauna nulius, viršų paima iš `StatusBar.getInfo().height` (tikras dp),
  apačiai lieka 24 px. Iki Android 15 langas įsprausdinamas pats, ir atsargos neįjungiamos
  (`systemBarInsets` grąžina `null`).
- Lapai (`Sheet`) ir pirmo paleidimo ekranas gavo apatinę atsargą: jie remiasi į ekrano kraštą.
- **Neištestuota telefone.** Naršyklėje `--sa-*` išsisprendžia į 0 px ir maketas nepakito,
  bet ar Xiaomi WebView praneša insets — matysis tik APK'e. Jei antraštė atsidurtų po
  laikrodžiu, kaltas zondas: reiškia `env()` grąžino ne nulį, bet neteisingą reikšmę.

### Planšetės ir gulsčias telefonas

- Iki tol viskas gyveno 480 px stulpelyje. Planšetėje tai atrodė kaip nebaigtas maketas:
  siaura juostelė ekrano viduryje, o apačioje kabanti 480 px sala su brūkšneliu, kuris
  baigiasi tuštumoje.
- **Riba `WIDE_BP = 720` px** (7 col planšetė portretu duoda 800, telefonas gulsčias 844).
  Virš jos: turinio stulpelis 600 px, skirtukų juosta per visą plotį su mygtukais tame
  pačiame 600 px stulpelyje, lapai (`Sheet`) tampa langu ekrano viduryje, ataskaita –
  du stulpeliai (`.rgrid`), jos lapas platesnis už kitus (`roomy`, 780 px).
- **Riba per CSS medijos užklausą, ne per JS.** Pirmas variantas buvo `useWide()` kabliukas
  su `matchMedia` + `resize` + `orientationchange`; naršyklėje pasukus langą nesuveikė nė
  vienas iš trijų, ir maketas liko toks, koks buvo paleidžiant. `ResizeObserver` suveikė, bet
  tai jau trys atsarginiai keliai tam, ką CSS padaro be jokių įvykių. Kabliukas pašalintas.
  **Nedaryk atgal į JS.**
- Stulpelis platėja saikingai (600, ne per visą ekraną): dienynas yra skaitomas tekstas, o
  eilutė per visą planšetės plotį skaitosi blogiau, ne geriau.
- Klasės gyvena `GLOBAL_CSS`: `.col`, `.sheetWrap`, `.sheet`, `.sheet.roomy`, `.rgrid`.
  Konstantos `COL`, `COL_WIDE`, `WIDE_BP` įrašomos į CSS per šablono eilutę, tad skaičius
  keisti reikia vienoje vietoje. **`GLOBAL_CSS` yra template literal — atgalinių kabučių
  komentaruose rašyti negalima**, sulaužo bylą (jau lūžo kartą).
- Android pusėje nieko keisti nereikėjo: manifeste nėra `screenOrientation`, o `configChanges`
  apima `orientation|screenSize`, tad programėlė sukiojasi ir keičia dydį laisvai.
- Patikrinta naršyklėje ties 375×812, 768×1024, 1280×800 ir 844×390: ataskaita gulsčiame
  telefone anksčiau rodė 24 % turinio, dabar 34 %, planšetėje – 87 %. Telefono maketas
  nepakito nė vienu pikseliu.

---

## Kas pasikeitė ankstesnėje sesijoje (v1.7)

### Nustatymai sudėti į korteles
- Iki tol tai buvo vienintelis ekranas, kur valdikliai kabo tiesiai ant fono, nors visur
  kitur turinys sėdi ant `Card`. Devyni skyriai virto šešiomis kortelėmis.
- Nauji `SetGroup`, `SetRow`, `SetNav` (`src/App.jsx`). Skirtukas tarp eilučių piešiamas
  **grupėje, ne eilutėje**: keturios eilutės yra sąlyginės, ir eilutėje piešiamas brūkšnys
  kartais pakibtų kortelės viršuje.
- Keturi tamsūs per visą plotį mygtukai tapo eilutėmis su rodykle. „Peržiūrėti apžvalgą“
  nukeltas iš pačio viršaus į „Apie“: tai ne tas dalykas, dėl kurio į nustatymus einama.

### Miego langas
- Nustatymuose „nuo“ ir „iki“ (`bedtime`, `waketime`). Iš jų Būsenos skirtuke pasiūlomos
  miego valandos: 21:00–07:00 duoda 10 h.
- **Reikšmė neįrašoma savaime**, tik pasiūloma paspaudžiama eilute. Tri-state išlieka:
  automatiškai užpildytas miegas būtų ataskaitoje atsiradęs faktas, kurio niekas nepasakė.
- Laikai visada matomi, nepriklausomai nuo miego priminimo jungiklio: langas prasmingas ir
  tam, kas pranešimo nenori.
- **Žinoma spraga:** kol nepajudini laiko lauko, `waketime` neįrašomas, tad pasiūlymas
  nepasirodo, nors numatytieji 22:30–07:00 nustatymuose jau matosi.

### Apžvalgos slinkimo klaida
- Paslinkus puslapį apvedimo žiedas likdavo priklijuotas prie ekrano: `rect` matuojamas
  vieną kartą per žingsnį ir yra taškas ekrane, o slinkti niekas nedraudė.
- Dabar `lockScroll(true)` uždedamas **kartu su matavimu**, o prieš `scrollIntoView`
  nuimamas: užrakintame puslapyje apžvalga pati nebegalėtų nuslinkti prie taikinio.
- Atrakinama išeinant bet kuriuo keliu, įskaitant Escape ir taikinio neradimą. Sluoksnis
  gavo `touchAction: "none"`: telefone `overflow` vienas neužtenka.
- Naudinga žinoti: `overflow: hidden` stabdo tik vartotojo slinkimą, programinis
  (`scrollIntoView`, `scrollTo`) veikia toliau. Patikrinta.

### Priminimų jungikliai atjungti nuo vaistų
- `syncBedtimeReminder` ir `syncBackupReminder` **nebepriklauso nuo `notify`**. Iki tol
  išjungęs vaistų priminimus žmogus tyliai prarasdavo ir miego, ir kopijos priminimą, o
  jų jungikliai toliau rodė „Įjungti“.
- Leidimo dabar prašo kiekvienas jungiklis atskirai (`toggleRemind`). Iki tol klausė tik
  vaistų, tad įjungus vien miego priminimą `syncBedtimeReminder` grįždavo su `perm` ir
  nesuplanuodavo nieko, be jokio ženklo ekrane.
- Naršyklėje leidimo neklausiama, kitaip jungiklis taptų nepaspaudžiamas kuriant.

### Atsiliepimas
- Prisegama **priminimų būklė**: `perm`, `pending`, `meds`, `bed`. Be jų „priminimai
  neateina“ neatskiriamas nuo gamintojo apribojimo, ir kiekvienas laiškas kainuoja
  papildomą susirašinėjimo ratą. `perm=granted` + `pending=0` reiškia planavimo klaidą,
  `perm=granted` + `pending=54` reiškia, kad telefonas jų neparodo.
- `navigator.platform` pakeistas `deviceInfo()`: Android WebView'e platform grąžina
  procesoriaus architektūrą, vienodą visiems telefonams, o čia svarbiausias gamintojas.
- `window.open(mailto, "_blank")` → `window.location.href`. WebView neprivalo turėti lango
  taikinių apdorojimo, ir tada paspaudimas nedaro nieko.
- **„Atsidarė pašto programa“ pašalinta** iš keturių kalbų: ji buvo rodoma besąlygiškai,
  taip pat ir tada, kai neatsidarė niekas. Ar atsidarė, sužinoti neįmanoma.
- Pridėtas „Siųsti kitaip“ per `@capacitor/share` (`shareText` faile `src/native.js`).
  Tik telefone ir tik antru mygtuku: dalinimosi lange adresatą renkasi vartotojas.
- Kortelė rodoma **visuose skirtukuose**, po turiniu. Viršuje Priepuolių skirtuke ji
  nustumtų žemyn „Prasidėjo priepuolis“.

### Ataskaita rodo dozių žymėjimo laiką
- Naujas `doseDeviations()` + `DOSE_GRACE_MIN = 30`. Ataskaitoje: kiek dozių nukrypo
  daugiau nei 30 min, vidutiniškai kiek ir daugiausia kiek, su kryptimi.
- **Vadinama „Žymėjimo laikas“, ne gėrimo.** Programėlė mato paspaudimą, ne tabletę.
  Paspaudus „Išgėriau“ pranešime jie beveik sutampa, vakare susižymint dienos dozes ne.
- **`DOSE_GRACE_MIN` nėra klinikinė riba** ir taip parašyta komentare. Teisingas langas
  priklauso nuo vaisto, o Aura neturi nė vieno jų farmakokinetikos. Eilutė be spalvos:
  nukrypimas yra faktas, vertina neurologas.

### Vertimai: 16 klaidų keturiose kalbose
- **Penkios giminės formos:** LT `bedBody` „nusistatei **pats**“, PL `seizNote` „czułeś“,
  `seizStaleNote` „zapomniałeś“, `bedBody` „ustawiłeś“, RU `ef.fall` „Упал(а)“.
- **RU trys sakiniai** buvo su «X, это Y» be brūkšnio, kuris toje konstrukcijoje privalomas.
  Kadangi brūkšnių vartoti negalima, perfrazuota, o ne pridėta skyryba.
- **RU `gNotifB`** sakė „Aura не обязана работать“, tai yra priešingai, nei norėta.
- **PL `rDays`** duodavo „1 dni“; kitos trys kalbos apsaugotos sutrumpinimais.
- Linksniai: LT „ne **Auros** kopija“, PL „kopia zapasowa **Aury**“.
- `setupIntro` LT ir PL pakeistas iš „pakeisi / zmienisz“ į galimybės formą. EN ir RU ją
  turėjo nuo pradžių.

### Paletė
- **`plum` atskirtas nuo `blue`.** Jie buvo **ta pati reikšmė** abiejose temose, todėl
  priepuolis ir kalendoriaus įrašas, o `CAT_COLOR` gydytojo vizitas ir operacija nesiskyrė
  niekuo. Dabar `#6B4E8E` / `#BFA3D9`.
- **Brūkšnelio kalendoriuje NEKEISK atgal į tašką.** Naujos spalvos šviesumo santykis prieš
  `blue` tėra 1,02 ir 1,12: skiriasi atspalvis, ne šviesumas, tad spalvų neskiriančiam
  žmogui jos ir toliau susilies. Forma tebėra vienintelis patikimas skirtukas.
- `sage` ir `amber` patamsinti: ant savo `*Soft` fonų davė 4,24 ir 4,39, tai žemiau AA.
  Tai buvo kiekvieno jungiklio „Įjungti“ būsena. Dabar **visos 23 teksto poros praeina AA**,
  silpniausia 4,72 šviesioje ir 5,51 tamsioje.
- Pridėtas **`lineStrong`** valdiklių kraštinėms (laukeliai, chip'ai, `Segmented`, `+/−`,
  `DotScale`, dozės eilutė): 3,50 ir 3,45 ant kortelės, virš WCAG 3:1. `line` liko
  skirtukams ir kortelėms, kad programėlės oras nesikeistų.
- **`clay` pervadintas į `accent`** (27 vietos): jis petrolinis, ne molio spalvos, ir
  prasilenkdavo su jau egzistavusiu `onAccent`. `plum` vardas paliktas, nes po spalvos
  taisymo jis pagaliau teisingas.
- **`CAT_COLOR.other` turėjo įrašytą literalą `#EBE9E0`**, ne kintamąjį, todėl
  nepersijungdavo su tema: tamsioje `C.sub` ant jo davė 1,85:1. Dabar naujas `subSoft`.

---

## Kas pasikeitė dar anksčiau (v1.6)

### Vaistų priminimai gavo veiksmo mygtuką
- Pranešime yra **„Išgėriau"** (`DOSE_ACTION_TYPE`, `initActions`, `onDoseAction`
  faile `src/notifications.js`). Iki tol dozės pažymėjimas kainavo keturis veiksmus:
  atrakinti telefoną → atidaryti Aurą → surasti dozę → paspausti. Realiai tabletė
  būdavo išgeriama, o pažymėjimas ne, ir **ataskaitoje tai atrodė identiškai kaip
  praleista dozė**. Vienintelis skaičius, dėl kurio programėlė egzistuoja, krypdavo
  žemyn be priežasties.
- Pranešimai neša `extra: { medId, time, dk }`. Tai **vienintelis kelias atgal į dozę**:
  pranešimo ID yra `notifId` maiša, iš jos nieko neatstatysi. Nesugadink `extra`.
- Klausytojas registruojamas **tik po `loaded`**: paleidžiant programėlę iš pranešimo
  `loadData()` yra asinchroninis, ir anksti pažymėta dozė būtų perrašyta įkeltais
  duomenimis. Įvykis pristatomas tada, kai atsiranda kas jį priima, tad laukti saugu.
- **Apribojimas:** Capacitor Android veiksmo mygtukas **atidaro programėlę**. Tikro
  foninio pažymėjimo plugin'as nepalaiko. Keturi veiksmai virto vienu, ne nuliu.

### Kalendorius rodo priepuolius
- Iki tol tinklelis rodė tik savus `data.events`, o `buildReport` jų neėmė;
  skirtukas buvo atskira, prastesnė telefono kalendoriaus kopija.
- Dabar dienos langelyje priepuoliai eina pirmi, pasirinktos dienos kortelėje:
  laikas, tipas ir trukmė (tik peržiūra; redaguojama Priepuolių skirtuke).
- **Priepuolio žymė yra brūkšnelis, ne taškas.** `C.plum` ir `C.blue` paletėje yra
  **ta pati spalva**, tad gydytojo vizitas ir priepuolis skirtųsi tik dydžiu.
  Forma skiria patikimiau ir veikia esant spalvų neskyrimui. Nekeisk atgal į tašką.

### Užrašų skirtukas pašalintas
- Buvo **trys vietos laisvam tekstui** (`data.notes`, `data.daily[].note`, `s.note`),
  ir **nė viena nepatekdavo į ataskaitą**. Rašymas buvo aklavietė.
- Sprendimas: ne kurti užduočių sąrašo, o padaryti, kad rašymas patektų į ataskaitą.
  `buildReport` dabar renka visus laisvo teksto šaltinius su data ir priepuolio tipu.
- **Migracija `migrateNotes()`** perkelia senus užrašus prie tos dienos, kurią jie
  paskutinį kartą redaguoti. Be jos jie būtų likę duomenyse ir kopijose, bet be jokio
  kelio juos pamatyti. Idempotentiška. `notes` laukas paliktas tuščias masyvas, kad
  senų kopijų formato tikrinimas (`backup.js`) nesulūžtų. **Neištrink jo.**
- Ataskaitos pastabos **neapkarpomos**: tyliai nutraukti medicininį pastebėjimą būtų
  blogiau nei ilga ataskaita.

### Priepuolio ir auros mygtukai perkelti
- Iš Vaistų skirtuko pašalinti abu. „Jaučiu aurą" **perkeltas į Priepuolius, ne
  ištrintas**: jis egzistavo tik Vaistuose, tad šalinimas būtų panaikinęs funkciją.
- Veikiantis laikmatis Vaistuose **lieka matomas**: 5 min riba svarbesnė už skirtukų tvarką.
- Priepuolių skirtuke dabar trys mygtukai iš eilės. **Hierarchija neišspręsta**: žr.
  „Atviri klausimai".

### Priepuoliai tapo pirmu skirtuku
- Programėlė atsidaro ties Priepuoliais, ne Vaistais. Priežastis: priepuolį registruoti
  reikia čia ir dažnai skubiai, o dozę pažymėti galima tiesiai pranešime.
- Kaina: kasdienis veiksmas (dozės žymėjimas) nutolo vienu paspaudimu. Sąmoningas mainas.

### Apžvalga rodo visus skirtukus
- Ji būtų sulūžusi ir be to: du žingsniai rodė į perkeltus mygtukus, vienas į ištrintą skirtuką.
- Anksčiau Kalendorius ir Būsena tebuvo apvedami apatinės juostos piktogramoje: matėsi,
  kur paspausti, bet ne ką ten rasi. Dabar **8 žingsniai**, kiekviename apvedamas turinys.
- Tvarka: Priepuoliai (juosta, laikmatis, aura, registravimas) → Vaistai → Kalendorius →
  Būsena → ataskaita. Pabaigoje grįžtama į `HOME_TAB`.
- `Card` gavo `tour` prop'ą, kad būtų galima apvesti ne tik mygtukus.
- Vertimų raktai pervadinti iš `tour1…tour8` į vardinius (`tourNav`, `tourTimer`, `tourLog`…).
  Perstačius žingsnį numeriai imdavo meluoti.
- **Spotlight užsidaro, jei taikinio neranda** (`else onClose()`). Todėl pridedant žingsnį
  būtina patikrinti, kad `data-tour` egzistuoja tame skirtuke ir tuo metu, kai žingsnis rodomas.

### Tekstas išvalytas
- Iš viso vartotojui matomo teksto pašalinti ilgieji brūkšniai (`—`), 114 vietų keturiose
  kalbose. Pakeisti kableliais, dvitaškiais, taškais arba `·` skirtuku.
- **`"—"` kaip reikšmės vietos žymė palikta** (miegas, laikymasis, stresas, kai duomenų nėra).
  Devynios vietos, jų neliesk: ten brūkšnys reiškia „nėra duomenų“, o ne skyrybą.
- Kodo komentaruose brūkšniai palikti sąmoningai: jie į programėlę nepatenka.
- Ištaisyta: RU `auraHint` buvo suklijuoti žodžiai („содержаниеауры“); PL `fbPh` ir `fuBody`
  turėjo vyriškos giminės formas, pakeistos į beasmenes; PL `taken` pataisyta žodžių tvarka.

### Workflow sutvirtintas
- `if-no-files-found: error` prie APK. Be jo job'as būtų žalias su tuščiu artifact'u.
- `--stacktrace` + `gradle-reports` artifact'as per `if: failure()`.
- `npx @capacitor/assets` → `npx capacitor-assets` (paketo vardas ≠ bin vardas).
- `npm install` → `npm ci`. Lockfile'o sutapimas patikrintas.
- Naujas žingsnis „Accept SDK licenses".

---

## Kas pasikeitė seniau (v1.5 ir anksčiau)

### Ženklas ir piktogramos
- Senasis 12 spindulių ženklas buvo **tos pačios konstrukcijos kaip Claude logotipas**. Pakeistas.
- Naujas ženklas: **šešialapė forma** `r(θ) = R·(1 + 0,22·cos(6θ))`, storas kontūras.
  Komponentas `AuraMark` faile `src/App.jsx`.
- `tools/make-icons.mjs` generuoja **visas** piktogramas iš tos pačios formulės: `icon-only.png`,
  adaptyvūs sluoksniai, Android 13+ temuota (`ic_launcher_monochrome_*`), splash, pranešimų ikonos.
  **Pakeitus formą kode, būtina paleisti `npm run icons`**. Kitaip sąsaja ir piktograma prasilenks.
- Workflow anksčiau **iš viso neįdėdavo piktogramų į APK**. Pridėta `npx @capacitor/assets generate
  --android` ir temuotos piktogramos įdiegimas su `<monochrome>` įrašu.
- `@capacitor/assets` ieško `icon-only.png`, o ne `icon.png`. Senas vardas būtų tyliai ignoruotas.

### Tema
- Paletė perdaryta į **CSS kintamuosius**: `PALETTE.light` / `PALETTE.dark`, o `C.x` išsiverčia į
  `var(--c-x)`. Taip 272 spalvų panaudojimai liko nepaliesti.
- Nustatymai → Išvaizda: **Automatinė / Šviesi / Tamsi**. Numatytoji, automatinė.
- Išimtys, kur `var()` neveikia: SVG `stroke=` atributai (perkelta į `style`) ir native API
  (`setNativeTheme` gauna tikrą HEX).
- `C.white` yra **paviršiaus**, ne baltumo žyma, tamsioje temoje ji tamsi. Tikras baltas įrašytas
  literalu tik apvedimo žiedui.
- Kontrastai perskaičiuoti šioje sesijoje: **visos 23 teksto poros praeina WCAG AA**,
  silpniausia 4,72 šviesioje ir 5,51 tamsioje. Ankstesnis teiginys apie 5,78 negaliojo:
  trys poros buvo žemiau 4,5. Prieš keisdamas bet kurią spalvą, perskaičiuok, o ne spėk.

### Pirmo paleidimo srautas
- **Nustatymo ekranas** (`SetupSheet`): kalba, vardas, priminimų įjungimas. Rodomas tik pirmą kartą.
- **Apžvalga** (`TOUR_STEPS` + `Spotlight`): tuomet 8 žingsniai (dabar 7), apvedantys tikrus elementus.
  Persijungia į atitinkamą skirtuką, pabaigoje grįžta į Vaistus.
  Pakartotinai paleidžiama per Nustatymai → „Peržiūrėti apžvalgą“.
- **Bendrasis gidas „Kaip naudotis“ pašalintas** vartotojo sprendimu, per daug teksto, niekas
  neskaito. Pašalinta 108 vertimų įrašai. Liko vienas tekstas: `NotifHelpSheet`.

### Priminimai
- **Miego priminimas**: Nustatymuose jungiklis + laikas, atskiras kanalas `bed`. Numatytai išjungtas.
  ID ruožas `2000000100–2000000113`, tikslūs `at` taškai 14 d. į priekį.
- Ištaisyta klaida: `cancelAll()` naikindavo **visus** laukiančius pranešimus, todėl mėnesinis
  kopijos priminimas dingdavo po pirmo programėlės minimizavimo ir nebeatsistatydavo.
  Dabar `cancelAll(keepIds)` išfiltruoja svetimus ID.
- `BACKUP_ID` buvo `1900000001`, **`notifId` diapazone**, nors komentaras teigė priešingai.
  Pakeltas iki `2000000001`.

### Kita
- Iš `src/` pašalintas užkomitintas viso projekto dublikatas (25 identiški failai, `src/src/` ir kt.).
- Atsakomybės tekstas prilipintas prie ekrano apačios (`margin-top: auto`).

---

## Sprendimai, kurių NEPERSVARSTYK be priežasties

### Reguliaciniai
- **Kvėpavimas, tik atsipalaidavimas.** Negalima teigti, kad jis mažina priepuolius. Todėl
  kvėpavimo seansai **neįtraukiami į ataskaitą gydytojui**.
- **Miego priminimo tekstas neutralus.** „Metas ruoštis miegoti · Šį laiką nusistatei pats.“
  Nė žodžio apie tai, kad miegas mažina priepuolius, tai būtų medicininis nurodymas.
- **Jokios savidiagnostikos**, jokių fiksuotų klinikinių ribų.
- **5 min aliarmas neskambina pats.**

### Fotosensityvumas
- Paletė atitraukta nuo raudonos-oranžinės zonos abiejose temose.
- **`plum` ir `blue` skiriasi atspalviu, bet ne šviesumu** (1,02 ir 1,12). Todėl kalendoriuje
  priepuolio žymė yra brūkšnelis, o įrašo taškas. Spalvos atskyrimas šito nepakeitė.
- **Jokių animacijų virš ~1 Hz.** Apvedimo fonas pritemsta vieną kartą per 600 ms ir nejuda,
  net keičiantis žingsniui. Todėl `Spotlight` niekada nevalo `rect`: nuvalius, ekranas kas žingsnį
  prašviesėtų ir vėl aptemtų.
- Apvedimo animacija **be `fill-mode: both`** sąmoningai: su juo neįvykusi animacija paliktų
  `opacity: 0` ir apvedimo nesimatytų visai. Geriau pasirodyti iškart, nei dingti.
- Lietimo taikiniai 44 px.

### Duomenų integralumas
- **Tri-state, ne boolean.** `alcohol` ir `aura` gali būti `null` = neatsakyta.
- **Laukas `notes` neištrinamas**, nors skirtuko nebėra: `backup.js` tikrina jo formą,
  o `migrateNotes()` turi kur nusileisti restauravus seną kopiją.
- **Vaistų laikymosi vardiklis pagal dieną** (`scheduledOn` + `timesFrom`).
- **Enum'ai saugomi ID, ne tekstais.**
- **Pašalinti trigeriai lieka vertimų žodyne** (`t.tg`).
- **Išmatuota trukmė `durSec`**, senas `dur` intervalas išvedamas iš jos.

### Techniniai
- **Laikmačio `startedAt` rašomas TIESIAI į Preferences**, apeinant 700 ms debounce.
- **Praėjęs laikas visada iš sieninio laikrodžio.**
- **Pranešimai, tikslūs `at` taškai 14 d. į priekį**, ne `schedule.on`. Išimtis: mėnesinis kopijos
  priminimas naudoja `every: "month"`, nes praleistas jis nieko nekainuoja.
- **Leidimas tikrinamas PRIEŠ `cancelAll()`.**
- **Vienas pakartojimas po 30 min** nepažymėtai dozei. Be eskalacijos.
- **Šriftai lokaliai** (`@fontsource-variable`).
- **`dkey()` bendras** `App.jsx` ir planuokliui.

- **Pranešimų `extra` yra vienintelis kelias atgal į dozę.** ID yra maiša.
- **Miego ir kopijos priminimai nepriklauso nuo `notify`.** Tas jungiklis nustatymuose
  vadinasi „Vaistai“, ir jį išjungęs žmogus nesitiki prarasti kitų dviejų. Leidimo prašo
  kiekvienas jungiklis atskirai.
- **Apžvalgos metu puslapis užrakinamas.** `rect` yra taškas ekrane, tad slinkimas jį
  sugadintų. Užraktas uždedamas kartu su matavimu, ne anksčiau. Slenkama tik `scrollTo`
  be animacijos: `behavior: "smooth"` nepiešiamame lange nevyksta, ir matuojama sena vieta.
- **`adjustMarginsForEdgeToEdge: "disable"`.** Capacitor paraštes nuspalvina sistemos
  DayNight fonu, ne programėlės tema, todėl tamsi tema šviesiame telefone gaudavo baltas
  juostas. Vietą juostoms palieka pati programėlė (`--sa-top`, `--sa-bottom`). Grąžinus
  „auto", baltos juostos grįš.
- **Ankstesnio laikotarpio skaičius rodomas tik turint senesnių įrašų.** Be šios sąlygos
  programėlės pradžia atrodytų kaip priepuolių padažnėjimas, o dienyno pradžia – kaip nulis.
- **Vienas priminimas vienam laikui, ne vienam vaistui.** ID eina per laiką (`slotKey`),
  kūne surašomi tik nepažymėti vaistai, „Išgėriau" pažymi juos visus. Grąžinus atskirus
  pranešimus, du vaistai vėl duotų dvi vienodas žinutes vienas ant kitos.
- **`doses` yra papildymas, ne pakeitimas.** `dose` lieka bendra vaisto dozė, `doses`
  nurodo tik tuos laikus, kurie skiriasi. Skaityti visada per `doseFor(med, time)`.
- **Dozė galioja nuo `timesAt`, ne nuo dienos pradžios.** Vaistas pridedamas konkrečią
  valandą; iki jos tos dienos dozių nebuvo. Pažymėta dozė skaitosi visada, net prieš
  `timesAt`.
- **`DOSE_GRACE_MIN = 30` yra rodymo, ne klinikinė riba.** Vaisto langą žino gydytojas,
  ne programėlė.
- **`lineStrong` valdikliams, `line` skirtukams.** Kraštinė, rodanti būseną, privalo
  turėti 3:1; kortelės kraštinei to nereikia ir su ja programėlė atrodytų sunkesnė.

### Tekstas
- **Jokių ilgųjų brūkšnių (`—`) vartotojui matomame tekste.** Jie skamba kaip mašinos rašyti.
  Vietoj jų kablelis, dvitaškis, taškas arba `·`. Išimtis viena: `"—"` kaip „nėra duomenų“.
- **Beasmenės formos ten, kur kalba turi giminę.** RU ir PL būtasis laikas 1 ir 2 asmeniu yra
  giminiškas; mygtukuose ir pranešimuose vartok neutralias formas („Выпито“, „Zażyte“).
- **Sakinys turi tilpti į vieną eilutę.** Apžvalgos ir tuščių ekranų tekstai ilgesni neskaitomi.

### Produktas
- **Vertė = ataskaita gydytojui.** Iš to seka paprasta taisyklė: **jei funkcija nepatenka
  į ataskaitą, ji turi turėti labai gerą kitą pateisinimą.** Būtent dėl šito iškrito
  Užrašų skirtukas ir dėl šito kalendorius liko, kai ėmė rodyti priepuolius.
- **Aura yra vienintelė priepuolio dalis, kurią išgyveni sąmoningai.** Todėl „Jaučiu aurą"
  yra realiai paspaudžiamas mygtukas, o „Prasidėjo priepuolis" generalizuoto priepuolio
  atveju, ne. Nemaišyk jų vertinimo į vieną.
- **Registracija: tik lokaliai.** Sveikatos duomenys = BDAR 9 str.
- **Monetizacija: jokios.**

---

## NEDARYTI (siūlyta ir atmesta)

Paskyros, debesies sinchronizacija, analitika, Health Connect, video priedai, kalendoriaus
sinchronizacija, priepuolių/kritimo detekcija, SOS kortelė, pritaikomi pranešimai.

**Užduočių sąrašas / to-do.** Svarstyta rimtai, nes realiai programėlė atidaroma tada, kai
reikia kažką užsirašyti. Atmesta: tai labiausiai perpildyta kategorija telefone, Aura
pralaimėtų bet kuriai iš jų, o pralaimėti reiškia nustoti ją atidarinėti, ir kartu prarasti
vaistų žymėjimą bei dienyną. Vietoj to laisvas tekstas nuvestas į ataskaitą.

---

## Neišspręstos problemos

**1. Gradle build niekada nebuvo paleistas.** Tebėra didžiausia rizika projekte. Workflow kiekvieną
kartą iš naujo generuoja `android/`, regex'u laužiasi į manifestą, generuoja piktogramas;
keturios vietos, kur gali lūžti, ir nė viena nė karto neveikė. Šioje sesijoje workflow'as
sutvirtintas (žr. aukščiau), bet **sutvirtintas ≠ paleistas**. Kol nėra APK, visa kita yra teorija.
Lūžus, imk `gradle-reports` artifact'ą.

**2. Sugadinti duomenys nuslepiami ir perrašomi.** `App.jsx` `loadData()` klaida gaudoma su
komentaru „dar nėra įrašų“, bet į tą patį `catch` patenka ir `JSON.parse` klaida. Programėlė
startuoja tuščia, o pirmas `update()` perrašo raktą. Vartotojas negauna jokio įspėjimo.
Reikia atskirti „rakto nėra“ nuo „raktas neparsina“. **Reikalauja sprendimo, ką rodyti vartotojui.**

**3. Šalutinis efektas `setData` viduje.** `update()` kviečia `persist(next)` iš state updater'io.
Su `StrictMode` tai vykdoma du kartus. Dabar nekenkia, bet yra spąstai ateičiai.

**4. Versijų nesutapimas.** `aboutText` visose keturiose kalbose sako „prototipas v1.4“,
`APP_VERSION` irgi „1.4“, o `package.json`, `0.6.0`. Patvirtinta, neištaisyta: reikia tavo
sprendimo, koks numeris teisingas.

**5. Miego langas nepasirodo su numatytaisiais laikais.** Būsenos pasiūlymas reikalauja
įrašyto `waketime`, o jis įrašomas tik pajudinus laiko lauką. Nustatymuose 22:30–07:00
matosi iš karto, tad atrodo, kad langas jau nustatytas. Reikia sprendimo: ar įrašyti
numatytuosius per migraciją, ar rodyti pasiūlymą ir be įrašo.

**6. Negyvas kodas, rastas audito metu, nepašalintas.** `d.calm` rašomas ir niekada
neskaitomas; 10 vertimų raktų × 4 kalbos nenaudojami (`tWell`, `save`, `missed`, `auraYes`,
`auraNo`, `doneMin`, `stoppedMin`, `sessions`, `minTotal`, `bkPick`); `Wind` importuojamas
be reikalo; `aura-standalone.html` yra 638 KB senos versijos kopija repozitorijoje;
`planNotifications` ir `safetyBackup` eksportuojami, nors naudojami tik savo moduliuose.

---

## Atviri klausimai (reikia sprendimo, ne kodo)

**Priepuolių skirtuko hierarchija.** Dabar trys mygtukai iš eilės: „Prasidėjo priepuolis"
(pagrindinis) · „Jaučiu aurą" · „Registruoti priepuolį" (pilkas tekstas). Siūlyta apversti:
retrospektyvinis registravimas surinks ~90 % įrašų, o laikmačio generalizuoto priepuolio metu
paspausti neįmanoma. Nepritarta ir neatmesta.

**Ar laikmatis apskritai reikalingas.** Argumentai už: židininiai priepuoliai su išlikusia
sąmone, artimojo naudojimas, 5 min riba. Prieš: paleidus jį per aurą, sustabdyti nebus kam,
ir po valandos `seizStale` duos šiukšlinę trukmę.

---

## Kas NEIŠTESTUOTA realiame telefone

1. ~~Pranešimų grandinė~~, **patikrinta, veikia** (žr. žemiau apie Xiaomi).
2. **Laikmatis per naktį**: startas, programėlės uždarymas, 6 min, atidarymas.
3. **Atsarginė kopija**: ar atsidaro Android dalinimosi langas.
4. **Gradle build**: niekada nepaleistas.
5. **Miego priminimas**: logika patikrinta vienetiniais testais, telefone ne.
6. **Tamsi tema**: patikrinta apskaičiuotais stiliais ir kontrasto matematika, akimis nematyta.
7. **„Išgėriau" mygtukas pranešime**: naršyklėje netikrinamas iš principo (`isNative()` = false).
   Patikrinta tik tai, kad `planNotifications` visiems 54 pranešimams prideda `actionTypeId`
   ir pilną `extra`. Ar mygtukas pasirodo ir ar klausytojas suveikia, tik APK'e.
8. **Miego pranešimas nurodytu laiku.** Visa grandinė iki `LocalNotifications` naršyklėje
   net nepaleidžiama. Kad ateitų 21:00, matysis tik APK'e.
9. **Atsiliepimo siuntimas.** `mailto:` per `location.href` ir „Siųsti kitaip“ per
   `@capacitor/share` abu yra native keliai. Naršyklėje patikrinta tik tai, kad
   diagnostikos blokas susirenka teisingai ir kad dalinimosi mygtukas web'e nerodomas.
10. **Sujungtas priminimas telefone.** Naršyklėje patikrinta tik `planNotifications` ir
    `slotNotifications` išvestis. Ar viena žinutė su dviem vaistais atrodo gerai ir ar
    „Išgėriau" pažymi abu, matysis tik APK'e. Ten pat matysis ir tai, kaip atrodo perėjimas:
    telefone dar gulinčios senos žinutės turi `extra.medId`.
11. **Edge-to-edge Android 15 telefone.** `adjustMarginsForEdgeToEdge: "disable"` ir
    `--sa-top` / `--sa-bottom`. Naršyklėje insets yra 0 px, tad tikrinta tik tai, kad
    maketas nepakito. Telefone matysis dvejopai: ar juostų vietoje dabar programėlės fonas,
    ir ar antraštė su skirtukų juosta nepakliuvo po sistemos juostomis.
12. **Apžvalgos slinkimo užraktas telefone.** Patikrinta naršyklėje: `body` ir `html`
    `overflow` tampa `hidden` kartu su matavimu ir atsileidžia išeinant, o žiedo padėtis
    sutampa su taikiniu per 6 px `pad`. Ar `touchAction: "none"` sustabdo pirštą realiame
    WebView'e, nepatikrinta.

### Kas patikrinta naršyklėje šioje sesijoje

- Du vaistai tuo pačiu 08:00 laiku: abi kortelės rodo savo dozes atskirai, `doseLog` raktai
  (`medId@time`) nesusiduria.
- Ataskaita su 5 priepuoliais, 2 vaistais ir 40 d. dienos įrašų: trys skyriai, du dideli
  skaičiai, „Žymėjimo laikas" ir „Pasekmės" gula po etikete per visą plotį. 90 d. lange
  „Ankstesnės 90 d." eilutės nėra, nes dienyne nėra tiek senų įrašų — būtent taip ir turi būti.
- Tuščias dienynas: „Priepuoliai 0" ir laikotarpis, daugiau nieko. Be lūžių, be tuščių kortelių.
- Tekstinė ataskaita abiem langais: datos, ankstesnis langas, vaistai su dozėmis prie laikų.
- `planNotifications` su dviem vaistais 08:00 ir vienu 20:00 duoda 56 pranešimus 14 dienų:
  po vieną kiekvienam laikui plius pakartojimas. 08:00 kūnas – „Levetiracetamas 500 mg ·
  Lamotriginas 100 mg", `extra.medIds` abu. Pažymėjus vieną, tas pats laikas persidaro į
  „Lamotriginas 100 mg" su vienu ID.
- Skirtingos dozės: forma įkelia 08:00 tuščią su vietos ženklu „500 mg" ir 20:00 „1000 mg";
  įrašius atsiranda `doses` žemėlapis, `timesFrom` nepasikeičia; kortelė rodo dozes prie
  laikų, o Lamotriginas su viena doze – antraštėje. Ataskaitos tekstas abiem pavidalais.
- Dozės laukelis telefono plotyje (375 px): laikas 124 px, dozė 161 px, šalinimo mygtukas
  telpa.
- 19:21 pridėtas vaistas su 08:00 laiku rodo „Nuo rytojaus", ne „Vėluoja"; suvestinė rodo „—".
  Pažymėjus tą dozę: „Išgerta 1 iš 3", 100 %.
- 08-18 pridėtas vaistas tą pačią akimirką rodo „Vėluoja" — sena elgsena nesugadinta.
- Apžvalga su dviem vaistais: visi 8 žingsniai, žiedas ties taikiniu, taikinys ekrane.
- `--sa-top` / `--sa-bottom` išsisprendžia į 0 px, skirtukų juostos ir lapų maketas nepakitęs.
- `npm run build` praeina.

### Kas patikrinta naršyklėje v1.7 sesijoje

- Nustatymų kortelės abiejose temose, visos eilutės savo vietose.
- Miego langas: įvedus 21:00–07:00, Būsenoje atsiranda „· 10 h“.
- Apžvalga: žiedo padėtis 1, 2 ir 5 žingsniuose sutampa su taikiniu, užraktas uždedamas
  ir atsileidžia.
- Priepuolio registravimas, vaisto pridėjimas, dozės žymėjimas, ataskaita.
- Dozių nukrypimas: 406, −234 ir 487 min duoda „3 iš 3 · vidutiniškai 6 h 16 min ·
  daugiausia 8 h 7 min vėliau“. Aritmetika perskaičiuota ranka, sutampa.
- Atsiliepimo kortelė matoma visuose keturiuose skirtukuose ir stovi žemiau
  „Prasidėjo priepuolis“.
- Paletė: visi vienuolika naujų ir pervadintų kintamųjų išsisprendžia abiejose temose,
  `var(--c-clay*)` niekur neliko.

### Kas patikrinta naršyklėje anksčiau (ne telefone)

- Kalendoriaus priepuolių žymės, dienos kortelė, abu trukmės formatai (`dur` ir `durSec`).
- Užrašų migracija: du tos pačios dienos užrašai sujungti, esama dienos pastaba nepaliesta,
  `notes` liko tuščias.
- Ataskaitos „Pastabos" skiltis su visais trimis šaltiniais.
- Keturi skirtukai, Vaistuose nebėra priepuolio/auros mygtukų, Priepuoliuose yra abu.

---

## Xiaomi / MIUI, svarbu

Priminimai ateidavo tik atidarius programėlę. Priežastis **ne kodas ir ne Android leidimai**:
laukiančių pranešimų eilė buvo pilna, bet MIUI neleisdavo jų parodyti.

**Išsprendė:** programos baterijos nustatymas → **Be apribojimų (No restrictions)**.
Tai pasirodė svarbiau nei Autostart.

Programėlė šito **aptikti negali**: MIUI baterijos apribojimo būsena neprieinama per Android API.
Todėl vienintelis sprendimas yra tekstas gide (`NotifHelpSheet`), kur baterijos taupymas surašytas
pirmu punktu. Nekeisk tos tvarkos be priežasties.

---

## APK generavimas

GitHub → Actions → Build APK → Run workflow → Artifacts → `aura-debug-apk`.

`.github` katalogo naršyklės drag-and-drop **nepakelia**: kurk per Add file → Create new file.

**Play Console:** privatumo politikos URL, Data safety („no data collected"), Health apps
deklaracija, „ne medicinos prietaisas" aprašyme, API 36. Asmeninėms paskyroms, 12 testuotojų ×
14 d. Tai kalendorinis laikas, kurio nepagreitinsi kodu, verta pradėti anksčiau, nei programėlė
bus „baigta“. `USE_EXACT_ALARM` reikės pagrįsti.

---

## Darbo stilius

Konciziai, po vieną temą. Argumentuoti ir prieštarauti, kai sprendimas silpnas, bet be tuščio
ginčo. Trūkstant konteksto pasakyti atvirai, o ne spėlioti. **Prieš teiginį apie kodo elgseną
patikrinti, o ne pasikliauti prielaida.**

### Testavimo spąstai, į kuriuos jau įkliuvau

- **`localStorage.clear()` + `reload()` neveikia.** Uždarant puslapį suveikia `pagehide` → `flush()`,
  kuris iškart po išvalymo įrašo senus duomenis atgal. Vietoj to: palaukti ~1,6 s, kol atidėtas
  įrašymas praeis ir `pending` taps `null`, tada įrašyti švarią būseną ir perkrauti.
- **Naršyklės skydelis nerodomas → puslapis nekomponuoja kadrų.** CSS perėjimai neįvyksta,
  `getBoundingClientRect()` grąžina užstrigusį išdėstymą, `setTimeout` apribojamas iki ≥1000 ms.
  Matuok iš inline stiliaus ir lauk ≥1,8 s tarp žingsnių.
- **`SendUserFile` atvaizdavimas blokuoja `<script>`.** HTML peržiūros generuok su statiniu SVG.
- **Perjungęs peržiūros lango dydį, grąžink.** Palikus „mobile" (375 px) platesniame skydelyje
  atrodo, kad programėlė rodo tik pusę ekrano. Tai atrodo kaip klaida kode ir sugaišina laiko.
  Turinys ir taip visada lieka **480 px stulpeliu ekrano viduryje**: tai sąmoninga, Aura yra
  telefono programėlė, ne responsyvus tinklalapis.
- **Konsolės klaidos išlieka po perkrovimo.** Skaitydamas jas žiūrėk į modulio `?t=` žymę:
  senesnė už dabartinę reiškia tarpinę HMR būseną redagavimo metu, ne esamą klaidą.
- **Skirtukų perjungimas cikle nieko neparodo.** React nespėja perpiešti tarp sinchroninių
  `click()` iškvietimų, visi matavimai grąžins tą patį. Tikrink po vieną.
- **Apžvalgos žiedas vėluoja, kai žingsnis perjungia skirtuką.** Su 1,9 s pauze trys žingsniai
  atrodė „nepataikę“, nors žiedas tiesiog dar stovėjo ankstesnio žingsnio vietoje. Su 4 s visi
  aštuoni švarūs. Prieš skelbiant klaidą patikrink, ar žiedas nėra ties **ankstesniu** taikiniu.
- **Nekomponuojant kadrų `behavior: "smooth"` neveikia visai.** `scrollTo` su „smooth“
  lieka ties 0, o su „instant“ nuvažiuoja. Todėl apžvalgos žingsnis, kuriam reikia
  nuslinkti, peržiūroje atrodo kaip klaida, nors kode viskas gerai.
- **Matuok iš inline stiliaus, ne `getBoundingClientRect()`.** Tomis pačiomis sąlygomis
  `rect` grąžina užstrigusią praeitą padėtį: žiedo stilius sakė `top: 74px`, o `rect`
  rodė 740. Vos nepaskelbiau veikiančio kodo sugedusiu.
- **`npm run build` nepagauna neapibrėžtų kintamųjų.** `doseAt` buvo neimportuotas, build
  praėjo žaliai, o ataskaitos skirtukas lūžo į baltą ekraną. Po kiekvieno naujo modulio
  kvietimo atsidaryk tą ekraną, o ne pasitikėk build'u.
- **Konsolės klaidų buferis neišsivalo pats.** Po redagavimo ten kelias minutes gulėjo
  `lockScroll is not defined` iš tarpinės HMR būsenos. Žiūrėk į modulio `?t=` žymę: mano
  atveju klaidos buvo 59 s senesnės už tuo metu įkeltą modulį.
- **Vartotojas gali naudotis programėle tuo pačiu metu.** Šioje sesijoje pasikeitė kalba,
  vardas, tema ir duomenys man nieko nedarant. Prieš skelbiant „X neveikia“, patikrink,
  ar būsena vis dar ta, kurią tikriesi.

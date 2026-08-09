# Aura: projekto perdavimas (v1.6 / po commit'o „Aura V7“)

Įklijuok šį failą į naują pokalbį. Kodas yra `C:\Users\Vartotojas\Desktop\aura`.

Viskas užkomitinta į `main`. Prieš pradėdamas patikrink `git status` ir `git log --oneline -3`.

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
src/App.jsx           visa sąsaja + vertimai (~2670 eil.)
src/backup.js         eksportas/importas, schemaVersion validacija
src/seizureTimer.js   priepuolio laikmatis (Preferences, sieninis laikrodis)
src/notifications.js  vaistų priminimai, mėnesinis kopijos, miego priminimas
src/dates.js          BENDROS datų funkcijos (dkey turi būti vienas!)
src/native.js         splash, status bar, „atgal", grįžimas iš fono, temos spalvos
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

## Kas pasikeitė ankstesnėje sesijoje

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
- Visos 14 spalvų porų abiejose paletėse praeina **WCAG AA** (silpniausia 5,78:1).

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
`package.json`, `0.6.0`. Patvirtinta, neištaisyta: reikia tavo sprendimo, koks numeris teisingas.

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

### Kas patikrinta naršyklėje (ne telefone)

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

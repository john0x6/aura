import { useState, useEffect, useRef, useMemo } from "react";
import { load as loadData, save as saveData, clear as clearData } from "./storage";
import { syncMedReminders, initChannel, permissionState, requestPermission, isNative,
         cancelDose, restoreDose, pendingCount, FOLLOWUP_MIN } from "./notifications";
import { pad, dkey, todayKey, addDays } from "./dates";
import { syncBackupReminder, syncBedtimeReminder, initActions, onDoseAction } from "./notifications";
import { exportBackup, validateBackup, restoreBackup } from "./backup";
import { startTimer, loadTimer, clearTimer, elapsedSec, isStale, fmtDuration, bucketOf, ALERT_SEC } from "./seizureTimer";
import { hideSplash, initStatusBar, setNativeTheme, onBackButton, onResume, exitApp } from "./native";
import { Pill, Zap, Activity, Plus, X, Check, Trash2, Minus, Wind, CalendarDays, ChevronLeft, ChevronRight, Play, Square, FileText, Settings as Cog, Pencil, Pause, AlertTriangle } from "lucide-react";

// ---------- design tokens: Claude-style ----------
/**
 * Dvi paletės. Abi atitrauktos nuo raudonos-oranžinės zonos: perėjimas į sotų
 * raudoną laikomas rizikos veiksniu net statiniame vaizde, o akcentas kartojasi
 * visame ekrane.
 *
 * `white` yra paviršiaus, o ne baltumo žyma — devyniose vietose ja dengiami
 * laukeliai ir kortelės, todėl tamsioje temoje ji privalo patamsėti. Tikro balto
 * reikia tik apvedimo žiedui, ir ten įrašytas literalas.
 */
const PALETTE = {
  light: {
    bg: "#EDF1F2", card: "#FFFFFF", white: "#FFFFFF", onAccent: "#FFFFFF",
    ink: "#1B2A31",          // gilus skalūnas, ne juoda – mažesnis šviesumo skirtumas
    sub: "#546A76", line: "#D8E1E4",
    clay: "#1F6E6B", claySoft: "#E1EDEC", clayDark: "#175856",   // pagrindinis: petrolinis
    blue: "#4C5A8F", blueSoft: "#E7E9F3",
    sage: "#3F7A57", sageSoft: "#E3EDE6",
    amber: "#8A6520", amberSoft: "#F1E9D8",
    plum: "#4C5A8F", plumSoft: "#E7E9F3",   // priepuoliai: indigo, ne slyvinė
    red: "#96504A", redSoft: "#F2E6E4",     // tik kraštinei ir tekstui, niekada dideliam plotui
    sh1: "rgba(61,57,41,0.04)", sh2: "rgba(61,57,41,0.12)",
    sh3: "rgba(61,57,41,0.22)", sh4: "rgba(61,57,41,0.4)",
  },
  dark: {
    // Fonas nėra grynai juodas: baltas tekstas ant juodo duoda halo efektą, o
    // pilnas kontrastas naktį yra nepatogus tam, dėl ko ši tema apskritai daroma.
    bg: "#131B20", card: "#1B252B", white: "#1B252B", onAccent: "#0E1418",
    ink: "#E4EBEE", sub: "#9DB0B9", line: "#2C3A42",
    // akcentai pašviesinti: tamsiame fone tas pats petrolinis nebeįskaitomas
    clay: "#5FB3AE", claySoft: "#17332F", clayDark: "#8AD0CB",
    blue: "#94A3D6", blueSoft: "#232942",
    sage: "#74B48C", sageSoft: "#1B2E22",
    amber: "#D2AC66", amberSoft: "#33291A",
    plum: "#94A3D6", plumSoft: "#232942",
    red: "#D08C86", redSoft: "#33211F",
    sh1: "rgba(0,0,0,0.25)", sh2: "rgba(0,0,0,0.45)",
    sh3: "rgba(0,0,0,0.6)", sh4: "rgba(0,0,0,0.7)",
  },
};

/**
 * Kiekvienas raktas virsta `var(--c-*)`. Taip 272 spalvų panaudojimai lieka
 * nepaliesti, o tema keičiasi vienu atributu ant <html>.
 *
 * Kaina: šios reikšmės tinka tik CSS kontekste. SVG `stroke=`/`fill=` atributai
 * var() nepriima, todėl ten spalva paduodama per `style`, o native API (status
 * bar, theme-color) gauna tikrą HEX iš PALETTE.
 */
const C = Object.fromEntries(Object.keys(PALETTE.light).map((k) => [k, `var(--c-${k})`]));

const THEME_VARS = (p) => Object.entries(p).map(([k, v]) => `--c-${k}:${v}`).join(";");

const T = {
  serif: "'Literata Variable', Georgia, serif",
  body: "'IBM Plex Sans Variable', system-ui, sans-serif",
};

const GLOBAL_CSS = `
/* Tema keičiama data-theme atributu ant <html>. „auto“ paklūsta telefono temai,
   „light“ ir „dark“ ją nustelbia – todėl sistemos užklausa taikoma tik auto. */
:root { ${THEME_VARS(PALETTE.light)} }
:root[data-theme="dark"] { ${THEME_VARS(PALETTE.dark)} }
@media (prefers-color-scheme: dark) {
  :root[data-theme="auto"] { ${THEME_VARS(PALETTE.dark)} }
}
html, body { background: var(--c-bg); }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; }
button { cursor: pointer; border: none; background: none; padding: 0; }
input, textarea, select, button { font-family: inherit; color: inherit; }
:focus-visible { outline: 2px solid ${C.clay}; outline-offset: 2px; }
.press:active:not(:disabled) { transform: scale(0.98); }
/* 2,5 s ciklas = 0,4 Hz. Fotosensityviems pavojinga zona prasideda ties 3 Hz,
   todėl animacija sąmoningai lėta ir be ryškaus kontrasto. */
@keyframes breathe { 0%, 100% { opacity: 0.45 } 50% { opacity: 1 } }
.breathe { animation: breathe 2.5s ease-in-out infinite; }
/* Gido „parodyti“: vienkartinis lėtas atsiradimas, be pulsavimo ir be kartojimo.
   Mirksintis kontūras būtų būtent tas dažnis, kurio čia vengiam. */
@keyframes tourIn { from { opacity: 0 } to { opacity: 1 } }
/* native: jokio teksto žymėjimo laikant pirštą ir jokio „gumos“ efekto krašte */
body { overscroll-behavior-y: none; }
#root { -webkit-touch-callout: none; }
input, textarea { -webkit-user-select: text; user-select: text; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

// ---------- i18n ----------
const LANGS = [
  { id: "lt", name: "Lietuvių", locale: "lt-LT" },
  { id: "en", name: "English", locale: "en-GB" },
  { id: "ru", name: "Русский", locale: "ru-RU" },
  { id: "pl", name: "Polski", locale: "pl-PL" },
];

const STR = {
  lt: {
    tagline: "Epilepsijos dienynas", loading: "Kraunama…", notSaved: "Neįrašyta į atmintį",
    disclaimer: "Duomenys saugomi tik šiame telefone. Programėlė nėra medicinos prietaisas ir nekeičia gydytojo.",
    tMeds: "Vaistai", tSeiz: "Priepuoliai", tCal: "Kalendorius", tWell: "Savijauta", tNotes: "Užrašai",
    save: "Išsaugoti", deleteQ: "Ištrinti?", copied: "Nukopijuota ✓", today: "šiandien", tomorrow: "rytoj",
    inDays: (n) => `po ${n} d.`, passed: "praėjo", allDay: "visą dieną", close: "Uždaryti", del: "Ištrinti",
    prev: "Ankstesnis mėnuo", next: "Kitas mėnuo", less: "Mažiau", more: "Daugiau",
    newMed: "Naujas vaistas", medName: "Pavadinimas, pvz. Levetiracetamas", medDose: "Dozė, pvz. 500 mg",
    times: "Vartojimo laikai", addTime: "Pridėti laiką", removeTime: "Pašalinti laiką", saveMed: "Išsaugoti vaistą",
    todayIs: "Šiandien", medsEmptyT: "Kol kas tuščia",
    medsEmptyB: "Pridėk vaistą su vartojimo laikais, ir dienos dozes pažymėsi vienu paspaudimu.",
    taken: (a, b) => `Išgerta ${a} iš ${b} dozių šiandien`, allDone: " · viskas ✓",
    last7: "Paskutinės 7 dienos", addMed: "Pridėti vaistą", missed: "praleista?", dose: "Dozė",
    regSeiz: "Registruoti priepuolį", per30: "per 30 d.", daysSince: "d. be priepuolio", diary: "Dienynas",
    seizEmpty: "Įrašų nėra. Registruok kiekvieną priepuolį: dienynas neurologui vertingesnis už atmintį.",
    type: "Tipas", duration: "Trukmė", auraYes: "Aura buvo ✓", auraNo: "Auros nebuvo", withAura: "su aura",
    effects: "Pasekmės", triggers: "Galimi trigeriai",
    seizNote: "Pastabos (kaip jauteisi po, kas matė…)", saveEntry: "Išsaugoti įrašą",
    statusWarn: "Ilgesnis nei 5 min priepuolis gali būti status epilepticus. Būtina skubi pagalba (112).",
    newEvent: "Naujas įrašas kalendoriuje", eventWhat: "Kas? pvz. Užeiti pas tėvus",
    timeOptional: "Laikas nebūtinas. Be jo įrašas bus „visą dieną“.",
    saveEvent: "Įrašyti į kalendorių", noEventsDay: "Šią dieną įrašų nėra.", addForDay: "Pridėti šiai dienai", upcoming: "Artimiausi", prepare: "Pasiruošk", inhale: "Įkvėpk", hold: "Sulaikyk", exhale: "Iškvėpk",
    pBox: "Dėžutė 4·4·4·4", pRelax: "Ramybei 4·7·8", start: "Pradėti", stop: "Stabdyti",
    remaining: (n) => `liko ${n} min`, doneMin: (n) => `Baigta · ${n} min ✓`, stoppedMin: (n) => `Sustabdyta · ${n} min įrašyta`, sessions: "seansai", minTotal: "min iš viso",
    segState: "Būsena",
    todayState: "Šiandienos būsena", sleep: "Miegas", stress: "Stresas", fatigue: "Nuovargis", alcohol: "Alkoholis",
    yes: "Taip", no: "Ne", optNote: "Pastaba (nebūtina)", autosave: "Įrašoma automatiškai.",
    sleep7: "Miegas per 7 d.", sleepHint: "Mažiau nei 6 h yra vienas dažniausių priepuolių trigerių.",
    rNotes: "Pastabos",
    report: "Ataskaita gydytojui", rSeiz: "Priepuoliai", rTypes: "Tipai", rAura: "Su aura",
    rLongest: "Ilgiausia trukmė", rAdh: "Vaistų laikymasis", rSleep: "Miegas", rSleepV: (a, s, n) => `vid. ${a} h · <6 h: ${s}/${n}`,
    rStressFat: "Stresas / nuovargis", rOf5: "(iš 5)", rAlco: "Alkoholis", rDays: (n) => `${n} d.`, copyText: "Kopijuoti kaip tekstą",
    rNote: "Vaistų laikymasis skaičiuojamas pagal dabartinį vaistų sąrašą, todėl laikotarpiui iki vaisto pridėjimo jis apytikslis.",
    rTitle: (n) => `AURA · ${n} d. ataskaita`, rPatient: "Pacientas", rFooter: "Duomenys registruoti paties paciento programėle Aura.",
    rAdhLine: (p, t, s) => `VAISTAI: laikymasis ~${p}% (${t} iš ${s} dozių)`,
    setupIntro: "Kelios sekundės, ir galim pradėti. Visa tai vėliau pakeisi Nustatymuose.", setupName: "Kaip į tave kreiptis?", setupNameHint: "Neprivaloma. Vardas rodomas tik ataskaitoje gydytojui.", setupNotify: "Vaistų priminimai", setupNotifyDesc: "Priminsim išgerti dozę tavo nurodytu laiku. Galima įjungti ir vėliau.", setupStart: "Pradėti", setupLocal: "Paskyros nėra. Viskas lieka šiame telefone.", settings: "Nustatymai", language: "Kalba", replayTour: "Peržiūrėti apžvalgą", theme: "Išvaizda", bed: "Miego priminimas", bedDesc: "Priminsim ruoštis miegoti tavo pasirinktu laiku.", thLight: "Šviesi", thDark: "Tamsi", thAuto: "Automatinė", profile: "Profilis", namePh: "Vardas (rodomas ataskaitoje)",
    overdueAfter: "Dozė žymima „praleista?“ po:", data: "Duomenys", exportJson: "Eksportuoti duomenis (JSON)",
    deleteAll: "Ištrinti visus duomenis", confirmAll: "Tikrai ištrinti viską? Negrįžtama", about: "Apie",
    aboutText: "Aura · prototipas v1.4. Duomenys saugomi tik šiame telefone. Programėlė nėra medicinos prietaisas. Priepuolių detekcijai naudok sertifikuotus įrenginius, o skubiai informacijai užsipildyk telefono Medical ID.",
    aura: "Aura", edit: "Redaguoti", editSeiz: "Redaguoti priepuolį", editEvent: "Redaguoti įrašą",
    unanswered: "neatsakyta", rAnswered: (a, b) => `atsakyta ${a} iš ${b}`,
    sum30: "Per 30 dienų", sumSeiz: "priepuoliai", sumAdh: "vaistų", sumSleep: "miegas",
    sumDemo: "Pavyzdys: čia atsiras tavo duomenys",
    sumWhy: "Bloknotas kaupia įrašus. Aura iš jų suskaičiuoja tai, ko gydytojui reikia: vaistų laikymosi procentą, trigerius pagal dažnį ir miegą prieš priepuolius.",
    sumOpen: "Atidaryti ataskaitą",
    stTaken: "Išgerta", stLate: "Vėluoja", stSoon: "Laukia",
    fbLabel: "Atsiliepimas", fbBtn: "Rašyti kūrėjui", fbSubj: "Aura: atsiliepimas",
    fbNote: "Atsidarys tavo el. pašto programa. Prisegama tik versija ir įrenginio tipas, dienyno įrašai nesiunčiami.",
    pause: "Pauzė", resume: "Tęsti", paused: "Pristabdyta", quickLog: "Registruoti priepuolį",
    editMed: "Redaguoti vaistą", rAdhDays: (a, b) => `skaičiuota ${a} iš ${b} d.`,
    auraKinds: "Kaip aura pasireiškė?", auraNew: "Pridėti savo aprašymą", rAuraKinds: "Auros pasireiškimas",
    auraHint: "Įrašyk savo žodžiais. Auros turinys neurologui pasako, kurioje smegenų vietoje priepuolis prasideda.",
    fbBug: "Klaida", fbIdea: "Pasiūlymas", fbOther: "Kita",
    fbPh: "Kas nutiko arba ką norėtum pakeisti? Jei tai klaida, kaip ją pakartoti?",
    fbAttach: "Bus prisegta", fbSend: "Siųsti", fbCopy: "Kopijuoti tekstą",
    fbSent: "Atsidarė pašto programa", fbFallback: "Jei pašto programa neatsidarė, nukopijuok tekstą ir atsiųsk į", fbNoText: "Įrašyk, kas nutiko",
    backup: "Atsarginė kopija", bkMake: "Sukurti kopiją", bkRestore: "Atkurti iš kopijos",
    bkHint: "Failas su visais duomenimis. Išsaugok jį sau: pametus telefoną tai vienintelis kelias atgauti dienyną.",
    bkDone: "Kopija sukurta", bkFail: "Nepavyko sukurti kopijos",
    bkRemind: "Priminti kas mėnesį", bkChecking: "Tikrinama…",
    bkFound: "Rasta kopija", bkFrom: "Sukurta", bkWill: "Bus atkurta",
    bkWarn: "Esami duomenys bus pakeisti. Prieš tai automatiškai išsaugoma dabartinių duomenų kopija.",
    bkConfirm: "Atkurti", bkOk: "Duomenys atkurti", bkPick: "Pasirinkti failą",
    bkErrParse: "Failas nėra tinkamas JSON.", bkErrShape: "Tai ne Aura atsarginė kopija.",
    bkErrNewer: "Kopija sukurta naujesne programėlės versija. Atnaujink Aurą.",
    bkErrEmpty: "Kopija tuščia.",
    seizStart: "Prasidėjo priepuolis", seizEnd: "Priepuolis baigėsi", seizRunning: "Vyksta priepuolis",
    seizAlert: "Užsitęsęs priepuolis. Kvieskite pagalbą (112)",
    seizAlertNote: "Programėlė neskambina pati.",
    seizStale: "Ar priepuolis jau baigėsi?",
    seizStaleNote: "Laikmatis veikia ilgiau nei valandą. Jei pamiršai jį sustabdyti, trukmė bus netiksli.",
    seizStaleYes: "Taip, baigėsi", seizStaleDiscard: "Atmesti laikmatį",
    measured: "išmatuota", startedAt: "Pradžia",
    auraFeel: "Jaučiu aurą", auraLogged: "Aura užfiksuota", auraLinked: "Susieta su aura prieš {n} min.",
    breathe: "Kvėpavimas", breatheNote: "Atsipalaidavimo pratimas.", close: "Uždaryti", trigOtherPh: "Įrašyk savo žodžiais",
    fbCardText: "Aura yra mano asmeninis projektas, kuriamas laisvalaikiu. Jei kažko trūksta arba kažkas veikia blogai, parašyk: tai vienintelis būdas man sužinoti.",
    fbCardYes: "Parašyti", fbCardNo: "Ne dabar",
    // Pirmo paleidimo apžvalga: po vieną eilutę. Ilgesnis tekstas čia neskaitomas —
    // žmogus ką tik atsidarė programėlę ir dar nežino, ar jam jos reikia.
    tourNext: "Toliau", tourDone: "Pradėti", tourSkip: "Praleisti",
    tourNav: "Keturi skirtukai. Apžvelgsim visus iš eilės.",
    tourTimer: "Laikmatis matuoja pats, trukmės rašyti nereikia.",
    tourAura: "Pajutai aurą? Pažymėk čia.",
    tourLog: "Praėjusį priepuolį įrašyk čia, laikmačio nereikia.",
    tourMeds: "Pridėk vaistus. Priminsim laiku, o dozę pažymėsi tiesiai pranešime.",
    tourCal: "Priepuolių raštas per mėnesį. Brūkšneliai žymi priepuolius, o taškai žymi tavo įrašus.",
    tourState: "Miegas, stresas, nuovargis ir pastaba. Pastaba keliauja į ataskaitą.",
    tourReport: "30 dienų suvestinė gydytojui. Dėl jos viskas ir renkama.",
    gNotif: "Priminimai neateina laiku", gNotifB: "Priminimai atiduodami telefono žadintuvų sistemai iki 14 dienų į priekį, todėl Aurai veikti nereikia. Jei žinutė pasirodo tik tada, kai atidarai programėlę, ją stabdo telefono energijos taupymas. Griežčiausi čia yra Xiaomi, Huawei, Samsung ir OnePlus.\n\nPirmiausia patikrink, ar priminimai apskritai suplanuoti: Nustatymai → Suplanuota priminimų → Tikrinti. Jei rodo 0, telefonas juos panaikino. Jei rodo didelį skaičių, o žinutė vis tiek vėluoja, vadinasi priminimai sukurti teisingai, tik telefonas neleidžia jų parodyti.\n\nAbiem atvejais padeda tie patys nustatymai. Pavadinimai priklauso nuo telefono, bet keliai panašūs:\n\n1. Baterijos taupymas → Be apribojimų. Nustatymai → Programos → Programų tvarkyklė → Aura → Baterijos taupymas. Tai svarbiausias žingsnis: kol čia lieka taupymo režimas, telefonas stabdo priminimus, kad ir ką pakeistum kitur.\n\n2. Automatinis paleidimas (Autostart): įjungti. Toje pačioje Auros kortelėje. Xiaomi jį išjungia pagal nutylėjimą.\n\n3. Paskutinių programėlių ekrane užrakink Aurą spynele. Kitaip „Išvalyti viską“ panaikina visus suplanuotus priminimus.\n\n4. Žadintuvai ir priminimai: leisti. Nustatymai → Programos → Speciali prieiga.\n\nPakeitęs palik telefoną kelioms valandoms ir pažiūrėk, ar priminimas ateina laiku pats.",
    change: "Keisti pratimą",
    ty: { tonicClonic: "Toninis-kloninis", absence: "Absansas", focal: "Židininis", myoclonic: "Miokloninis", other: "Kitas", unspec: "Nenurodyta" },
    ef: { fall: "Nukritau", injury: "Susižalojau", tongue: "Prikandau liežuvį", incontinence: "Šlapimo nelaikymas" },
    tg: { insomnia: "Nemiga", stress: "Stresas", fatigue: "Pervargimas", alcohol: "Alkoholis", missedMeds: "Praleisti vaistai", missedMeal: "Praleistas valgis", flashing: "Mirganti šviesa", illness: "Liga / karščiavimas", unknown: "Nežinoma" },
    cat: { doctor: "Gydytojas", surgery: "Operacija", family: "Šeima", other: "Kita" },
  },
  en: {
    tagline: "Epilepsy diary", loading: "Loading…", notSaved: "Not saved to storage",
    disclaimer: "Data is stored only on this phone. This app is not a medical device and does not replace your doctor.",
    tMeds: "Meds", tSeiz: "Seizures", tCal: "Calendar", tWell: "Wellbeing", tNotes: "Notes",
    save: "Save", deleteQ: "Delete?", copied: "Copied ✓", today: "today", tomorrow: "tomorrow",
    inDays: (n) => `in ${n} d.`, passed: "passed", allDay: "all day", close: "Close", del: "Delete",
    prev: "Previous month", next: "Next month", less: "Less", more: "More",
    newMed: "New medication", medName: "Name, e.g. Levetiracetam", medDose: "Dose, e.g. 500 mg",
    times: "Dose times", addTime: "Add time", removeTime: "Remove time", saveMed: "Save medication",
    todayIs: "Today", medsEmptyT: "Nothing here yet",
    medsEmptyB: "Add a medication with its times, then mark each dose with a single tap.",
    taken: (a, b) => `Taken ${a} of ${b} doses today`, allDone: " · all done ✓",
    last7: "Last 7 days", addMed: "Add medication", missed: "missed?", dose: "Dose",
    regSeiz: "Log a seizure", per30: "in 30 d.", daysSince: "d. seizure-free", diary: "Diary",
    seizEmpty: "No entries yet. Log every seizure: a diary is worth more to your neurologist than memory.",
    type: "Type", duration: "Duration", auraYes: "Aura present ✓", auraNo: "No aura", withAura: "with aura",
    effects: "Consequences", triggers: "Possible triggers",
    seizNote: "Notes (how you felt after, who witnessed it…)", saveEntry: "Save entry",
    statusWarn: "A seizure longer than 5 min may be status epilepticus. Call emergency services immediately.",
    newEvent: "New calendar entry", eventWhat: "What? e.g. Visit my parents",
    timeOptional: "Time is optional. Without it the entry is “all day”.",
    saveEvent: "Add to calendar", noEventsDay: "No entries on this day.", addForDay: "Add for this day", upcoming: "Upcoming", prepare: "Get ready", inhale: "Breathe in", hold: "Hold", exhale: "Breathe out",
    pBox: "Box 4·4·4·4", pRelax: "Calming 4·7·8", start: "Start", stop: "Stop",
    remaining: (n) => `${n} min left`, doneMin: (n) => `Done · ${n} min ✓`, stoppedMin: (n) => `Stopped · ${n} min saved`, sessions: "sessions", minTotal: "min total",
    segState: "State",
    todayState: "Today's state", sleep: "Sleep", stress: "Stress", fatigue: "Fatigue", alcohol: "Alcohol",
    yes: "Yes", no: "No", optNote: "Note (optional)", autosave: "Saved automatically.",
    sleep7: "Sleep over 7 days", sleepHint: "Under 6 h is one of the most common seizure triggers.",
    rNotes: "Notes",
    report: "Report for doctor", rSeiz: "Seizures", rTypes: "Types", rAura: "With aura",
    rLongest: "Longest duration", rAdh: "Medication adherence", rSleep: "Sleep", rSleepV: (a, s, n) => `avg ${a} h · <6 h: ${s}/${n}`,
    rStressFat: "Stress / fatigue", rOf5: "(of 5)", rAlco: "Alcohol", rDays: (n) => `${n} d.`, copyText: "Copy as text",
    rNote: "Adherence is calculated from your current medication list, so it is approximate for periods before a medication was added.",
    rTitle: (n) => `AURA · ${n}-day report`, rPatient: "Patient", rFooter: "Data self-recorded by the patient using the Aura app.",
    rAdhLine: (p, t, s) => `MEDICATION: adherence ~${p}% (${t} of ${s} doses)`,
    setupIntro: "A few seconds and we can begin. All of this can be changed later in Settings.", setupName: "What should we call you?", setupNameHint: "Optional. The name appears only in the doctor’s report.", setupNotify: "Medication reminders", setupNotifyDesc: "We will remind you to take a dose at the times you enter. You can turn this on later too.", setupStart: "Get started", setupLocal: "There is no account. Everything stays on this phone.", settings: "Settings", language: "Language", replayTour: "Replay the tour", theme: "Appearance", bed: "Bedtime reminder", bedDesc: "A nudge to start winding down at the time you choose.", thLight: "Light", thDark: "Dark", thAuto: "Automatic", profile: "Profile", namePh: "Name (shown in the report)",
    overdueAfter: "Mark a dose as “missed?” after:", data: "Data", exportJson: "Export data (JSON)",
    deleteAll: "Delete all data", confirmAll: "Delete everything? This cannot be undone", about: "About",
    aboutText: "Aura · prototype v1.4. Data is stored only on this phone. This app is not a medical device. Use certified devices for seizure detection, and fill in your phone's Medical ID for emergencies.",
    aura: "Aura", edit: "Edit", editSeiz: "Edit seizure", editEvent: "Edit entry",
    unanswered: "not answered", rAnswered: (a, b) => `answered ${a} of ${b}`,
    sum30: "Last 30 days", sumSeiz: "seizures", sumAdh: "meds", sumSleep: "sleep",
    sumDemo: "Example: your data will appear here",
    sumWhy: "A notepad collects entries. Aura turns them into what your doctor needs: adherence percentage, triggers ranked by frequency, and sleep before seizures.",
    sumOpen: "Open report",
    stTaken: "Taken", stLate: "Late", stSoon: "Due",
    fbLabel: "Feedback", fbBtn: "Email the developer", fbSubj: "Aura: feedback",
    fbNote: "Opens your email app. Only the version and device type are attached, no diary entries are sent.",
    pause: "Pause", resume: "Resume", paused: "Paused", quickLog: "Log a seizure",
    editMed: "Edit medication", rAdhDays: (a, b) => `over ${a} of ${b} d.`,
    auraKinds: "How did the aura present?", auraNew: "Add your own description", rAuraKinds: "Aura presentation",
    auraHint: "Use your own words. What the aura feels like tells your neurologist where the seizure starts.",
    fbBug: "Bug", fbIdea: "Idea", fbOther: "Other",
    fbPh: "What happened, or what would you change? If it is a bug, how do you reproduce it?",
    fbAttach: "Will be attached", fbSend: "Send", fbCopy: "Copy text",
    fbSent: "Mail app opened", fbFallback: "If your mail app did not open, copy the text and send it to", fbNoText: "Describe what happened",
    backup: "Backup", bkMake: "Create backup", bkRestore: "Restore from backup",
    bkHint: "A file with all your data. Keep it somewhere safe: if you lose the phone, this is the only way back.",
    bkDone: "Backup created", bkFail: "Backup failed",
    bkRemind: "Remind monthly", bkChecking: "Checking…",
    bkFound: "Backup found", bkFrom: "Created", bkWill: "Will be restored",
    bkWarn: "Current data will be replaced. A copy of it is saved automatically first.",
    bkConfirm: "Restore", bkOk: "Data restored", bkPick: "Choose file",
    bkErrParse: "The file is not valid JSON.", bkErrShape: "This is not an Aura backup.",
    bkErrNewer: "This backup was made by a newer version. Please update Aura.",
    bkErrEmpty: "The backup is empty.",
    seizStart: "Seizure started", seizEnd: "Seizure ended", seizRunning: "Seizure in progress",
    seizAlert: "Prolonged seizure. Call emergency services",
    seizAlertNote: "The app does not dial for you.",
    seizStale: "Is the seizure over?",
    seizStaleNote: "The timer has been running for over an hour. If you forgot to stop it, the duration will be wrong.",
    seizStaleYes: "Yes, it ended", seizStaleDiscard: "Discard timer",
    measured: "measured", startedAt: "Started",
    auraFeel: "I feel an aura", auraLogged: "Aura logged", auraLinked: "Linked to an aura {n} min ago",
    breathe: "Breathing", breatheNote: "A relaxation exercise.", close: "Close", trigOtherPh: "Describe in your own words",
    fbCardText: "Aura is my personal project, built in my spare time. If something is missing or something works badly, write to me: it is the only way I get to know.",
    fbCardYes: "Write to me", fbCardNo: "Not now",
    tourNext: "Next", tourDone: "Start", tourSkip: "Skip",
    tourNav: "Four tabs. We'll go through all of them.",
    tourTimer: "The timer measures for you, no need to type a duration.",
    tourAura: "Feel an aura? Mark it here.",
    tourLog: "Log a past seizure here, no timer needed.",
    tourMeds: "Add your medications. We'll remind you on time, and you can mark a dose straight from the notification.",
    tourCal: "Your seizure pattern across the month. Bars mark seizures, dots mark your own entries.",
    tourState: "Sleep, stress, fatigue and a note. The note goes into the report.",
    tourReport: "A 30-day summary for your doctor. That is what all of this is for.",
    gNotif: "Reminders arrive late", gNotifB: "Reminders are handed to the phone's alarm system up to 14 days ahead, so Aura does not need to be running. If a reminder only appears once you open the app, your phone's battery saver is holding it back. Xiaomi, Huawei, Samsung and OnePlus are the strictest.\n\nFirst check whether reminders were scheduled at all: Settings → Scheduled reminders → Check. If it shows 0, the phone deleted them. If it shows a large number and the reminder is still late, they were scheduled correctly and the phone is simply refusing to show them.\n\nThe same settings help in both cases. Names vary by phone, but the paths are similar:\n\n1. Battery saver → No restrictions. Settings → Apps → Manage apps → Aura → Battery saver. This is the one that matters most: while any saver mode is on, the phone holds reminders back no matter what else you change.\n\n2. Autostart: turn on. In the same Aura entry. Xiaomi disables it by default.\n\n3. Lock Aura in the recent apps screen. Otherwise “Clear all” wipes every scheduled reminder.\n\n4. Alarms & reminders: allow. Settings → Apps → Special app access.\n\nAfter changing these, leave the phone alone for a few hours and see whether a reminder arrives on its own.",
    change: "Change exercise",
    ty: { tonicClonic: "Tonic-clonic", absence: "Absence", focal: "Focal", myoclonic: "Myoclonic", other: "Other", unspec: "Unspecified" },
    ef: { fall: "I fell", injury: "Injured myself", tongue: "Bit my tongue", incontinence: "Incontinence" },
    tg: { insomnia: "Poor sleep", stress: "Stress", fatigue: "Exhaustion", alcohol: "Alcohol", missedMeds: "Missed meds", missedMeal: "Missed meal", flashing: "Flashing lights", illness: "Illness / fever", unknown: "Unknown" },
    cat: { doctor: "Doctor", surgery: "Surgery", family: "Family", other: "Other" },
  },
  ru: {
    tagline: "Дневник эпилепсии", loading: "Загрузка…", notSaved: "Не сохранено",
    disclaimer: "Данные хранятся только на этом телефоне. Приложение не является медицинским прибором и не заменяет врача.",
    tMeds: "Лекарства", tSeiz: "Приступы", tCal: "Календарь", tWell: "Состояние", tNotes: "Заметки",
    save: "Сохранить", deleteQ: "Удалить?", copied: "Скопировано ✓", today: "сегодня", tomorrow: "завтра",
    inDays: (n) => `через ${n} д.`, passed: "прошло", allDay: "весь день", close: "Закрыть", del: "Удалить",
    prev: "Предыдущий месяц", next: "Следующий месяц", less: "Меньше", more: "Больше",
    newMed: "Новое лекарство", medName: "Название, напр. Леветирацетам", medDose: "Доза, напр. 500 мг",
    times: "Время приёма", addTime: "Добавить время", removeTime: "Убрать время", saveMed: "Сохранить лекарство",
    todayIs: "Сегодня", medsEmptyT: "Пока пусто",
    medsEmptyB: "Добавьте лекарство с временем приёма, и отмечать дозы можно одним касанием.",
    taken: (a, b) => `Принято ${a} из ${b} доз сегодня`, allDone: " · всё ✓",
    last7: "Последние 7 дней", addMed: "Добавить лекарство", missed: "пропущено?", dose: "Доза",
    regSeiz: "Записать приступ", per30: "за 30 д.", daysSince: "д. без приступов", diary: "Дневник",
    seizEmpty: "Записей нет. Записывайте каждый приступ: дневник ценнее для невролога, чем память.",
    type: "Тип", duration: "Длительность", auraYes: "Аура была ✓", auraNo: "Ауры не было", withAura: "с аурой",
    effects: "Последствия", triggers: "Возможные триггеры",
    seizNote: "Заметки (как чувствовали себя после, кто видел…)", saveEntry: "Сохранить запись",
    statusWarn: "Приступ дольше 5 минут может быть эпилептическим статусом. Нужна срочная помощь (112).",
    newEvent: "Новая запись в календаре", eventWhat: "Что? напр. Зайти к родителям",
    timeOptional: "Время необязательно. Без него запись будет «весь день».",
    saveEvent: "Добавить в календарь", noEventsDay: "В этот день записей нет.", addForDay: "Добавить на этот день", upcoming: "Ближайшие", prepare: "Приготовьтесь", inhale: "Вдох", hold: "Задержка", exhale: "Выдох",
    pBox: "Квадрат 4·4·4·4", pRelax: "Расслабление 4·7·8", start: "Начать", stop: "Остановить",
    remaining: (n) => `осталось ${n} мин`, doneMin: (n) => `Готово · ${n} мин ✓`, stoppedMin: (n) => `Остановлено · ${n} мин записано`, sessions: "сеансы", minTotal: "мин всего",
    segState: "Состояние",
    todayState: "Состояние сегодня", sleep: "Сон", stress: "Стресс", fatigue: "Усталость", alcohol: "Алкоголь",
    yes: "Да", no: "Нет", optNote: "Заметка (необязательно)", autosave: "Сохраняется автоматически.",
    sleep7: "Сон за 7 дней", sleepHint: "Меньше 6 ч, это один из самых частых триггеров приступов.",
    rNotes: "Заметки",
    report: "Отчёт для врача", rSeiz: "Приступы", rTypes: "Типы", rAura: "С аурой",
    rLongest: "Самый долгий", rAdh: "Соблюдение приёма", rSleep: "Сон", rSleepV: (a, s, n) => `сред. ${a} ч · <6 ч: ${s}/${n}`,
    rStressFat: "Стресс / усталость", rOf5: "(из 5)", rAlco: "Алкоголь", rDays: (n) => `${n} д.`, copyText: "Скопировать как текст",
    rNote: "Соблюдение приёма считается по текущему списку лекарств, поэтому для периода до добавления лекарства оно приблизительно.",
    rTitle: (n) => `AURA · отчёт за ${n} д.`, rPatient: "Пациент", rFooter: "Данные записаны самим пациентом в приложении Aura.",
    rAdhLine: (p, t, s) => `ЛЕКАРСТВА: соблюдение ~${p}% (${t} из ${s} доз)`,
    setupIntro: "Несколько секунд, и можно начинать. Всё это позже можно изменить в настройках.", setupName: "Как к вам обращаться?", setupNameHint: "Необязательно. Имя показывается только в отчёте врачу.", setupNotify: "Напоминания о лекарствах", setupNotifyDesc: "Напомним принять дозу в указанное вами время. Можно включить и позже.", setupStart: "Начать", setupLocal: "Аккаунта нет. Всё остаётся на этом телефоне.", settings: "Настройки", language: "Язык", replayTour: "Посмотреть обзор снова", theme: "Оформление", bed: "Напоминание о сне", bedDesc: "Напомним готовиться ко сну в выбранное вами время.", thLight: "Светлое", thDark: "Тёмное", thAuto: "Автоматически", profile: "Профиль", namePh: "Имя (показывается в отчёте)",
    overdueAfter: "Отмечать дозу «пропущено?» через:", data: "Данные", exportJson: "Экспорт данных (JSON)",
    deleteAll: "Удалить все данные", confirmAll: "Точно удалить всё? Необратимо", about: "О приложении",
    aboutText: "Aura · прототип v1.4. Данные хранятся только на этом телефоне. Приложение не медицинский прибор. Для обнаружения приступов используйте сертифицированные устройства, а для экстренных случаев заполните Medical ID в телефоне.",
    aura: "Аура", edit: "Изменить", editSeiz: "Изменить приступ", editEvent: "Изменить запись",
    unanswered: "нет ответа", rAnswered: (a, b) => `отвечено ${a} из ${b}`,
    sum30: "За 30 дней", sumSeiz: "приступы", sumAdh: "лекарства", sumSleep: "сон",
    sumDemo: "Пример: здесь появятся ваши данные",
    sumWhy: "Блокнот накапливает записи. Aura считает из них то, что нужно врачу: процент соблюдения приёма, триггеры по частоте и сон перед приступами.",
    sumOpen: "Открыть отчёт",
    stTaken: "Принято", stLate: "Опаздывает", stSoon: "Ожидает",
    fbLabel: "Отзыв", fbBtn: "Написать разработчику", fbSubj: "Aura: отзыв",
    fbNote: "Откроется почтовое приложение. Прилагается только версия и тип устройства, записи дневника не отправляются.",
    pause: "Пауза", resume: "Продолжить", paused: "Приостановлено", quickLog: "Записать приступ",
    editMed: "Изменить лекарство", rAdhDays: (a, b) => `за ${a} из ${b} д.`,
    auraKinds: "Как проявилась аура?", auraNew: "Добавить своё описание", rAuraKinds: "Проявление ауры",
    auraHint: "Своими словами. Содержание ауры показывает неврологу, где начинается приступ.",
    fbBug: "Ошибка", fbIdea: "Предложение", fbOther: "Другое",
    fbPh: "Что произошло или что хотели бы изменить? Если ошибка, как её повторить?",
    fbAttach: "Будет приложено", fbSend: "Отправить", fbCopy: "Скопировать текст",
    fbSent: "Почтовое приложение открыто", fbFallback: "Если почта не открылась, скопируйте текст и отправьте на", fbNoText: "Опишите, что произошло",
    backup: "Резервная копия", bkMake: "Создать копию", bkRestore: "Восстановить из копии",
    bkHint: "Файл со всеми данными. Сохраните его: при утере телефона это единственный способ вернуть дневник.",
    bkDone: "Копия создана", bkFail: "Не удалось создать копию",
    bkRemind: "Напоминать ежемесячно", bkChecking: "Проверка…",
    bkFound: "Копия найдена", bkFrom: "Создана", bkWill: "Будет восстановлено",
    bkWarn: "Текущие данные будут заменены. Их копия сохраняется автоматически.",
    bkConfirm: "Восстановить", bkOk: "Данные восстановлены", bkPick: "Выбрать файл",
    bkErrParse: "Файл не является корректным JSON.", bkErrShape: "Это не резервная копия Aura.",
    bkErrNewer: "Копия создана более новой версией. Обновите Aura.",
    bkErrEmpty: "Копия пуста.",
    seizStart: "Приступ начался", seizEnd: "Приступ закончился", seizRunning: "Идёт приступ",
    seizAlert: "Затяжной приступ. Вызовите скорую",
    seizAlertNote: "Приложение не звонит само.",
    seizStale: "Приступ уже закончился?",
    seizStaleNote: "Таймер идёт более часа. Если вы забыли его остановить, длительность будет неверной.",
    seizStaleYes: "Да, закончился", seizStaleDiscard: "Отменить таймер",
    measured: "измерено", startedAt: "Начало",
    auraFeel: "Чувствую ауру", auraLogged: "Аура записана", auraLinked: "Связано с аурой {n} мин назад",
    breathe: "Дыхание", breatheNote: "Упражнение на расслабление.", close: "Закрыть", trigOtherPh: "Опишите своими словами",
    fbCardText: "Aura, это мой личный проект, который я делаю в свободное время. Если чего-то не хватает или что-то работает плохо, напишите: это единственный способ мне об этом узнать.",
    fbCardYes: "Написать", fbCardNo: "Не сейчас",
    tourNext: "Далее", tourDone: "Начать", tourSkip: "Пропустить",
    tourNav: "Четыре раздела. Пройдём по всем.",
    tourTimer: "Таймер измеряет сам, вводить длительность не нужно.",
    tourAura: "Почувствовали ауру? Отметьте здесь.",
    tourLog: "Прошедший приступ запишите здесь, таймер не нужен.",
    tourMeds: "Добавьте лекарства. Напомним вовремя, а дозу отметите прямо в уведомлении.",
    tourCal: "Картина приступов за месяц. Черта обозначает приступ, а точка вашу запись.",
    tourState: "Сон, стресс, усталость и заметка. Заметка попадает в отчёт.",
    tourReport: "Сводка за 30 дней для врача. Ради неё всё и собирается.",
    gNotif: "Напоминания приходят с опозданием", gNotifB: "Напоминания передаются системе будильников телефона на 14 дней вперёд, поэтому Aura не обязана работать. Если уведомление появляется только когда вы открываете приложение, его задерживает энергосбережение телефона. Строже всего Xiaomi, Huawei, Samsung и OnePlus.\n\nСначала проверьте, запланированы ли напоминания вообще: Настройки → Запланировано напоминаний → Проверить. Если показывает 0, телефон их удалил. Если показывает большое число, а уведомление всё равно опаздывает, значит напоминания созданы правильно, телефон просто не даёт их показать.\n\nВ обоих случаях помогают одни и те же настройки. Названия зависят от телефона, но пути похожи:\n\n1. Энергосбережение → Без ограничений. Настройки → Приложения → Все приложения → Aura → Энергосбережение. Это главное: пока включён любой режим экономии, телефон задерживает напоминания, что бы вы ни меняли в других местах.\n\n2. Автозапуск (Autostart): включить. В той же карточке Aura. Xiaomi отключает его по умолчанию.\n\n3. Закрепите Aura в списке недавних приложений. Иначе «Очистить всё» удаляет все запланированные напоминания.\n\n4. Будильники и напоминания: разрешить. Настройки → Приложения → Специальный доступ.\n\nПосле изменений оставьте телефон на несколько часов и проверьте, придёт ли напоминание само.",
    change: "Изменить упражнение",
    ty: { tonicClonic: "Тонико-клонический", absence: "Абсанс", focal: "Фокальный", myoclonic: "Миоклонический", other: "Другой", unspec: "Не указан" },
    ef: { fall: "Упал(а)", injury: "Травма", tongue: "Прикус языка", incontinence: "Недержание мочи" },
    tg: { insomnia: "Недосып", stress: "Стресс", fatigue: "Переутомление", alcohol: "Алкоголь", missedMeds: "Пропуск лекарств", missedMeal: "Пропуск еды", flashing: "Мерцающий свет", illness: "Болезнь / жар", unknown: "Неизвестно" },
    cat: { doctor: "Врач", surgery: "Операция", family: "Семья", other: "Другое" },
  },
  pl: {
    tagline: "Dziennik padaczki", loading: "Ładowanie…", notSaved: "Nie zapisano",
    disclaimer: "Dane są przechowywane tylko na tym telefonie. Aplikacja nie jest wyrobem medycznym i nie zastępuje lekarza.",
    tMeds: "Leki", tSeiz: "Napady", tCal: "Kalendarz", tWell: "Samopoczucie", tNotes: "Notatki",
    save: "Zapisz", deleteQ: "Usunąć?", copied: "Skopiowano ✓", today: "dziś", tomorrow: "jutro",
    inDays: (n) => `za ${n} dni`, passed: "minęło", allDay: "cały dzień", close: "Zamknij", del: "Usuń",
    prev: "Poprzedni miesiąc", next: "Następny miesiąc", less: "Mniej", more: "Więcej",
    newMed: "Nowy lek", medName: "Nazwa, np. Lewetyracetam", medDose: "Dawka, np. 500 mg",
    times: "Pory przyjmowania", addTime: "Dodaj porę", removeTime: "Usuń porę", saveMed: "Zapisz lek",
    todayIs: "Dziś", medsEmptyT: "Na razie pusto",
    medsEmptyB: "Dodaj lek wraz z porami, a dawki oznaczysz jednym dotknięciem.",
    taken: (a, b) => `Przyjęto dziś ${a} z ${b} dawek`, allDone: " · wszystko ✓",
    last7: "Ostatnie 7 dni", addMed: "Dodaj lek", missed: "pominięto?", dose: "Dawka",
    regSeiz: "Zapisz napad", per30: "w 30 dni", daysSince: "dni bez napadu", diary: "Dziennik",
    seizEmpty: "Brak wpisów. Zapisuj każdy napad: dziennik jest dla neurologa cenniejszy niż pamięć.",
    type: "Typ", duration: "Czas trwania", auraYes: "Aura wystąpiła ✓", auraNo: "Bez aury", withAura: "z aurą",
    effects: "Następstwa", triggers: "Możliwe wyzwalacze",
    seizNote: "Notatki (jak się czułeś po, kto widział…)", saveEntry: "Zapisz wpis",
    statusWarn: "Napad dłuższy niż 5 min może być stanem padaczkowym. Konieczna jest pilna pomoc (112).",
    newEvent: "Nowy wpis w kalendarzu", eventWhat: "Co? np. Odwiedzić rodziców",
    timeOptional: "Godzina nieobowiązkowa. Bez niej wpis będzie „cały dzień”.",
    saveEvent: "Dodaj do kalendarza", noEventsDay: "Brak wpisów w tym dniu.", addForDay: "Dodaj na ten dzień", upcoming: "Najbliższe", prepare: "Przygotuj się", inhale: "Wdech", hold: "Wstrzymaj", exhale: "Wydech",
    pBox: "Kwadrat 4·4·4·4", pRelax: "Uspokojenie 4·7·8", start: "Zacznij", stop: "Zatrzymaj",
    remaining: (n) => `pozostało ${n} min`, doneMin: (n) => `Gotowe · ${n} min ✓`, stoppedMin: (n) => `Zatrzymano · zapisano ${n} min`, sessions: "sesje", minTotal: "min łącznie",
    segState: "Stan",
    todayState: "Dzisiejszy stan", sleep: "Sen", stress: "Stres", fatigue: "Zmęczenie", alcohol: "Alkohol",
    yes: "Tak", no: "Nie", optNote: "Notatka (opcjonalnie)", autosave: "Zapisywane automatycznie.",
    sleep7: "Sen przez 7 dni", sleepHint: "Poniżej 6 h to jeden z najczęstszych wyzwalaczy napadów.",
    rNotes: "Notatki",
    report: "Raport dla lekarza", rSeiz: "Napady", rTypes: "Typy", rAura: "Z aurą",
    rLongest: "Najdłuższy", rAdh: "Przestrzeganie leczenia", rSleep: "Sen", rSleepV: (a, s, n) => `śr. ${a} h · <6 h: ${s}/${n}`,
    rStressFat: "Stres / zmęczenie", rOf5: "(z 5)", rAlco: "Alkohol", rDays: (n) => `${n} dni`, copyText: "Kopiuj jako tekst",
    rNote: "Przestrzeganie liczone jest na podstawie bieżącej listy leków, więc dla okresu przed dodaniem leku jest przybliżone.",
    rTitle: (n) => `AURA · raport z ${n} dni`, rPatient: "Pacjent", rFooter: "Dane zapisane samodzielnie przez pacjenta w aplikacji Aura.",
    rAdhLine: (p, t, s) => `LEKI: przestrzeganie ~${p}% (${t} z ${s} dawek)`,
    setupIntro: "Kilka sekund i możemy zacząć. Wszystko to zmienisz później w ustawieniach.", setupName: "Jak się do Ciebie zwracać?", setupNameHint: "Opcjonalne. Imię pojawia się tylko w raporcie dla lekarza.", setupNotify: "Przypomnienia o lekach", setupNotifyDesc: "Przypomnimy o przyjęciu dawki o podanych porach. Można włączyć też później.", setupStart: "Zacznij", setupLocal: "Nie ma konta. Wszystko zostaje na tym telefonie.", settings: "Ustawienia", language: "Język", replayTour: "Obejrzyj przewodnik ponownie", theme: "Wygląd", bed: "Przypomnienie o śnie", bedDesc: "Przypomnimy o przygotowaniu do snu o wybranej porze.", thLight: "Jasny", thDark: "Ciemny", thAuto: "Automatyczny", profile: "Profil", namePh: "Imię (widoczne w raporcie)",
    overdueAfter: "Oznacz dawkę „pominięto?” po:", data: "Dane", exportJson: "Eksportuj dane (JSON)",
    deleteAll: "Usuń wszystkie dane", confirmAll: "Na pewno usunąć wszystko? Nieodwracalne", about: "O aplikacji",
    aboutText: "Aura · prototyp v1.4. Dane są przechowywane tylko na tym telefonie. Aplikacja nie jest wyrobem medycznym. Do wykrywania napadów używaj certyfikowanych urządzeń, a na wypadek nagły wypełnij Medical ID w telefonie.",
    aura: "Aura", edit: "Edytuj", editSeiz: "Edytuj napad", editEvent: "Edytuj wpis",
    unanswered: "brak odpowiedzi", rAnswered: (a, b) => `odpowiedzi: ${a} z ${b}`,
    sum30: "Ostatnie 30 dni", sumSeiz: "napady", sumAdh: "leki", sumSleep: "sen",
    sumDemo: "Przykład: tu pojawią się Twoje dane",
    sumWhy: "Notatnik gromadzi wpisy. Aura wylicza z nich to, czego potrzebuje lekarz: procent przestrzegania, wyzwalacze według częstości i sen przed napadami.",
    sumOpen: "Otwórz raport",
    stTaken: "Przyjęte", stLate: "Spóźnione", stSoon: "Oczekuje",
    fbLabel: "Opinia", fbBtn: "Napisz do autora", fbSubj: "Aura: opinia",
    fbNote: "Otworzy się aplikacja pocztowa. Dołączana jest tylko wersja i typ urządzenia, wpisy z dziennika nie są wysyłane.",
    pause: "Pauza", resume: "Kontynuuj", paused: "Wstrzymane", quickLog: "Zapisz napad",
    editMed: "Edytuj lek", rAdhDays: (a, b) => `za ${a} z ${b} dni`,
    auraKinds: "Jak objawiła się aura?", auraNew: "Dodaj własny opis", rAuraKinds: "Objawy aury",
    auraHint: "Własnymi słowami. Treść aury mówi neurologowi, gdzie napad się zaczyna.",
    fbBug: "Błąd", fbIdea: "Pomysł", fbOther: "Inne",
    fbPh: "Co się stało albo co chcesz zmienić? Jeśli to błąd, jak go powtórzyć?",
    fbAttach: "Zostanie dołączone", fbSend: "Wyślij", fbCopy: "Kopiuj tekst",
    fbSent: "Otwarto aplikację pocztową", fbFallback: "Jeśli poczta się nie otworzyła, skopiuj tekst i wyślij na", fbNoText: "Opisz, co się stało",
    backup: "Kopia zapasowa", bkMake: "Utwórz kopię", bkRestore: "Przywróć z kopii",
    bkHint: "Plik ze wszystkimi danymi. Zachowaj go: po utracie telefonu to jedyny sposób odzyskania dziennika.",
    bkDone: "Kopia utworzona", bkFail: "Nie udało się utworzyć kopii",
    bkRemind: "Przypominaj co miesiąc", bkChecking: "Sprawdzanie…",
    bkFound: "Znaleziono kopię", bkFrom: "Utworzona", bkWill: "Zostanie przywrócone",
    bkWarn: "Obecne dane zostaną zastąpione. Ich kopia jest zapisywana automatycznie.",
    bkConfirm: "Przywróć", bkOk: "Dane przywrócone", bkPick: "Wybierz plik",
    bkErrParse: "Plik nie jest poprawnym JSON.", bkErrShape: "To nie jest kopia zapasowa Aura.",
    bkErrNewer: "Kopia pochodzi z nowszej wersji. Zaktualizuj Aurę.",
    bkErrEmpty: "Kopia jest pusta.",
    seizStart: "Napad się zaczął", seizEnd: "Napad się skończył", seizRunning: "Trwa napad",
    seizAlert: "Przedłużający się napad. Wezwij pogotowie",
    seizAlertNote: "Aplikacja nie dzwoni samodzielnie.",
    seizStale: "Czy napad już się skończył?",
    seizStaleNote: "Stoper działa ponad godzinę. Jeśli zapomniałeś go zatrzymać, czas będzie błędny.",
    seizStaleYes: "Tak, skończył się", seizStaleDiscard: "Odrzuć stoper",
    measured: "zmierzone", startedAt: "Początek",
    auraFeel: "Czuję aurę", auraLogged: "Aura zapisana", auraLinked: "Powiązane z aurą sprzed {n} min",
    breathe: "Oddech", breatheNote: "Ćwiczenie relaksacyjne.", close: "Zamknij", trigOtherPh: "Opisz własnymi słowami",
    fbCardText: "Aura to mój osobisty projekt, tworzony po godzinach. Jeśli czegoś brakuje albo coś działa źle, napisz: to jedyny sposób, żebym się o tym dowiedział.",
    fbCardYes: "Napisz", fbCardNo: "Nie teraz",
    tourNext: "Dalej", tourDone: "Zacznij", tourSkip: "Pomiń",
    tourNav: "Cztery zakładki. Przejdziemy przez wszystkie.",
    tourTimer: "Stoper mierzy sam, nie trzeba wpisywać czasu.",
    tourAura: "Czujesz aurę? Zaznacz tutaj.",
    tourLog: "Miniony napad zapisz tutaj, stoper nie jest potrzebny.",
    tourMeds: "Dodaj leki. Przypomnimy na czas, a dawkę oznaczysz wprost w powiadomieniu.",
    tourCal: "Obraz napadów w skali miesiąca. Kreski oznaczają napady, a kropki twoje wpisy.",
    tourState: "Sen, stres, zmęczenie i notatka. Notatka trafia do raportu.",
    tourReport: "Podsumowanie 30 dni dla lekarza. Po to wszystko jest zbierane.",
    gNotif: "Przypomnienia przychodzą z opóźnieniem", gNotifB: "Przypomnienia są przekazywane systemowi alarmów telefonu na 14 dni do przodu, więc Aura nie musi działać. Jeśli powiadomienie pojawia się dopiero po otwarciu aplikacji, wstrzymuje je oszczędzanie energii. Najsurowsze są Xiaomi, Huawei, Samsung i OnePlus.\n\nNajpierw sprawdź, czy przypomnienia w ogóle zostały zaplanowane: Ustawienia → Zaplanowane przypomnienia → Sprawdź. Jeśli pokazuje 0, telefon je usunął. Jeśli pokazuje dużą liczbę, a powiadomienie i tak się spóźnia, to przypomnienia są poprawne, telefon po prostu nie pozwala ich pokazać.\n\nW obu przypadkach pomagają te same ustawienia. Nazwy zależą od telefonu, ale ścieżki są podobne:\n\n1. Oszczędzanie baterii → Bez ograniczeń. Ustawienia → Aplikacje → Zarządzaj aplikacjami → Aura → Oszczędzanie baterii. To najważniejszy krok: dopóki działa jakikolwiek tryb oszczędzania, telefon wstrzymuje przypomnienia, cokolwiek zmienisz gdzie indziej.\n\n2. Autostart: włącz. W tym samym wpisie Aura. Xiaomi wyłącza go domyślnie.\n\n3. Zablokuj Aurę na ekranie ostatnich aplikacji. Inaczej „Wyczyść wszystko” kasuje wszystkie zaplanowane przypomnienia.\n\n4. Alarmy i przypomnienia: zezwól. Ustawienia → Aplikacje → Specjalny dostęp.\n\nPo zmianach zostaw telefon na kilka godzin i sprawdź, czy przypomnienie przyjdzie samo.",
    change: "Zmień ćwiczenie",
    ty: { tonicClonic: "Toniczno-kloniczny", absence: "Napad nieświadomości", focal: "Ogniskowy", myoclonic: "Miokloniczny", other: "Inny", unspec: "Nieokreślony" },
    ef: { fall: "Upadek", injury: "Uraz", tongue: "Przygryzienie języka", incontinence: "Nietrzymanie moczu" },
    tg: { insomnia: "Niedobór snu", stress: "Stres", fatigue: "Przemęczenie", alcohol: "Alkohol", missedMeds: "Pominięte leki", missedMeal: "Pominięty posiłek", flashing: "Migające światło", illness: "Choroba / gorączka", unknown: "Nieznane" },
    cat: { doctor: "Lekarz", surgery: "Operacja", family: "Rodzina", other: "Inne" },
  },
};

const localeOf = (lang) => (LANGS.find((l) => l.id === lang) || LANGS[0]).locale;

// pranešimų ir jų nustatymų tekstai
const NOTIF = {
  lt: {
    title: "Laikas išgerti vaistus", body: (m) => `${m.name}${m.dose ? " · " + m.dose : ""}`,
    fuTitle: "Dozė nepažymėta", fuBody: (m) => `${m.name}: ar tikrai išgėrei?`,
    // mygtukas pačiame pranešime; belytė forma, kad tiktų visiems
    actTaken: "Išgėriau",
    channel: "Vaistų priminimai", label: "Priminimai",
    bkTitle: "Pasidaryk atsarginę kopiją", bkBody: "Dienyno duomenys saugomi tik šiame telefone.", bkChannel: "Kopijos priminimai",
    bedTitle: "Metas ruoštis miegoti", bedBody: "Šį laiką nusistatei pats.", bedChannel: "Miego priminimas",
    diag: "Suplanuota priminimų", diagRun: "Tikrinti", diagNone: "nėra", diagHelp: "Priminimai neateina laiku?",
    desc: "Kasdieniai pranešimai pagal vaistų vartojimo laikus.",
    on: "Įjungti", off: "Išjungti",
    denied: "Pranešimai uždrausti. Įjunk juos telefono nustatymuose.",
    webOnly: "Priminimai veikia tik įdiegus programėlę telefone.",
  },
  en: {
    title: "Time to take your medication", body: (m) => `${m.name}${m.dose ? " · " + m.dose : ""}`,
    fuTitle: "Dose not marked", fuBody: (m) => `${m.name}: did you actually take it?`,
    actTaken: "Taken",
    channel: "Medication reminders", label: "Reminders",
    bkTitle: "Time to back up", bkBody: "Your diary is stored only on this phone.", bkChannel: "Backup reminders",
    bedTitle: "Time to get ready for bed", bedBody: "You set this time yourself.", bedChannel: "Bedtime reminder",
    diag: "Scheduled reminders", diagRun: "Check", diagNone: "none", diagHelp: "Reminders arriving late?",
    desc: "Daily notifications based on your dose times.",
    on: "On", off: "Off",
    denied: "Notifications are blocked. Enable them in your phone settings.",
    webOnly: "Reminders only work in the installed mobile app.",
  },
  ru: {
    title: "Время принять лекарство", body: (m) => `${m.name}${m.dose ? " · " + m.dose : ""}`,
    fuTitle: "Доза не отмечена", fuBody: (m) => `${m.name}: вы действительно приняли?`,
    actTaken: "Выпито",
    channel: "Напоминания о лекарствах", label: "Напоминания",
    bkTitle: "Сделайте резервную копию", bkBody: "Дневник хранится только на этом телефоне.", bkChannel: "Напоминания о копиях",
    bedTitle: "Пора готовиться ко сну", bedBody: "Это время вы выбрали сами.", bedChannel: "Напоминание о сне",
    diag: "Запланировано напоминаний", diagRun: "Проверить", diagNone: "нет", diagHelp: "Напоминания опаздывают?",
    desc: "Ежедневные уведомления по времени приёма.",
    on: "Вкл.", off: "Выкл.",
    denied: "Уведомления запрещены. Включите их в настройках телефона.",
    webOnly: "Напоминания работают только в установленном приложении.",
  },
  pl: {
    title: "Czas wziąć lek", body: (m) => `${m.name}${m.dose ? " · " + m.dose : ""}`,
    fuTitle: "Dawka nieoznaczona", fuBody: (m) => `${m.name}: czy dawka została przyjęta?`,
    actTaken: "Zażyte",
    channel: "Przypomnienia o lekach", label: "Przypomnienia",
    bkTitle: "Zrób kopię zapasową", bkBody: "Dziennik jest przechowywany tylko na tym telefonie.", bkChannel: "Przypomnienia o kopiach",
    bedTitle: "Czas przygotować się do snu", bedBody: "Ten czas ustawiłeś samodzielnie.", bedChannel: "Przypomnienie o śnie",
    diag: "Zaplanowane przypomnienia", diagRun: "Sprawdź", diagNone: "brak", diagHelp: "Przypomnienia się spóźniają?",
    desc: "Codzienne powiadomienia według pór przyjmowania.",
    on: "Wł.", off: "Wył.",
    denied: "Powiadomienia są zablokowane. Włącz je w ustawieniach telefonu.",
    webOnly: "Przypomnienia działają tylko w zainstalowanej aplikacji.",
  },
};

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fLong = (d, lc) => new Intl.DateTimeFormat(lc, { weekday: "long", month: "long", day: "numeric" }).format(d);
const fShort = (d, lc) => new Intl.DateTimeFormat(lc, { month: "short", day: "numeric" }).format(d);
const fDay = (d, lc) => new Intl.DateTimeFormat(lc, { month: "long", day: "numeric" }).format(d);
const fMonth = (d, lc) => new Intl.DateTimeFormat(lc, { month: "long", year: "numeric" }).format(d);
const fDateTime = (iso, lc) => { const d = new Date(iso); return `${fShort(d, lc)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fTime = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const wdShort = (lc) => { const f = new Intl.DateTimeFormat(lc, { weekday: "short" }); return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 7 + i))); };
const toLocalInput = (d) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
const parseDay = (s) => { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd); };
const relLabel = (dateStr, t) => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((parseDay(dateStr) - now) / 86400000);
  if (diff === 0) return t.today;
  if (diff === 1) return t.tomorrow;
  if (diff > 1) return t.inDays(diff);
  return t.passed;
};

const FEEDBACK_TO = "jormor16@valdorfas.org";
const APP_VERSION = "1.4";
const DEFAULT_DATA = { meds: [], doseLog: {}, seizures: [], daily: {}, notes: [], events: [], calm: [], auraTypes: [], auraEvents: [], settings: { name: "", overdueMin: 60, lang: "lt", notify: true, backupRemind: true, opens: 0, fbCard: "pending" } };
const AURA_LINK_MIN = 60;   // per kiek laiko po auros priepuolis laikomas susijusiu

/**
 * Užrašų skirtukas pašalintas, todėl seni atskiri užrašai perkeliami prie tos
 * dienos, kurią buvo paskutinį kartą redaguoti — iš ten jie patenka į ataskaitą.
 * Be šito jie liktų duomenyse ir atsarginėse kopijose, bet be jokio kelio juos
 * pamatyti; tyliai paslėpti sveikatos įrašus būtų blogiau nei jų neturėti.
 *
 * Idempotentiška: po perkėlimo `notes` lieka tuščias masyvas, o pakartotinis
 * paleidimas iš neperrašytos saugyklos duoda tą patį rezultatą, ne dublikatus.
 * `notes` laukas paliekamas, kad senų kopijų formato tikrinimas nesulūžtų.
 */
function migrateNotes(d) {
  if (!Array.isArray(d.notes) || !d.notes.length) return d;
  for (const n of d.notes) {
    const txt = (n.text || "").trim();
    if (!txt) continue;
    const k = dkey(new Date(n.updated));
    const cur = { ...DAILY_EMPTY, ...(d.daily[k] || {}) };
    cur.note = cur.note ? `${cur.note}\n${txt}` : txt;
    d.daily[k] = cur;
  }
  d.notes = [];
  return d;
}

const hydrate = (p) => migrateNotes({
  ...DEFAULT_DATA, ...p,
  settings: { ...DEFAULT_DATA.settings, ...(p.settings || {}) },
});
const DAILY_EMPTY = { sleep: null, stress: null, fatigue: null, alcohol: null, note: "" };
const TYPE_IDS = ["tonicClonic", "absence", "focal", "myoclonic", "other"];
const EFFECT_IDS = ["fall", "injury", "tongue", "incontinence"];
const TRIGGER_IDS = ["insomnia", "missedMeds", "alcohol"];   // vertimų žodyne lieka ir seni – dėl senų įrašų
const CAT_IDS = ["doctor", "surgery", "family", "other"];
const CAT_COLOR = { doctor: [C.blue, C.blueSoft], surgery: [C.plum, C.plumSoft], family: [C.sage, C.sageSoft], other: [C.sub, "#EBE9E0"] };
const DURATIONS = ["<1 min", "1–2 min", "2–5 min", ">5 min"];
// senų (v0.4) įrašų reikšmės buvo lietuviški tekstai — rodomi kaip yra
const lbl = (map, id) => map[id] || id;
const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
// skaičiuoja tik tų vaistų dozes, kurie tebėra sąraše (ištrynus vaistą lieka „našlaičiai“ įrašai)
const takenOn = (data, k, ids) => Object.keys(data.doseLog[k] || {}).filter((x) => ids.has(x.slice(0, x.lastIndexOf("@")))).length;
const medIds = (data) => new Set(data.meds.map((m) => m.id));
// Nuo kada galioja dabartiniai vaisto laikai. Senesnėms dienoms grafiko NEŽINOM,
// todėl jos į laikymosi vardiklį neįtraukiamos — kitaip šiandien pridėtas vaistas
// paverstų visą praėjusį mėnesį „0 %“, o laikų pakeitimas nubrauktų procentą be priežasties.
const scheduledOn = (meds, dk) => meds.reduce((a, m) => a + ((m.timesFrom || "0000-00-00") <= dk ? m.times.length : 0), 0);

// ---------- ženklas ----------
/**
 * Šešialapė forma: r(θ) = R·(1 + 0,22·cos(6θ)), piešiama storu kontūru.
 *
 * Uždara ir radialiai simetriška sąmoningai: kvadratinėje ir apvalioje Android
 * kaukėje ji užpildo plotą tolygiai. Ankstesnė EEG kreivė buvo plati ir žema,
 * todėl apskritime viršuje ir apačioje likdavo tuščia.
 *
 * `simple` tik sustorina kontūrą ir šiek tiek sutraukia formą — pranešimų
 * piktogramoje ties 24 px plonas kontūras subyra.
 *
 * Ta pati formulė gyvena tools/make-icons.mjs. Pakeitus čia, reikia paleisti
 * `npm run icons`, kitaip sąsaja ir piktograma prasilenks.
 */
function AuraMark({ size = 30, color = C.clay, simple = false }) {
  const K = 6, A = 0.22;
  // R parinktas taip, kad kraštinė viršūnė su puse brūkšnio dar tilptų į 16:
  // R·(1+A) + R·sw/2 ≤ 16. Peržengus, formos smaigaliai nusikirstų.
  const R = simple ? 11.7 : 12.0;
  const sw = R * (simple ? 0.26 : 0.20);
  const steps = 240;

  let d = "";
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const r = R * (1 + A * Math.cos(K * th));
    d += `${i ? "L" : "M"}${(Math.cos(th) * r).toFixed(2)} ${(Math.sin(th) * r).toFixed(2)} `;
  }

  return (
    <svg viewBox="-16 -16 32 32" width={size} height={size} aria-hidden="true">
      {/* stroke per style: reikšmė yra var(--c-clay), o atributuose var() neveikia */}
      <path d={`${d.trim()} Z`} fill="none" strokeWidth={sw.toFixed(2)}
        strokeLinejoin="round" style={{ stroke: color }} />
    </svg>
  );
}

// ---------- shared pieces ----------
function SectionLabel({ children, style }) {
  return <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 600, color: C.ink, margin: "24px 4px 10px", ...style }}>{children}</div>;
}

// `tour` – kad apžvalga galėtų apvesti ne tik mygtukus, bet ir ištisas korteles
function Card({ children, style, tour }) {
  return <div data-tour={tour} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: `0 1px 2px ${C.sh1}`, ...style }}>{children}</div>;
}

function Chip({ active, onClick, children, color = C.clay, soft = C.claySoft }) {
  return (
    <button className="press" onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 500, fontFamily: T.body,
      border: `1px solid ${active ? color : C.line}`, background: active ? soft : C.card,
      color: active ? color : C.ink, transition: "all 120ms ease",
    }}>{children}</button>
  );
}

/**
 * Visos parinktys rodomos vienu metu, pasirinktoji paryškinta.
 * Perjungiklis, rodantis savo esamą būseną kaip užrašą, yra neįskaitomas:
 * vartotojas mato „Ne“ ir skaito tai kaip pasirinkimą, o ne kaip atsakymą.
 * Neatsakyta būsena (value == null) nepažymi nė vienos parinkties.
 */
function Segmented({ value, onChange, options, color = C.clay, soft = C.claySoft, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{
      display: "inline-flex", gap: 2, padding: 2, background: C.white,
      border: `1px solid ${C.line}`, borderRadius: 999,
    }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button key={String(o.v)} role="radio" aria-checked={on} className="press" onClick={() => onChange(o.v)}
            style={{
              padding: "6px 16px", borderRadius: 999, fontSize: 13.5, fontFamily: T.body,
              fontWeight: on ? 600 : 500,
              background: on ? soft : "transparent",
              color: on ? color : C.sub,
              border: `1px solid ${on ? color : "transparent"}`,
              transition: "all 120ms ease",
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function DeleteBtn({ onConfirm, t }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const x = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(x);
  }, [armed]);
  if (armed) {
    return <button onClick={onConfirm} style={{ fontSize: 13, fontWeight: 600, color: C.red, padding: "4px 10px", borderRadius: 999, background: C.redSoft }}>{t.deleteQ}</button>;
  }
  return <button onClick={() => setArmed(true)} aria-label={t.del} style={iconBtn}><Trash2 size={16} /></button>;
}

function Sheet({ title, onClose, children, t }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: C.sh4 }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", background: C.bg, borderRadius: "18px 18px 0 0", padding: "18px 18px 28px", boxShadow: `0 -4px 24px ${C.sh2}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} aria-label={t.close} style={iconBtn}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PrimaryBtn({ onClick, children, disabled, color = C.clay, style, tour }) {
  return (
    <button className="press" onClick={onClick} disabled={disabled} data-tour={tour} style={{
      width: "100%", padding: "13px 16px", borderRadius: 12, fontFamily: T.body, fontSize: 15, fontWeight: 600,
      background: disabled ? C.line : color, color: disabled ? C.sub : C.onAccent,
      transition: "transform 80ms ease, background 120ms ease", ...style,
    }}>{children}</button>
  );
}

const iconBtn = {
  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center", color: C.sub,
};

const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.white, fontSize: 15, color: C.ink, fontFamily: T.body };

/**
 * Suvestinė pirmame ekrane. Tai vienintelis dalykas, kurio bloknotas negali —
 * ir iki šiol jis buvo paslėptas už 20 px ikonos antraštėje.
 * Tuščioje būsenoje rodomas PAVYZDYS, aiškiai pažymėtas: neturi atrodyti kaip
 * tikri duomenys, bet turi parodyti, kas čia bus.
 */
function SummaryStrip({ data, t, onOpen }) {
  const hasData = data.meds.length || data.seizures.length || Object.keys(data.daily).length;
  const r = useMemo(() => (hasData ? buildReport(data, 30, t) : null), [data, t, hasData]);

  const cells = hasData
    ? [
        { v: r.seiz.length, unit: "", label: t.sumSeiz, color: r.seiz.length ? C.plum : C.sage },
        { v: r.adh == null ? "—" : r.adh, unit: r.adh == null ? "" : "%", label: t.sumAdh, color: r.adh == null ? C.sub : r.adh >= 90 ? C.sage : C.amber },
        { v: r.sleepAvg == null ? "—" : r.sleepAvg, unit: r.sleepAvg == null ? "" : "h", label: t.sumSleep, color: r.sleepAvg == null ? C.sub : r.sleepAvg < 6 ? C.amber : C.sage },
      ]
    : [
        { v: 2, unit: "", label: t.sumSeiz, color: C.sub },
        { v: 94, unit: "%", label: t.sumAdh, color: C.sub },
        { v: 6.8, unit: "h", label: t.sumSleep, color: C.sub },
      ];

  return (
    <Card style={{ marginTop: 14, padding: 14, opacity: hasData ? 1 : 0.75 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 600 }}>{t.sum30}</div>
        {hasData && (
          <button className="press" onClick={onOpen} style={{ fontSize: 13, fontWeight: 600, color: C.clay }}>
            {t.sumOpen} →
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {cells.map((c, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", padding: "8px 2px", background: C.white, border: `1px solid ${C.line}`, borderRadius: 10 }}>
            <div style={{ fontFamily: T.serif, fontSize: 24, fontWeight: 700, color: c.color, lineHeight: 1.1 }}>
              {c.v}<span style={{ fontSize: 14, fontWeight: 600 }}>{c.unit}</span>
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
      {!hasData && (
        <>
          <div style={{ fontSize: 12, color: C.amber, fontWeight: 600, marginTop: 10 }}>{t.sumDemo}</div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5, marginTop: 6 }}>{t.sumWhy}</div>
        </>
      )}
    </Card>
  );
}

// ---------- meds ----------
function MedForm({ initial, onSave, onClose, t }) {
  const [name, setName] = useState(initial?.name || "");
  const [dose, setDose] = useState(initial?.dose || "");
  const [times, setTimes] = useState(initial?.times ? [...initial.times] : ["08:00"]);
  const setTime = (i, v) => setTimes(times.map((x, j) => (j === i ? v : x)));
  const valid = name.trim() && times.length > 0 && times.every((x) => x);
  return (
    <Sheet title={initial ? t.editMed : t.newMed} onClose={onClose} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} placeholder={t.medName} value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inputStyle} placeholder={t.medDose} value={dose} onChange={(e) => setDose(e.target.value)} />
        <SectionLabel style={{ margin: "8px 4px 0" }}>{t.times}</SectionLabel>
        {times.map((x, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="time" style={{ ...inputStyle, flex: 1 }} value={x} onChange={(e) => setTime(i, e.target.value)} />
            {times.length > 1 && (
              <button onClick={() => setTimes(times.filter((_, j) => j !== i))} aria-label={t.removeTime} style={{ padding: 10, color: C.sub }}><X size={18} /></button>
            )}
          </div>
        ))}
        <button onClick={() => setTimes([...times, "20:00"])} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, color: C.clay, fontWeight: 600, fontSize: 14, padding: 4 }}>
          <Plus size={16} /> {t.addTime}
        </button>
        <PrimaryBtn disabled={!valid} onClick={() => {
          const nt = [...times].sort();
          const changed = !initial || JSON.stringify(initial.times) !== JSON.stringify(nt);
          onSave({ ...(initial || {}), id: initial?.id || uid(), name: name.trim(), dose: dose.trim(), times: nt,
                   timesFrom: changed ? todayKey() : initial.timesFrom });
        }}>{t.saveMed}</PrimaryBtn>
      </div>
    </Sheet>
  );
}

function DoseRow({ time, takenAt, overdue, onToggle, t }) {
  const taken = !!takenAt;
  const accent = taken ? C.clay : overdue ? C.amber : C.line;
  return (
    <button className="press" onClick={onToggle} aria-pressed={taken} aria-label={`${t.dose} ${time}`}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 14px",
        borderRadius: 12, border: `1.5px solid ${accent}`, textAlign: "left",
        background: taken ? C.claySoft : C.white,
        transition: "background 140ms ease, border-color 140ms ease",
      }}>
      <div style={{
        fontFamily: T.serif, fontSize: 21, fontWeight: 700, minWidth: 62,
        fontVariantNumeric: "tabular-nums", color: taken ? C.clayDark : C.ink,
      }}>{time}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: taken ? C.clayDark : overdue ? C.amber : C.sub }}>
          {taken ? t.stTaken : overdue ? t.stLate : t.stSoon}
        </div>
        {taken && (
          <div style={{ fontSize: 12, color: C.sub, fontVariantNumeric: "tabular-nums" }}>
            {new Date(takenAt).toTimeString().slice(0, 5)}
          </div>
        )}
      </div>

      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        border: `1.5px solid ${taken ? C.clay : overdue ? C.amber : C.line}`,
        background: taken ? C.clay : "transparent", color: C.onAccent,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {taken && <Check size={20} strokeWidth={3} />}
      </div>
    </button>
  );
}

function MedsView({ data, update, t, lc, onReport, timer, onEndTimer, onDiscardTimer, fbCard }) {
  const [editing, setEditing] = useState(undefined);
  const tk = todayKey();
  const log = data.doseLog[tk] || {};
  const now = new Date();
  const odMin = data.settings?.overdueMin ?? 60;
  const totalToday = data.meds.reduce((a, m) => a + m.times.length, 0);
  const takenToday = data.meds.reduce((a, m) => a + m.times.filter((x) => log[`${m.id}@${x}`]).length, 0);
  const WD = wdShort(lc);

  const toggle = (medId, time) => {
    const med = data.meds.find((m) => m.id === medId);
    const wasTaken = !!log[`${medId}@${time}`];
    update((d) => {
      const day = d.doseLog[tk] || {};
      const k = `${medId}@${time}`;
      if (day[k]) delete day[k]; else day[k] = new Date().toISOString();
      d.doseLog[tk] = day;
      return d;
    });
    // pažymėjus – nutildom šios dozės priminimą ir jos pakartojimą;
    // atšaukus pažymėjimą – grąžinam, jei laikas dar nepraėjo
    if (wasTaken) { if (med) restoreDose(med, time, tk, t); }
    else cancelDose(medId, time, tk);
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));

  return (
    <div>
      {/* Priepuolio ir auros mygtukai perkelti į Priepuolių skirtuką: šis ekranas
          skirtas vaistams, o kasdien dažniausiai atliekamas veiksmas čia yra dozės
          pažymėjimas. Veikiantis laikmatis lieka matomas ir čia — 5 min riba
          svarbesnė už skirtukų tvarką. */}
      {timer && (
        <SeizureTimer timer={timer} t={t} onEnd={() => onEndTimer()} onDiscard={onDiscardTimer}
          onConfirmStale={() => onEndTimer()} />
      )}
      {fbCard}
      <SummaryStrip data={data} t={t} onOpen={onReport} />
      <SectionLabel>{t.todayIs} · {fLong(now, lc)}</SectionLabel>
      {data.meds.length === 0 && (
        <Card style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontFamily: T.serif, fontSize: 19, fontWeight: 600, marginBottom: 6 }}>{t.medsEmptyT}</div>
          <div style={{ color: C.sub, fontSize: 14, lineHeight: 1.5 }}>{t.medsEmptyB}</div>
        </Card>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.meds.map((m) => (
          <Card key={m.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: T.serif, fontWeight: 600, fontSize: 17 }}>{m.name}</div>
                {m.dose && <div style={{ fontSize: 13, color: C.sub }}>{m.dose}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button className="press" onClick={() => setEditing(m)} aria-label={t.edit} style={iconBtn}><Pencil size={16} /></button>
              <DeleteBtn t={t} onConfirm={() => update((d) => {
                d.meds = d.meds.filter((x) => x.id !== m.id);
                Object.keys(d.doseLog).forEach((k) => {
                  Object.keys(d.doseLog[k]).forEach((dk) => { if (dk.startsWith(m.id + "@")) delete d.doseLog[k][dk]; });
                  if (!Object.keys(d.doseLog[k]).length) delete d.doseLog[k];
                });
                return d;
              })} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {m.times.map((x) => {
                const takenAt = log[`${m.id}@${x}`];
                const [hh, mm] = x.split(":").map(Number);
                const due = new Date(now); due.setHours(hh, mm, 0, 0);
                return <DoseRow key={x} t={t} time={x} takenAt={takenAt} overdue={!takenAt && now - due > odMin * 60000} onToggle={() => toggle(m.id, x)} />;
              })}
            </div>
          </Card>
        ))}
      </div>

      {totalToday > 0 && (
        <div style={{ margin: "14px 4px 0", fontSize: 14, fontWeight: 500, color: takenToday === totalToday ? C.sage : C.ink }}>
          {t.taken(takenToday, totalToday)}{takenToday === totalToday ? t.allDone : ""}
        </div>
      )}

      {data.meds.length > 0 && (
        <>
          <SectionLabel>{t.last7}</SectionLabel>
          <Card>
            <div style={{ display: "flex", gap: 8 }}>
              {days.map((d) => {
                const k = dkey(d);
                const sched = scheduledOn(data.meds, k);
                const taken = Math.min(takenOn(data, k, medIds(data)), sched || 1);
                const full = sched > 0 && taken >= sched;
                const some = taken > 0 && !full;
                return (
                  <div key={k} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{
                      height: 36, borderRadius: 10, background: full ? C.clay : some ? C.amberSoft : C.white,
                      border: `1px solid ${full ? C.clay : some ? C.amber : C.line}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: full ? C.onAccent : some ? C.amber : C.line, fontSize: 12, fontWeight: 600,
                    }}>
                      {full ? <Check size={15} strokeWidth={2.8} /> : some ? taken : "·"}
                    </div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{WD[d.getDay()]}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <PrimaryBtn onClick={() => setEditing(null)} tour="addMed" style={{ marginTop: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Plus size={17} /> {t.addMed}</span>
      </PrimaryBtn>

      {editing !== undefined && (
        <MedForm t={t} initial={editing} onClose={() => setEditing(undefined)} onSave={(med) => {
          update((d) => {
            const i = d.meds.findIndex((x) => x.id === med.id);
            if (i >= 0) d.meds[i] = med; else d.meds.push(med);
            return d;
          });
          setEditing(undefined);
        }} />
      )}
    </div>
  );
}

// ---------- seizures ----------
function SeizureForm({ initial, measured, recentAura, onSave, onClose, t, auraTypes = [], onAddAuraType }) {
  const [at, setAt] = useState(toLocalInput(initial ? new Date(initial.at) : measured ? new Date(measured.startedAt) : new Date()));
  const [type, setType] = useState(initial?.type && initial.type !== "unspec" ? initial.type : null);
  const [dur, setDur] = useState(initial?.dur ?? (measured ? bucketOf(measured.durSec) : null));
  const [aura, setAura] = useState(initial ? (initial.aura ?? null) : recentAura ? true : null);
  const [trigs, setTrigs] = useState(initial?.triggers ?? []);
  const [trigOther, setTrigOther] = useState(initial?.triggerOther ?? "");
  const [effects, setEffects] = useState(initial?.effects ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [kinds, setKinds] = useState(initial?.auraKinds ?? []);
  const [newKind, setNewKind] = useState("");
  const tog = (arr, set) => (x) => set(arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  return (
    <Sheet title={initial ? t.editSeiz : t.regSeiz} onClose={onClose} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="datetime-local" style={inputStyle} value={at} onChange={(e) => setAt(e.target.value)} />
        <SectionLabel style={{ margin: "6px 4px 0" }}>{t.type}</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TYPE_IDS.map((id) => <Chip key={id} active={type === id} onClick={() => setType(id)} color={C.plum} soft={C.plumSoft}>{t.ty[id]}</Chip>)}
        </div>
        <SectionLabel style={{ margin: "6px 4px 0" }}>{t.duration}</SectionLabel>
        {measured ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.plumSoft, border: `1px solid ${C.plum}` }}>
            <span style={{ fontFamily: T.serif, fontSize: 24, fontWeight: 700, color: C.plum, fontVariantNumeric: "tabular-nums" }}>
              {fmtDuration(measured.durSec)}
            </span>
            <span style={{ fontSize: 12.5, color: C.sub }}>{t.measured}</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DURATIONS.map((x) => <Chip key={x} active={dur === x} onClick={() => setDur(x)} color={C.plum} soft={C.plumSoft}>{x}</Chip>)}
          </div>
        )}
        {dur === ">5 min" && (
          <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.5 }}>{t.statusWarn}</div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{t.aura}</div>
          <Segmented ariaLabel={t.aura} value={aura} onChange={setAura}
            options={[{ v: true, label: t.yes }, { v: false, label: t.no }]} />
        </div>
        {!initial && recentAura && (
          <div style={{ fontSize: 12.5, color: C.plum, fontWeight: 600 }}>
            {t.auraLinked.replace("{n}", Math.max(1, Math.round((Date.now() - recentAura.at) / 60000)))}
          </div>
        )}
        {aura === true && (
          <>
            <SectionLabel style={{ margin: "6px 4px 0" }}>{t.auraKinds}</SectionLabel>
            {auraTypes.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {auraTypes.map((a) => (
                  <Chip key={a.id} active={kinds.includes(a.id)} color={C.plum} soft={C.plumSoft}
                    onClick={() => setKinds(kinds.includes(a.id) ? kinds.filter((x) => x !== a.id) : [...kinds, a.id])}>
                    {a.label}
                  </Chip>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder={t.auraNew} value={newKind}
                onChange={(e) => setNewKind(e.target.value)} />
              <button className="press" disabled={!newKind.trim()} aria-label={t.auraNew}
                onClick={() => {
                  const id = onAddAuraType(newKind.trim());
                  if (id) setKinds([...kinds, id]);
                  setNewKind("");
                }}
                style={{ width: 44, borderRadius: 10, background: newKind.trim() ? C.plum : C.line, color: C.onAccent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={20} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>{t.auraHint}</div>
          </>
        )}
        <SectionLabel style={{ margin: "6px 4px 0" }}>{t.effects}</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EFFECT_IDS.map((id) => <Chip key={id} active={effects.includes(id)} onClick={() => tog(effects, setEffects)(id)} color={C.plum} soft={C.plumSoft}>{t.ef[id]}</Chip>)}
        </div>
        <SectionLabel style={{ margin: "6px 4px 0" }}>{t.triggers}</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TRIGGER_IDS.map((id) => <Chip key={id} active={trigs.includes(id)} onClick={() => tog(trigs, setTrigs)(id)} color={C.sage} soft={C.sageSoft}>{t.tg[id]}</Chip>)}
        </div>
        <input style={inputStyle} placeholder={t.trigOtherPh} value={trigOther} onChange={(e) => setTrigOther(e.target.value)} />
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} placeholder={t.seizNote} value={note} onChange={(e) => setNote(e.target.value)} />
        <PrimaryBtn color={C.plum} onClick={() => {
          const when = new Date(at), now = new Date();
          onSave({ ...(initial || {}), id: initial?.id || uid(), durSec: measured?.durSec ?? initial?.durSec, auraEventId: initial?.auraEventId ?? recentAura?.id, at: (when > now ? now : when).toISOString(), type: type || "unspec", dur, aura, auraKinds: aura === true ? kinds : [], effects, triggers: trigs, triggerOther: trigOther.trim() || undefined, note: note.trim() });
        }}>
          {t.saveEntry}
        </PrimaryBtn>
      </div>
    </Sheet>
  );
}

function SeizuresView({ data, update, t, lc, onReport, quickLog, measured, onMeasuredUsed, timer, onStartTimer, onEndTimer, onDiscardTimer, recentAura, onSaved, onAura, auraMsg }) {
  const [editing, setEditing] = useState(undefined);
  useEffect(() => { if (quickLog) setEditing(null); }, [quickLog]);
  useEffect(() => { if (measured) setEditing(null); }, [measured]); // undefined=uždaryta, null=naujas, objektas=redaguojamas
  const list = [...data.seizures].sort((a, b) => new Date(b.at) - new Date(a.at));
  const now = new Date();
  const last30 = list.filter((s) => now - new Date(s.at) < 30 * 86400000).length;
  const daysSince = list.length ? Math.floor((now - new Date(list[0].at)) / 86400000) : null;

  return (
    <div>
      {timer ? (
        <SeizureTimer timer={timer} t={t} onEnd={() => onEndTimer()} onDiscard={onDiscardTimer}
          onConfirmStale={() => onEndTimer()} />
      ) : (
        <>
          <PrimaryBtn color={C.plum} onClick={onStartTimer} tour="seiz" style={{ marginTop: 14, padding: "16px 16px", fontSize: 16 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Zap size={19} /> {t.seizStart}</span>
          </PrimaryBtn>
          {/* atkeliavo iš Vaistų skirtuko: aura yra vienintelė priepuolio dalis,
              kurią išgyveni sąmoningai, tad šis mygtukas realiai paspaudžiamas */}
          <button className="press" onClick={onAura} data-tour="aura" style={{
            width: "100%", marginTop: 8, padding: "12px 16px", borderRadius: 12,
            border: `1px solid ${C.plum}`, background: C.card, color: C.plum, fontSize: 14.5, fontWeight: 600,
          }}>{t.auraFeel}</button>
          {auraMsg && <div style={{ fontSize: 13, color: C.plum, fontWeight: 600, marginTop: 8, textAlign: "center" }}>{t.auraLogged}</div>}
          <button className="press" onClick={() => setEditing(null)} data-tour="regSeiz"
            style={{ width: "100%", padding: 10, marginTop: 8, fontSize: 14, fontWeight: 600, color: C.sub }}>
            {t.regSeiz}
          </button>
        </>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1, padding: 12, textAlign: "center" }}>
          <div style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 700, color: C.plum, lineHeight: 1.1 }}>{last30}</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{t.per30}</div>
        </Card>
        <Card style={{ flex: 1, padding: 12, textAlign: "center" }}>
          <div style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 700, color: C.sage, lineHeight: 1.1 }}>{daysSince === null ? "—" : daysSince}</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{t.daysSince}</div>
        </Card>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionLabel>{t.diary}</SectionLabel>
        {list.length > 0 && (
          <button className="press" onClick={onReport} style={{ fontSize: 13, fontWeight: 600, color: C.clay, padding: "4px 2px" }}>
            {t.sumOpen} →
          </button>
        )}
      </div>
      {list.length === 0 && <Card style={{ textAlign: "center", padding: 24, color: C.sub, fontSize: 14, lineHeight: 1.5 }}>{t.seizEmpty}</Card>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((s) => (
          <Card key={s.id} style={{ borderLeft: `4px solid ${C.plum}`, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{fDateTime(s.at, lc)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button className="press" onClick={() => setEditing(s)} aria-label={t.edit} style={iconBtn}><Pencil size={16} /></button>
                <DeleteBtn t={t} onConfirm={() => update((d) => { d.seizures = d.seizures.filter((x) => x.id !== s.id); return d; })} />
              </div>
            </div>
            <div style={{ fontSize: 14, marginTop: 2 }}>
              {lbl(t.ty, s.type)}{s.durSec != null ? ` · ${fmtDuration(s.durSec)}` : s.dur ? ` · ${s.dur}` : ""}{s.aura ? ` · ${t.withAura}` : ""}
            </div>
            {s.auraKinds?.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {s.auraKinds.map((k) => {
                  const a = (data.auraTypes || []).find((x) => x.id === k);
                  return <span key={k} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, border: `1px solid ${C.plum}`, color: C.plum, fontWeight: 500 }}>{a ? a.label : k}</span>;
                })}
              </div>
            )}
            {s.effects?.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {s.effects.map((x) => <span key={x} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: C.plumSoft, color: C.plum, fontWeight: 500 }}>{lbl(t.ef, x)}</span>)}
              </div>
            )}
            {s.triggers?.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {s.triggers.map((x) => <span key={x} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: C.sageSoft, color: C.sage, fontWeight: 500 }}>{lbl(t.tg, x)}</span>)}
                {s.triggerOther && <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: C.sageSoft, color: C.sage, fontWeight: 500 }}>{s.triggerOther}</span>}
              </div>
            )}
            {s.note && <div style={{ fontSize: 13, color: C.sub, marginTop: 8 }}>{s.note}</div>}
          </Card>
        ))}
      </div>

      {editing !== undefined && (
        <SeizureForm t={t} initial={editing} measured={editing ? null : measured} recentAura={editing ? null : recentAura} auraTypes={data.auraTypes || []}
          onAddAuraType={(label) => {
            const exist = (data.auraTypes || []).find((a) => a.label.toLowerCase() === label.toLowerCase());
            if (exist) return exist.id;
            const id = "aura_" + uid();
            update((d) => { d.auraTypes = [...(d.auraTypes || []), { id, label }]; return d; });
            return id;
          }}
          onClose={() => { setEditing(undefined); onMeasuredUsed(); }} onSave={(e) => {
          update((d) => {
            const i = d.seizures.findIndex((x) => x.id === e.id);
            if (i >= 0) d.seizures[i] = e; else d.seizures.push(e);
            return d;
          });
          setEditing(undefined); onMeasuredUsed(); onSaved && onSaved();
        }} />
      )}
    </div>
  );
}

// ---------- calendar ----------
function EventForm({ initial, presetDate, onSave, onClose, t }) {
  const [date, setDate] = useState(initial?.date || presetDate || todayKey());
  const [time, setTime] = useState(initial?.time || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [cat, setCat] = useState(initial?.cat || "doctor");
  return (
    <Sheet title={initial ? t.editEvent : t.newEvent} onClose={onClose} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} placeholder={t.eventWhat} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" style={{ ...inputStyle, flex: 1.4 }} value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" style={{ ...inputStyle, flex: 1 }} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: -6 }}>{t.timeOptional}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CAT_IDS.map((id) => <Chip key={id} active={cat === id} onClick={() => setCat(id)} color={CAT_COLOR[id][0]} soft={CAT_COLOR[id][1]}>{t.cat[id]}</Chip>)}
        </div>
        <PrimaryBtn disabled={!title.trim() || !date} onClick={() => onSave({ id: initial?.id || uid(), date, time: time || null, title: title.trim(), cat })}>{t.saveEvent}</PrimaryBtn>
      </div>
    </Sheet>
  );
}

function EventRow({ e, onDelete, onEdit, showDate, t, lc }) {
  const color = (CAT_COLOR[e.cat] || CAT_COLOR.other)[0];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
        <div style={{ fontSize: 12, color: C.sub }}>
          {showDate ? `${fDay(parseDay(e.date), lc)} · ${relLabel(e.date, t)}` : e.time ? e.time : t.allDay}
          {showDate && e.time ? ` · ${e.time}` : ""}
        </div>
      </div>
      <button className="press" onClick={onEdit} aria-label={t.edit} style={iconBtn}><Pencil size={15} /></button>
      <DeleteBtn t={t} onConfirm={onDelete} />
    </div>
  );
}

function CalendarView({ data, update, t, lc }) {
  const today = new Date();
  const [cur, setCur] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [sel, setSel] = useState(todayKey());
  const [editing, setEditing] = useState(undefined);
  const WD = wdShort(lc);
  const WD_MON = [...WD.slice(1), WD[0]];

  const y = cur.getFullYear(), m = cur.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const byDate = {};
  data.events.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });

  // Priepuoliai tinklelyje. Iki šiol kalendorius rodė tik savus įvykius, todėl
  // vienintelis ekranas, kuriame matomas dažnio raštas per mėnesius — tai, į ką
  // žiūrima gydytojo kabinete — apie priepuolius nieko nesakė.
  // `s.at` yra ISO tekstas (žr. SeizureForm), skirtingai nuo auros įvykių.
  const seizByDate = useMemo(() => {
    const m = {};
    data.seizures.forEach((s) => { const k = dkey(new Date(s.at)); (m[k] = m[k] || []).push(s); });
    return m;
  }, [data.seizures]);

  const tk = todayKey();
  const selSeiz = (seizByDate[sel] || []).sort((a, b) => new Date(a.at) - new Date(b.at));
  const selEvents = (byDate[sel] || []).sort((a, b) => ((a.time || "") < (b.time || "") ? -1 : 1));
  const upcoming = data.events.filter((e) => e.date >= tk)
    .sort((a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? -1 : 1)).slice(0, 5);
  const removeEvent = (id) => update((d) => { d.events = d.events.filter((x) => x.id !== id); return d; });

  // perbraukimas tarp mėnesių; slenkstis pakankamas, kad nesuveiktų vietoj dienos paspaudimo
  const sw = useRef(null);
  const swipe = {
    onPointerDown: (e) => { sw.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e) => {
      if (!sw.current) return;
      const dx = e.clientX - sw.current.x, dy = e.clientY - sw.current.y;
      sw.current = null;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) setCur(new Date(y, m + (dx < 0 ? 1 : -1), 1));
    },
    onPointerCancel: () => { sw.current = null; },
  };

  return (
    <div>
      <Card tour="calGrid" style={{ marginTop: 16, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button className="press" onClick={() => setCur(new Date(y, m - 1, 1))} aria-label={t.prev} style={iconBtn}><ChevronLeft size={20} /></button>
          <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 600, textTransform: "capitalize" }}>{fMonth(cur, lc)}</div>
          <button className="press" onClick={() => setCur(new Date(y, m + 1, 1))} aria-label={t.next} style={iconBtn}><ChevronRight size={20} /></button>
        </div>
        <div {...swipe} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, touchAction: "pan-y" }}>
          {WD_MON.map((w, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, color: C.sub, fontWeight: 600, paddingBottom: 4 }}>{w}</div>)}
          {Array.from({ length: offset }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: dim }, (_, i) => {
            const day = i + 1;
            const k = `${y}-${pad(m + 1)}-${pad(day)}`;
            const isToday = k === tk, isSel = k === sel;
            const evs = byDate[k] || [];
            const sz = seizByDate[k] || [];
            return (
              <button key={k} onClick={() => setSel(k)} style={{
                height: 46, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                borderRadius: 10, border: isSel ? `1.5px solid ${C.clay}` : "1.5px solid transparent",
                background: isToday ? C.claySoft : "transparent",
              }}>
                <div style={{ fontSize: 14, fontWeight: isToday || isSel ? 700 : 400, color: isToday ? C.clayDark : C.ink }}>{day}</div>
                {/* Priepuoliai pirmi. Žymimi brūkšneliu, ne tašku: C.plum ir C.blue
                    paletėje yra ta pati spalva, tad gydytojo vizitas ir priepuolis
                    skirtųsi tik dydžiu. Forma skiria patikimiau nei 1 px, ir veikia
                    esant spalvų neskyrimui. */}
                <div style={{ display: "flex", alignItems: "center", gap: 2, height: 6 }}>
                  {sz.slice(0, 3).map((s) => <div key={s.id} style={{ width: 7, height: 4, borderRadius: 2, background: C.plum }} />)}
                  {evs.slice(0, Math.max(0, 3 - sz.length)).map((e) => <div key={e.id} style={{ width: 5, height: 5, borderRadius: "50%", background: (CAT_COLOR[e.cat] || CAT_COLOR.other)[0] }} />)}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <SectionLabel style={{ textTransform: "capitalize" }}>{fDay(parseDay(sel), lc)}</SectionLabel>
      <Card style={{ padding: "6px 14px 14px" }}>
        {selSeiz.length === 0 && selEvents.length === 0 && <div style={{ color: C.sub, fontSize: 14, padding: "10px 2px" }}>{t.noEventsDay}</div>}
        {/* tik peržiūra: redaguojama Priepuolių skirtuke, kad nebūtų dviejų kelių
            į tą patį įrašą */}
        {selSeiz.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0 4px" }}>
            {selSeiz.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: `3px solid ${C.plum}`, paddingLeft: 10 }}>
                <Zap size={15} style={{ color: C.plum, flexShrink: 0 }} />
                <div style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{fTime(s.at)}</span>
                  {" · "}{lbl(t.ty, s.type)}
                  {s.durSec != null ? ` · ${fmtDuration(s.durSec)}` : s.dur ? ` · ${s.dur}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
        {selEvents.map((e) => <EventRow key={e.id} e={e} t={t} lc={lc} onEdit={() => setEditing(e)} onDelete={() => removeEvent(e.id)} />)}
        <PrimaryBtn onClick={() => setEditing(null)} style={{ marginTop: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Plus size={17} /> {t.addForDay}</span>
        </PrimaryBtn>
      </Card>

      {upcoming.length > 0 && (
        <>
          <SectionLabel>{t.upcoming}</SectionLabel>
          <Card style={{ padding: "4px 14px 8px" }}>
            {upcoming.map((e) => <EventRow key={e.id} e={e} t={t} lc={lc} showDate onEdit={() => setEditing(e)} onDelete={() => removeEvent(e.id)} />)}
          </Card>
        </>
      )}

      {editing !== undefined && (
        <EventForm t={t} initial={editing} presetDate={sel} onClose={() => setEditing(undefined)} onSave={(ev) => {
          update((d) => {
            const i = d.events.findIndex((x) => x.id === ev.id);
            if (i >= 0) d.events[i] = ev; else d.events.push(ev);
            return d;
          });
          setEditing(undefined);
        }} />
      )}
    </div>
  );
}

// ---------- calm ----------
const PATTERNS = {
  box: { key: "pBox", phases: [{ l: "inhale", s: 4, sc: 1.22 }, { l: "hold", s: 4 }, { l: "exhale", s: 4, sc: 0.72 }, { l: "hold", s: 4 }] },
  relax: { key: "pRelax", phases: [{ l: "inhale", s: 4, sc: 1.22 }, { l: "hold", s: 7 }, { l: "exhale", s: 8, sc: 0.72 }] },
};

function CalmView({ data, update, t, onClose }) {
  const [patKey, setPatKey] = useState("box");
  const [minutes, setMinutes] = useState(5);
  const [run, setRun] = useState(null);      // { startedAt|null, acc, limit }
  const [opts, setOpts] = useState(false);
  const [, setTick] = useState(0);
  const phases = PATTERNS[patKey].phases;

  const { cycle, scales } = useMemo(() => {
    let last = 1;
    const sc = phases.map((p) => { if (p.sc !== undefined) last = p.sc; return last; });
    return { cycle: phases.reduce((a, p) => a + p.s, 0), scales: sc };
  }, [patKey]);

  const elapsedOf = (r) => (r ? r.acc + (r.startedAt ? (Date.now() - r.startedAt) / 1000 : 0) : 0);
  const save = (mins) => update((d) => { d.calm = d.calm || []; d.calm.push({ id: uid(), at: new Date().toISOString(), minutes: mins }); return d; });

  // Atsidaro tada, kai žmogus ką tik pajuto aurą — konfigūruoti nėra kada.
  // Pratimas prasideda pats; nustatymai lieka pasiekiami, bet netrukdo.
  useEffect(() => { setRun({ startedAt: Date.now(), acc: 0, limit: minutes * 60 }); }, []);

  useEffect(() => {
    if (!run || !run.startedAt) return;
    const iv = setInterval(() => {
      if (elapsedOf(run) >= run.limit) { save(Math.round(run.limit / 60)); setRun(null); }
      else setTick((x) => x + 1);
    }, 250);
    return () => clearInterval(iv);
  }, [run]);

  const elapsed = elapsedOf(run);
  let idx = 0, left = phases[0].s;
  if (run) {
    let pos = elapsed % cycle;
    for (let i = 0; i < phases.length; i++) {
      if (pos < phases[i].s) { idx = i; left = Math.ceil(phases[i].s - pos); break; }
      pos -= phases[i].s;
    }
  }
  const ph = run ? phases[idx] : null;
  const paused = run && !run.startedAt;
  const done = !run;
  const pct = run ? Math.min(1, elapsed / run.limit) : 1;

  const begin = (mins = minutes) => { setOpts(false); setRun({ startedAt: Date.now(), acc: 0, limit: mins * 60 }); };
  const finish = () => {
    if (run && elapsed >= 60) save(Math.round(elapsed / 60));
    setRun(null);
  };

  const R = 92, CIRC = 2 * Math.PI * R;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 8 }}>
      <div style={{ position: "relative", width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
        {/* eigos žiedas – be mirgėjimo, tik lėtas užsipildymas */}
        <svg width="220" height="220" style={{ position: "absolute", transform: "rotate(-90deg)" }} aria-hidden="true">
          {/* stroke per style, ne per atributą: SVG prezentaciniai atributai var() nepriima */}
          <circle cx="110" cy="110" r={R} fill="none" strokeWidth="2" style={{ stroke: C.line }} />
          <circle cx="110" cy="110" r={R} fill="none" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)}
            style={{ stroke: C.blue, transition: "stroke-dashoffset 300ms linear" }} />
        </svg>

        {/* kvėpavimo rutulys */}
        <div style={{
          width: 150, height: 150, borderRadius: "50%",
          background: `radial-gradient(circle at 38% 32%, ${C.white}, ${C.blueSoft} 62%)`,
          border: `1px solid ${C.blue}33`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
          transform: `scale(${run && !paused ? scales[idx] : 0.86})`,
          transition: `transform ${ph && !paused ? ph.s : 1}s ease-in-out`,
          opacity: paused ? 0.55 : 1,
        }}>
          <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 600, color: C.blue }}>
            {done ? t.prepare : paused ? t.paused : t[ph.l]}
          </div>
          {run && !paused && (
            <div style={{ fontFamily: T.serif, fontSize: 34, fontWeight: 700, lineHeight: 1, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{left}</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: C.sub, marginTop: 14, fontVariantNumeric: "tabular-nums" }}>
        {run ? `${t[PATTERNS[patKey].key]} · ${t.remaining(Math.max(0, Math.ceil((run.limit - elapsed) / 60)))}` : t.breatheNote}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, width: "100%", maxWidth: 300 }}>
        {run ? (
          <>
            <PrimaryBtn color={C.blue}
              onClick={() => setRun((r) => (r.startedAt ? { ...r, startedAt: null, acc: elapsedOf(r) } : { ...r, startedAt: Date.now() }))}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {paused ? <Play size={15} /> : <Pause size={15} />} {paused ? t.resume : t.pause}
              </span>
            </PrimaryBtn>
            <PrimaryBtn color={C.sub} onClick={finish}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Square size={14} /> {t.stop}</span>
            </PrimaryBtn>
          </>
        ) : (
          <>
            <PrimaryBtn color={C.blue} onClick={() => begin()}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Play size={15} /> {t.start}</span>
            </PrimaryBtn>
          </>
        )}
      </div>

      {/* nustatymai nepuola į akis: reikalingi retai, o pratimo metu – niekada */}
      {(done || paused) && (
        <button className="press" onClick={() => setOpts(!opts)}
          style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginTop: 14, padding: 6 }}>
          {t.change}
        </button>
      )}
      {opts && (done || paused) && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 4 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {Object.entries(PATTERNS).map(([k, p]) => (
              <Chip key={k} active={patKey === k} onClick={() => { setPatKey(k); setRun(null); }} color={C.blue} soft={C.blueSoft}>{t[p.key]}</Chip>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[2, 5, 10].map((n) => (
              <Chip key={n} active={minutes === n} onClick={() => { setMinutes(n); begin(n); }} color={C.blue} soft={C.blueSoft}>{n} min</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- daily state ----------
function DotScale({ value, onChange, label }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value >= n;
          const col = value >= 4 ? C.amber : C.sage;
          return (
            <button key={n} className="press" onClick={() => onChange(n)} aria-label={`${label} ${n}`}
              style={{ width: 40, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{
                width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${on ? col : C.line}`,
                background: on ? col : C.white, transition: "all 120ms ease",
              }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StateView({ data, update, t, lc }) {
  // ne tik šiandien: vakar pamiršta miego valanda iki šiol buvo neįrašoma niekada
  const [offset, setOffset] = useState(0);
  const day = addDays(new Date(), -offset);
  const tk = dkey(day);
  const today = { ...DAILY_EMPTY, ...(data.daily[tk] || {}) };
  const setField = (k, v) => update((d) => { d.daily[tk] = { ...DAILY_EMPTY, ...(d.daily[tk] || {}), [k]: v }; return d; });
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
  const WD = wdShort(lc);
  const stepBtn = { width: 44, height: 44, borderRadius: 10, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", background: C.white };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <button className="press" onClick={() => setOffset(offset + 1)} aria-label={t.prev} style={iconBtn}><ChevronLeft size={20} /></button>
        <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 600, textTransform: "capitalize" }}>
          {offset === 0 ? t.todayState : fDay(day, lc)}
        </div>
        <button className="press" onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} aria-label={t.next}
          style={{ ...iconBtn, color: offset === 0 ? C.line : C.sub }}><ChevronRight size={20} /></button>
      </div>
      <Card tour="stateCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{t.sleep}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="press" onClick={() => setField("sleep", Math.max(0, (today.sleep ?? 7) - 0.5))} aria-label={t.less} style={stepBtn}><Minus size={16} /></button>
            <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 600, minWidth: 56, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
              {today.sleep === null ? "—" : `${today.sleep} h`}
            </div>
            <button className="press" onClick={() => setField("sleep", Math.min(14, (today.sleep ?? 6.5) + 0.5))} aria-label={t.more} style={stepBtn}><Plus size={16} /></button>
          </div>
        </div>

        <DotScale label={t.stress} value={today.stress} onChange={(n) => setField("stress", n)} />
        <DotScale label={t.fatigue} value={today.fatigue} onChange={(n) => setField("fatigue", n)} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            {t.alcohol}
            {today.alcohol == null && <span style={{ fontSize: 12, color: C.sub, fontWeight: 400, display: "block" }}>{t.unanswered}</span>}
          </div>
          <Segmented ariaLabel={t.alcohol} value={today.alcohol} onChange={(v) => setField("alcohol", v)}
            color={C.amber} soft={C.amberSoft}
            options={[{ v: true, label: t.yes }, { v: false, label: t.no }]} />
        </div>

        <input style={inputStyle} placeholder={t.optNote} value={today.note} onChange={(e) => setField("note", e.target.value)} />
        <div style={{ fontSize: 12, color: C.sub }}>{t.autosave}</div>
      </Card>

      <SectionLabel>{t.sleep7}</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100 }}>
          {days.map((d) => {
            const e = data.daily[dkey(d)];
            const h = e?.sleep ?? null;
            const short = h !== null && h < 6;
            return (
              <div key={dkey(d)} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: short ? C.amber : C.sub, fontWeight: 600, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>{h === null ? "" : h}</div>
                <div style={{ height: h === null ? 4 : Math.max(8, (h / 12) * 64), borderRadius: 6, background: h === null ? C.line : short ? C.amber : C.sage, transition: "height 200ms ease" }} />
                <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{WD[d.getDay()]}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>{t.sleepHint}</div>
      </Card>
    </div>
  );
}

// ---------- report ----------
function buildReport(data, days, t) {
  const now = new Date();
  const since = addDays(now, -days);
  const cnt = (arr) => { const m = {}; arr.forEach((x) => { m[x] = (m[x] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const avg = (a) => (a.length ? Math.round((10 * a.reduce((x, y) => x + y, 0)) / a.length) / 10 : null);

  const seiz = data.seizures.filter((s) => new Date(s.at) >= since);
  const types = cnt(seiz.map((s) => lbl(t.ty, s.type)));
  const trigs = cnt(seiz.flatMap((s) => [...(s.triggers || []).map((x) => lbl(t.tg, x)), ...(s.triggerOther ? [s.triggerOther] : [])]));
  const effs = cnt(seiz.flatMap((s) => (s.effects || []).map((x) => lbl(t.ef, x))));
  const auraLabel = (id) => ((data.auraTypes || []).find((a) => a.id === id)?.label) || id;
  const auraKinds = cnt(seiz.flatMap((s) => (s.auraKinds || []).map(auraLabel)));
  const auraN = seiz.filter((s) => s.aura === true).length;
  const auraAns = seiz.filter((s) => s.aura === true || s.aura === false).length;
  const durMax = [...DURATIONS].reverse().find((d) => seiz.some((s) => s.dur === d)) || null;

  const ids = medIds(data);
  let taken = 0, scheduled = 0, adhDays = 0;
  for (let i = 0; i < days; i++) {
    const k = dkey(addDays(now, -i));
    const perDay = scheduledOn(data.meds, k);
    if (!perDay) continue;                 // tą dieną grafiko nežinom – neįtraukiam
    adhDays += 1;
    scheduled += perDay;
    taken += Math.min(takenOn(data, k, ids), perDay);
  }
  const adh = scheduled > 0 ? Math.round((100 * taken) / scheduled) : null;

  const dailies = [];
  for (let i = 0; i < days; i++) { const e = data.daily[dkey(addDays(now, -i))]; if (e) dailies.push(e); }

  /* Laisvas tekstas iki šiol niekur nekeliavo: rašyti buvo galima trijose
     vietose, o ataskaita neėmė nė vienos. Neurologui „prieš priepuolį dvi paras
     nemiegojau“ pasako daugiau nei bet kuris vidurkis, todėl pastabos eina į
     ataskaitą su data. Neapkarpom: tekstą parašė pats vartotojas, ir tyliai
     nutraukti medicininį pastebėjimą būtų blogiau nei ilga ataskaita. */
  const notes = [];
  for (let i = 0; i < days; i++) {
    const k = dkey(addDays(now, -i));
    const dn = (data.daily[k]?.note || "").trim();
    if (dn) notes.push({ k, text: dn });
    seiz.filter((s) => dkey(new Date(s.at)) === k && (s.note || "").trim())
      .forEach((s) => notes.push({ k, who: lbl(t.ty, s.type), text: s.note.trim() }));
  }
  const sleeps = dailies.filter((e) => e.sleep != null).map((e) => e.sleep);
  const sleepAvg = avg(sleeps);
  const shortN = sleeps.filter((h) => h < 6).length;
  const stressAvg = avg(dailies.filter((e) => e.stress != null).map((e) => e.stress));
  const fatAvg = avg(dailies.filter((e) => e.fatigue != null).map((e) => e.fatigue));
  const alcoN = dailies.filter((e) => e.alcohol === true).length;
  const alcoAns = dailies.filter((e) => e.alcohol === true || e.alcohol === false).length;

  const fmt = (arr) => arr.map(([k, v]) => `${k} ×${v}`).join(", ");
  const L = [];
  L.push(`${t.rTitle(days)} (${dkey(since)} – ${dkey(now)})`);
  if (data.settings?.name) L.push(`${t.rPatient}: ${data.settings.name}`);
  L.push("");
  L.push(`${t.rSeiz.toUpperCase()}: ${seiz.length}`);
  if (seiz.length) {
    L.push(`  ${t.rTypes}: ${fmt(types)}`);
    L.push(`  ${t.rAura}: ${auraN} / ${auraAns || seiz.length}` + (auraAns < seiz.length ? ` (${t.rAnswered(auraAns, seiz.length)})` : ""));
    if (durMax) L.push(`  ${t.rLongest}: ${durMax}`);
    if (auraKinds.length) L.push(`  ${t.rAuraKinds}: ${fmt(auraKinds)}`);
    if (effs.length) L.push(`  ${t.effects}: ${fmt(effs)}`);
    if (trigs.length) L.push(`  ${t.triggers}: ${fmt(trigs)}`);
  }
  L.push("");
  if (adh != null) {
    L.push(t.rAdhLine(adh, taken, scheduled) + ` (${t.rAdhDays(adhDays, days)})`);
    data.meds.forEach((m) => L.push(`  ${m.name}${m.dose ? " " + m.dose : ""} · ${m.times.join(", ")}`));
    L.push("");
  }
  if (sleepAvg != null) L.push(`${t.rSleep.toUpperCase()}: ${t.rSleepV(sleepAvg, shortN, sleeps.length)}`);
  if (stressAvg != null || fatAvg != null) L.push(`${t.rStressFat.toUpperCase()}: ${stressAvg ?? "—"} / ${fatAvg ?? "—"} ${t.rOf5}`);
  if (alcoAns) L.push(`${t.rAlco.toUpperCase()}: ${t.rDays(alcoN)}` + ` (${t.rAnswered(alcoAns, days)})`);
  if (notes.length) {
    L.push("");
    L.push(`${t.rNotes.toUpperCase()}:`);
    notes.forEach((n) => L.push(`  ${n.k}${n.who ? " · " + n.who : ""}: ${n.text.replace(/\n/g, " ")}`));
  }
  L.push("");
  L.push(t.rFooter);
  return { text: L.join("\n"), seiz, types, trigs, effs, auraN, auraAns, auraKinds, alcoAns, adhDays, durMax, adh, taken, scheduled, sleepAvg, shortN, sleepsN: sleeps.length, stressAvg, fatAvg, alcoN, notes };
}

function Stat({ label, value, color = C.ink }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 2px", borderBottom: `1px solid ${C.line}`, fontSize: 14 }}>
      <div style={{ color: C.sub, flexShrink: 0 }}>{label}</div>
      <div style={{ fontWeight: 600, color, textAlign: "right" }}>{value}</div>
    </div>
  );
}

function ReportSheet({ data, onClose, t }) {
  const [days, setDays] = useState(30);
  const [copied, setCopied] = useState(false);
  const r = useMemo(() => buildReport(data, days, t), [data, days, t]);
  const fmt = (arr) => arr.map(([k, v]) => `${k} ×${v}`).join(", ") || "—";
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.text); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch (e) { setCopied(false); }
  };
  return (
    <Sheet title={t.report} onClose={onClose} t={t}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[30, 90].map((n) => <Chip key={n} active={days === n} onClick={() => setDays(n)}>{t.rDays(n)}</Chip>)}
      </div>
      <Card style={{ padding: "4px 14px" }}>
        <Stat label={t.rSeiz} value={r.seiz.length} color={C.plum} />
        {r.seiz.length > 0 && <Stat label={t.rTypes} value={fmt(r.types)} />}
        {r.seiz.length > 0 && <Stat label={t.rAura} value={`${r.auraN} / ${r.auraAns || r.seiz.length}`} />}
        {r.auraKinds.length > 0 && <Stat label={t.rAuraKinds} value={fmt(r.auraKinds)} />}
        {r.durMax && <Stat label={t.rLongest} value={r.durMax} />}
        {r.effs.length > 0 && <Stat label={t.effects} value={fmt(r.effs)} />}
        {r.trigs.length > 0 && <Stat label={t.triggers} value={fmt(r.trigs)} />}
        {r.adh != null && <Stat label={t.rAdh} value={`~${r.adh}% · ${t.rAdhDays(r.adhDays, days)}`} color={r.adh >= 90 ? C.sage : C.amber} />}
        {r.sleepAvg != null && <Stat label={t.rSleep} value={t.rSleepV(r.sleepAvg, r.shortN, r.sleepsN)} />}
        {(r.stressAvg != null || r.fatAvg != null) && <Stat label={t.rStressFat} value={`${r.stressAvg ?? "—"} / ${r.fatAvg ?? "—"} ${t.rOf5}`} />}
        {r.alcoAns > 0 && <Stat label={t.rAlco} value={`${t.rDays(r.alcoN)} · ${t.rAnswered(r.alcoAns, days)}`} />}
      </Card>
      {r.notes.length > 0 && (
        <>
          <SectionLabel>{t.rNotes}</SectionLabel>
          <Card style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {r.notes.map((n, i) => (
              <div key={i} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <span style={{ color: C.sub, fontWeight: 600 }}>{n.k}{n.who ? ` · ${n.who}` : ""}</span>
                <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
              </div>
            ))}
          </Card>
        </>
      )}
      <PrimaryBtn onClick={copy} style={{ marginTop: 14 }}>{copied ? t.copied : t.copyText}</PrimaryBtn>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 10, lineHeight: 1.5 }}>{t.rNote}</div>
    </Sheet>
  );
}

/**
 * Vienkartinis paprašymas parašyti. Kortelė, ne modalas — nestabdo darbo.
 * Nerodoma iškart po priepuolio ar auros įrašo: tokiu momentu žmogui ne iki to.
 */
function FeedbackCard({ t, onWrite, onDismiss }) {
  return (
    <Card style={{ marginTop: 14, borderLeft: `4px solid ${C.clay}` }}>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: C.ink }}>{t.fbCardText}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <PrimaryBtn onClick={onWrite}>{t.fbCardYes}</PrimaryBtn>
        <button className="press" onClick={onDismiss}
          style={{ padding: "13px 18px", borderRadius: 12, fontSize: 15, fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>
          {t.fbCardNo}
        </button>
      </div>
    </Card>
  );
}

// ---------- seizure timer ----------
/**
 * Trukmė matuojama, o ne įvedama ranka. Praėjęs laikas visada skaičiuojamas iš
 * sieninio laikrodžio, todėl programėlės užvėrimas ar nužudymas jo nesugadina.
 */
function SeizureTimer({ timer, t, onEnd, onDiscard, onConfirmStale }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(iv);
  }, []);

  const sec = elapsedSec(timer.startedAt);
  const stale = isStale(timer.startedAt);
  const alert = !stale && sec >= ALERT_SEC;

  // Laikmatis, veikiantis daugiau nei valandą, beveik visada reiškia pamirštą sustabdymą.
  // Rodyti tokį skaičių kaip faktą būtų klaidinga — klausiam.
  if (stale) {
    return (
      <Card style={{ marginTop: 14, borderLeft: `4px solid ${C.amber}`, background: C.amberSoft }}>
        <div style={{ fontFamily: T.serif, fontSize: 17, fontWeight: 600 }}>{t.seizStale}</div>
        <div style={{ fontSize: 13, color: C.ink, marginTop: 6, lineHeight: 1.5 }}>{t.seizStaleNote}</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>
          {t.startedAt}: {new Date(timer.startedAt).toLocaleString()}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <PrimaryBtn color={C.plum} onClick={onConfirmStale}>{t.seizStaleYes}</PrimaryBtn>
          <PrimaryBtn color={C.sub} onClick={onDiscard}>{t.seizStaleDiscard}</PrimaryBtn>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{
      marginTop: 14, textAlign: "center",
      borderColor: alert ? C.red : C.plum, borderWidth: 2,
      background: alert ? C.redSoft : C.card,
      // 600 ms perėjimas, o ne staigus perjungimas: perėjimas į raudoną yra rizikos veiksnys
      transition: "background-color 600ms ease, border-color 600ms ease",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: alert ? C.red : C.plum, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {t.seizRunning}
      </div>
      <div style={{ fontFamily: T.serif, fontSize: 54, fontWeight: 700, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: "tabular-nums", color: alert ? C.red : C.ink }}>
        {fmtDuration(sec)}
      </div>
      {alert && (
        <div style={{
          marginTop: 10, padding: "12px 14px", borderRadius: 10,
          background: C.white, border: `2px solid ${C.red}`, color: C.red,
          display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left",
        }}>
          <AlertTriangle size={20} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.4 }}>{t.seizAlert}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{t.seizAlertNote}</div>
          </div>
        </div>
      )}
      <PrimaryBtn color={alert ? C.red : C.plum} onClick={onEnd} style={{ marginTop: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Square size={16} /> {t.seizEnd}</span>
      </PrimaryBtn>
    </Card>
  );
}

// ---------- pirmas paleidimas ----------
/**
 * Vietinis nustatymas, ne registracija: paskyros nėra ir nebus — sveikatos
 * duomenys pagal BDAR 9 str. paverstų autorių duomenų valdytoju.
 *
 * Kalba pirmiausia ir veikia iškart: be to visas pirmasis įspūdis ir apžvalga
 * būtų lietuviški nepriklausomai nuo to, kas telefoną laiko rankose.
 *
 * Vienas ekranas, ne trijų žingsnių vedlys. Visi laukai neprivalomi, tad
 * skaidyti juos į žingsnius reikštų tris paspaudimus ten, kur užtenka vieno.
 */
function SetupSheet({ t, lang, name, notify, perm, onLang, onName, onNotify, onDone }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 130, background: C.bg, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "calc(34px + env(safe-area-inset-top)) 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AuraMark size={40} />
          <div>
            <div style={{ fontFamily: T.serif, fontSize: 30, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em" }}>Aura</div>
            <div style={{ fontSize: 12.5, color: C.sub }}>{t.tagline}</div>
          </div>
        </div>
        <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, marginTop: 16 }}>{t.setupIntro}</div>

        <SectionLabel>{t.language}</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LANGS.map((l) => (
            <Chip key={l.id} active={lang === l.id} onClick={() => onLang(l.id)}>{l.name}</Chip>
          ))}
        </div>

        <SectionLabel>{t.setupName}</SectionLabel>
        <input style={inputStyle} placeholder={t.namePh} value={name}
          onChange={(e) => onName(e.target.value)} />
        <div style={{ fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>{t.setupNameHint}</div>

        <SectionLabel>{t.setupNotify}</SectionLabel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>{t.setupNotifyDesc}</div>
          <Segmented ariaLabel={t.setupNotify} value={notify && perm === "granted"}
            onChange={onNotify} color={C.sage} soft={C.sageSoft}
            options={[{ v: true, label: t.n.on }, { v: false, label: t.n.off }]} />
        </div>

        <PrimaryBtn onClick={onDone} style={{ marginTop: 28 }}>{t.setupStart}</PrimaryBtn>
        <div style={{ fontSize: 12, color: C.sub, textAlign: "center", marginTop: 14, lineHeight: 1.55 }}>
          {t.setupLocal}
        </div>
      </div>
    </div>
  );
}

// ---------- pirmo paleidimo apžvalga ----------
/**
 * Pirmo paleidimo apžvalga. Kiekvienas žingsnis – viena eilutė; ilgesnio teksto
 * ką tik atsidaręs žmogus neskaito.
 *
 * `tab` perjungia skirtuką prieš apvedant. Skirtukų mygtukai juostoje yra visada,
 * tad techniškai perjungti nebūtina — bet be to žmogus matytų tik apvestą ikoną
 * ir nė karto to ekrano, apie kurį kalbama.
 */
/**
 * Apžvalga eina per VISUS skirtukus ir kiekviename apveda tikrą turinį, o ne
 * apatinės juostos piktogramą. Anksčiau Kalendorius ir Būsena tebuvo apvesta
 * navigacijoje — vartotojas pamatydavo, kur paspausti, bet ne ką ten ras.
 *
 * Tvarka seka skirtukų tvarką ekrane, pradedant nuo pradinio (Priepuoliai).
 * Raktai vardiniai, ne numeruoti: perstačius žingsnį numeriai imdavo meluoti.
 */
const TOUR_STEPS = (t) => [
  { el: "nav", text: t.tourNav, tab: "seizures" },
  { el: "seiz", text: t.tourTimer, tab: "seizures" },
  { el: "aura", text: t.tourAura, tab: "seizures" },
  { el: "regSeiz", text: t.tourLog, tab: "seizures" },
  { el: "addMed", text: t.tourMeds, tab: "meds" },
  { el: "calGrid", text: t.tourCal, tab: "calendar" },
  { el: "stateCard", text: t.tourState, tab: "state" },
  { el: "report", text: t.tourReport, tab: "meds" },
];

/**
 * Apveda tikrą sąsajos elementą, o ne piešia jo kopiją: kopija pasentų pakeitus
 * maketą, o kontūras visada rodo tai, kas tikrai yra ekrane.
 *
 * Fotosensityvumas: jokio mirksėjimo. Fonas pritemsta vieną kartą per 600 ms ir
 * toliau nebejuda — net keičiantis žingsniui. Todėl `rect` niekada nevalomas:
 * nuvalius, komponentas grąžintų null, visas ekranas trumpam prašviesėtų ir vėl
 * aptemtų. Toks šviesumo šuolis kas žingsnį yra būtent tai, ko čia vengiam.
 * Vietoj to žiedas per 500 ms nuslenka į naują vietą.
 */
function Spotlight({ target, label, hint, onClose, t, step, total, onNext, onSkip }) {
  const [rect, setRect] = useState(null);
  const tour = typeof onNext === "function";

  useEffect(() => {
    let alive = true;
    // elementas gali dar nebūti perpieštas po skirtuko perjungimo – palaukiam kelis kadrus
    const find = (tries = 0) => {
      if (!alive) return;
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el) { if (tries < 12) setTimeout(() => find(tries + 1), 60); else onClose(); return; }
      const box = el.getBoundingClientRect();
      // jau matomo elemento neslinkinėjam — tada ir matuoti galima beveik iškart.
      // Sąmoningai setTimeout, o ne requestAnimationFrame: fone (arba kai langas
      // nepiešiamas) rAF nesuveikia visai, ir apvedimas liktų nematomas.
      if (box.top >= 0 && box.bottom <= window.innerHeight) {
        setTimeout(() => { if (alive) setRect(el.getBoundingClientRect()); }, 30);
      } else {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => { if (alive) setRect(el.getBoundingClientRect()); }, 420);
      }
    };
    find();
    return () => { alive = false; };
  }, [target]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!rect) return null;
  const pad = 6;
  const below = rect.bottom + 130 < window.innerHeight;

  return (
    // apžvalgoje fonas neuždaro: žingsnius baigia tik mygtukai, kad netyčinis
    // palietimas nenutrauktų vidury. Gide atvirkščiai – palietus uždaroma.
    //
    // Animacija be `both` sąmoningai: su fill-mode neįvykusi animacija (fonas,
    // webview, sustabdytas piešimas) paliktų opacity 0 ir apvedimo nesimatytų
    // visai. Geriau pasirodyti iškart, nei dingti.
    <div onClick={tour ? undefined : onClose} role="dialog" aria-label={label || hint}
      style={{ position: "fixed", inset: 0, zIndex: 120, animation: "tourIn 600ms ease" }}>
      {/* skylė iškertama ne fonu, o milžinišku šešėliu aplink kontūrą */}
      <div style={{
        position: "absolute", left: rect.left - pad, top: rect.top - pad,
        width: rect.width + pad * 2, height: rect.height + pad * 2,
        // tikras baltas, ne C.white: žiedas visada gula ant pritemdyto fono
        borderRadius: 14, border: "2px solid #FFFFFF", pointerEvents: "none",
        boxShadow: "0 0 0 9999px rgba(27, 42, 49, 0.62)",
        transition: "left 500ms ease, top 500ms ease, width 500ms ease, height 500ms ease",
      }} />
      <div style={{
        position: "absolute", left: 16, right: 16, maxWidth: 448, margin: "0 auto",
        top: below ? rect.bottom + pad + 14 : undefined,
        bottom: below ? undefined : window.innerHeight - rect.top + pad + 14,
        background: C.card, borderRadius: 14, padding: "14px 16px",
        boxShadow: "0 8px 28px rgba(27, 42, 49, 0.28)",
      }}>
        {label && <div style={{ fontFamily: T.serif, fontSize: 15.5, fontWeight: 600, color: C.ink }}>{label}</div>}
        <div style={{ fontSize: label ? 12.5 : 14, color: label ? C.sub : C.ink,
                      marginTop: label ? 6 : 0, lineHeight: 1.5 }}>{hint}</div>
        {tour && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
            <button className="press" onClick={onSkip}
              style={{ minHeight: 44, paddingRight: 8, fontSize: 13, color: C.sub }}>{t.tourSkip}</button>
            <div style={{ fontSize: 12, color: C.sub, letterSpacing: "0.02em" }}>{step}/{total}</div>
            <button className="press" onClick={onNext}
              style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, background: C.clay,
                       color: C.onAccent, fontSize: 14, fontWeight: 600 }}>
              {step === total ? t.tourDone : t.tourNext}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Vienintelis likęs tekstinis pagalbos puslapis.
 *
 * Bendrasis gidas pašalintas sąmoningai: aprašomojo teksto niekas neskaito, o
 * programėlę parodo pirmo paleidimo apžvalga. Šis skyrius liko todėl, kad jis
 * kitoks – jį atsiverčia tik tas, kuriam priminimai jau neveikia, ir be jo
 * Xiaomi vartotojas neturi jokio būdo sužinoti, kad kaltas telefonas.
 *
 * pre-line: turinys yra žingsnių sąrašas, ne pastraipa.
 */
function NotifHelpSheet({ t, onClose }) {
  return (
    <Sheet title={t.gNotif} onClose={onClose} t={t}>
      <div style={{ fontSize: 13.5, lineHeight: 1.65, color: C.ink, whiteSpace: "pre-line" }}>{t.gNotifB}</div>
    </Sheet>
  );
}

// ---------- backup ----------
function BackupSheet({ t, onClose, onRestored }) {
  const [state, setState] = useState("idle");   // idle | checking | found | done | error
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState("");

  const errText = { parse: t.bkErrParse, shape: t.bkErrShape, newer: t.bkErrNewer, empty: t.bkErrEmpty };

  const pick = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      setState("checking"); setErr(null);
      const rd = new FileReader();
      rd.onload = () => {
        const v = validateBackup(String(rd.result));
        if (!v.ok) { setErr(v.code); setState("error"); return; }
        setInfo(v); setState("found");
      };
      rd.onerror = () => { setErr("parse"); setState("error"); };
      rd.readAsText(f);
    };
    inp.click();
  };

  return (
    <Sheet title={t.backup} onClose={onClose} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PrimaryBtn onClick={async () => {
          try { const r = await exportBackup(); setMsg(r.ok ? `${t.bkDone} · ${r.name}` : t.bkFail); }
          catch (e) { setMsg(t.bkFail); }
        }}>{t.bkMake}</PrimaryBtn>
        {msg && <div style={{ fontSize: 13, color: C.sage, fontWeight: 600, wordBreak: "break-all" }}>{msg}</div>}
        <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>{t.bkHint}</div>

        <div style={{ height: 1, background: C.line, margin: "6px 0" }} />

        {state === "done" ? (
          <div style={{ fontSize: 14, fontWeight: 600, color: C.sage }}>{t.bkOk}</div>
        ) : state === "found" ? (
          <>
            <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 600 }}>{t.bkFound}</div>
            {info.exportedAt && (
              <div style={{ fontSize: 12.5, color: C.sub }}>{t.bkFrom}: {new Date(info.exportedAt).toLocaleString()}</div>
            )}
            <div style={{ fontSize: 13 }}>
              {t.bkWill}: {info.counts.seizures} {t.tSeiz.toLowerCase()} · {info.counts.meds} {t.tMeds.toLowerCase()} · {info.counts.notes} {t.tNotes.toLowerCase()}
            </div>
            <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.5 }}>
              {t.bkWarn}
            </div>
            <PrimaryBtn color={C.red} onClick={async () => {
              try { await restoreBackup(info.payload); setState("done"); onRestored(); }
              catch (e) { setErr("shape"); setState("error"); }
            }}>{t.bkConfirm}</PrimaryBtn>
          </>
        ) : (
          <>
            <PrimaryBtn color={C.ink} onClick={pick}>
              {state === "checking" ? t.bkChecking : t.bkRestore}
            </PrimaryBtn>
            {state === "error" && (
              <div style={{ fontSize: 13, color: C.red, fontWeight: 600, lineHeight: 1.5 }}>{errText[err] || t.bkErrShape}</div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------- feedback ----------
function FeedbackSheet({ data, t, onClose }) {
  const [kind, setKind] = useState("bug");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);

  const kinds = [{ v: "bug", label: t.fbBug }, { v: "idea", label: t.fbIdea }, { v: "other", label: t.fbOther }];
  const env = [`Aura ${APP_VERSION}`, isNative() ? "app" : "web", navigator.platform || "?",
               `lang=${data.settings?.lang || "lt"}`].join(" · ");
  const subject = `${t.fbSubj}: ${kinds.find((k) => k.v === kind).label}`;
  const full = `${text.trim()}\n\n---\n${env}`;

  return (
    <Sheet title={t.fbLabel} onClose={onClose} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {kinds.map((k) => <Chip key={k.v} active={kind === k.v} onClick={() => setKind(k.v)}>{k.label}</Chip>)}
        </div>

        <textarea autoFocus style={{ ...inputStyle, minHeight: 150, resize: "vertical", lineHeight: 1.55 }}
          placeholder={t.fbPh} value={text} onChange={(e) => setText(e.target.value)} />

        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.fbAttach}</div>
          <div style={{ fontSize: 12.5, color: C.ink, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{env}</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>{t.fbNote}</div>
        </div>

        <PrimaryBtn disabled={!text.trim()} onClick={() => {
          window.open(`mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(full)}`, "_blank");
          setOpened(true);
        }}>{text.trim() ? t.fbSend : t.fbNoText}</PrimaryBtn>

        {opened && (
          <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>
            {t.fbSent}. {t.fbFallback} <b style={{ color: C.ink }}>{FEEDBACK_TO}</b>
          </div>
        )}

        <button onClick={async () => {
          try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 2500); }
          catch (e) { setCopied(false); }
        }} disabled={!text.trim()} style={{ fontSize: 14, fontWeight: 600, color: text.trim() ? C.clay : C.line, padding: 8 }}>
          {copied ? t.copied : t.fbCopy}
        </button>
      </div>
    </Sheet>
  );
}

// ---------- settings ----------
function SettingsSheet({ data, update, onReset, onClose, onFeedback, onBackup, onNotifHelp, onReplayTour, t }) {
  const s = { name: "", overdueMin: 60, lang: "lt", notify: true, backupRemind: true, ...(data.settings || {}) };
  const setS = (k, v) => update((d) => { d.settings = { name: "", overdueMin: 60, lang: "lt", notify: true, backupRemind: true, ...(d.settings || {}), [k]: v }; return d; });
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const [perm, setPerm] = useState("prompt");
  const [pend, setPend] = useState(null);
  useEffect(() => { permissionState().then(setPerm); pendingCount().then(setPend); }, []);
  useEffect(() => {
    if (!armed) return;
    const x = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(x);
  }, [armed]);
  const exportJson = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch (e) { setCopied(false); }
  };
  const toggleNotify = async () => {
    if (!s.notify && perm !== "granted") {
      const ok = await requestPermission();
      setPerm(ok ? "granted" : "denied");
      if (!ok) return;
    }
    setS("notify", !s.notify);
  };
  return (
    <Sheet title={t.settings} onClose={onClose} t={t}>
      <PrimaryBtn color={C.ink} onClick={onReplayTour}>{t.replayTour}</PrimaryBtn>

      <SectionLabel>{t.language}</SectionLabel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {LANGS.map((l) => <Chip key={l.id} active={s.lang === l.id} onClick={() => setS("lang", l.id)}>{l.name}</Chip>)}
      </div>

      <SectionLabel>{t.theme}</SectionLabel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["auto", t.thAuto], ["light", t.thLight], ["dark", t.thDark]].map(([id, label]) => (
          <Chip key={id} active={(s.theme || "auto") === id} onClick={() => setS("theme", id)}>{label}</Chip>
        ))}
      </div>

      <SectionLabel>{t.n.label}</SectionLabel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>{t.n.desc}</div>
        <Segmented ariaLabel={t.n.label} value={s.notify && perm === "granted"}
          onChange={(v) => { if (v !== (s.notify && perm === "granted")) toggleNotify(); }}
          color={C.sage} soft={C.sageSoft}
          options={[{ v: true, label: t.n.on }, { v: false, label: t.n.off }]} />
      </div>
      {!isNative() && <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>{t.n.webOnly}</div>}
      {isNative() && perm === "denied" && <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>{t.n.denied}</div>}
      {isNative() && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 13 }}>
            <div style={{ color: C.sub }}>
              {t.n.diag}: <b style={{ color: pend === 0 ? C.amber : C.ink }}>{pend === null ? "—" : pend === 0 ? t.n.diagNone : pend}</b>
            </div>
            <Chip active={false} onClick={async () => setPend(await pendingCount())}>{t.n.diagRun}</Chip>
          </div>
          {/* žmogus čia atsiduria būtent tada, kai priminimai neveikia — gido skyrius
              apie gamintojo energijos taupymą turi būti po ranka, o ne slėptis gido gale */}
          <button className="press" onClick={onNotifHelp}
            style={{ marginTop: 8, fontSize: 12.5, color: C.clayDark, textDecoration: "underline", textAlign: "left" }}>
            {t.n.diagHelp}
          </button>
        </>
      )}

      <SectionLabel>{t.bed}</SectionLabel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>{t.bedDesc}</div>
        <Segmented ariaLabel={t.bed} value={s.bedOn === true}
          onChange={(v) => setS("bedOn", v)}
          color={C.sage} soft={C.sageSoft}
          options={[{ v: true, label: t.n.on }, { v: false, label: t.n.off }]} />
      </div>
      {s.bedOn === true && (
        <input type="time" value={s.bedtime || "22:30"} onChange={(e) => setS("bedtime", e.target.value)}
          aria-label={t.bed} style={{ ...inputStyle, marginTop: 10, maxWidth: 160 }} />
      )}

      <SectionLabel>{t.profile}</SectionLabel>
      <input style={inputStyle} placeholder={t.namePh} value={s.name} onChange={(e) => setS("name", e.target.value)} />

      <SectionLabel>{t.tMeds}</SectionLabel>
      <div style={{ fontSize: 14, marginBottom: 8 }}>{t.overdueAfter}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {[30, 60, 120].map((n) => <Chip key={n} active={s.overdueMin === n} onClick={() => setS("overdueMin", n)}>{n} min</Chip>)}
      </div>

      <SectionLabel>{t.data}</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <PrimaryBtn color={C.ink} onClick={exportJson}>{copied ? t.copied : t.exportJson}</PrimaryBtn>
        {!armed ? (
          <button onClick={() => setArmed(true)} style={{ color: C.red, fontWeight: 600, fontSize: 14, padding: 10 }}>{t.deleteAll}</button>
        ) : (
          <PrimaryBtn color={C.red} onClick={() => { onReset(); onClose(); }}>{t.confirmAll}</PrimaryBtn>
        )}
      </div>

      <SectionLabel>{t.backup}</SectionLabel>
      <PrimaryBtn onClick={onBackup}>{t.backup}</PrimaryBtn>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10 }}>
        <div style={{ fontSize: 14 }}>{t.bkRemind}</div>
        <Segmented ariaLabel={t.bkRemind} value={s.backupRemind !== false} onChange={(v) => setS("backupRemind", v)}
          color={C.sage} soft={C.sageSoft} options={[{ v: true, label: t.n.on }, { v: false, label: t.n.off }]} />
      </div>

      <SectionLabel>{t.fbLabel}</SectionLabel>
      <PrimaryBtn color={C.ink} onClick={onFeedback}>{t.fbBtn}</PrimaryBtn>

      <SectionLabel>{t.about}</SectionLabel>
      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{t.aboutText}</div>
    </Sheet>
  );
}

// ---------- wellbeing ----------
function BreatheSheet({ data, update, t, onClose }) {
  return (
    <Sheet title={t.breathe} onClose={onClose} t={t}>
      <CalmView data={data} update={update} t={t} onClose={onClose} />
    </Sheet>
  );
}

// ---------- app shell ----------
// Priepuoliai pirmi: vaistų dozę pažymėti galima ir iš pranešimo, o priepuolį
// registruoti reikia čia ir dažnai skubiai.
const HOME_TAB = "seizures";
const TABS = [
  { id: "seizures", key: "tSeiz", icon: Zap },
  { id: "meds", key: "tMeds", icon: Pill },
  { id: "calendar", key: "tCal", icon: CalendarDays },
  { id: "state", key: "segState", icon: Activity },
];

export default function App() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [tab, setTab] = useState(HOME_TAB);
  const [showReport, setShowReport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showNotifHelp, setShowNotifHelp] = useState(false);
  const [timer, setTimer] = useState(null);        // { startedAt }
  const [measured, setMeasured] = useState(null);  // { startedAt, durSec } -> į formą
  const [showBreathe, setShowBreathe] = useState(false);
  const [auraMsg, setAuraMsg] = useState(false);
  // Sesijos žyma: ar šiame paleidime jau buvo įrašytas priepuolis/aura.
  // Jei taip – atsiliepimo kortelė laukia kito paleidimo.
  const savedThisSession = useRef(false);

  // pirmo paleidimo apžvalga: -1 = neaktyvi
  const [tourStep, setTourStep] = useState(-1);
  // pirmo paleidimo nustatymas (kalba, vardas, priminimai)
  const [showSetup, setShowSetup] = useState(false);
  const [setupPerm, setSetupPerm] = useState("prompt");
  useEffect(() => { permissionState().then(setSetupPerm); }, [showSetup]);

  // veikiantis laikmatis atkuriamas iš Preferences, ne iš atminties:
  // programėlė galėjo būti nužudyta priepuolio metu
  useEffect(() => { loadTimer().then(setTimer); }, []);
  const [quickLog, setQuickLog] = useState(0);

  useEffect(() => {
    initStatusBar();
    (async () => {
      try {
        const p = await loadData();
        if (p) setData(hydrate(p));
      } catch (e) { /* dar nėra įrašų */ }
      setLoaded(true);
      hideSplash();
    })();
  }, []);

  const saveTimer = useRef(null);
  const pending = useRef(null);

  const flush = async () => {
    const payload = pending.current;
    if (payload === null) return;
    pending.current = null;
    try { setStorageOk(await saveData(payload)); }
    catch (e) { setStorageOk(false); }
  };

  // rašom ne dažniau kaip kartą per 700 ms — kitaip kiekvienas klaviatūros paspaudimas siųstų užklausą
  const persist = (next) => {
    pending.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 700);
  };

  // neprarandam neįrašytų pakeitimų uždarant ar minimizuojant
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush();
    };
  }, []);

  const update = (fn) => {
    setData((prev) => {
      const next = fn(clone(prev));
      persist(next);
      return next;
    });
  };

  const resetAll = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pending.current = null;
    try { await clearData(); } catch (e) { /* raktas galėjo neegzistuoti */ }
    setData(DEFAULT_DATA);
  };

  // „atgal“: pirma uždarom atidarytą lapą, tada grįžtam į pradinį skirtuką, ir tik tada išeinam
  useEffect(() => onBackButton(() => {
    if (tourStep >= 0) endTour();
    else if (showSettings) setShowSettings(false);
    else if (showReport) setShowReport(false);
    else if (tab !== HOME_TAB) setTab(HOME_TAB);
    else exitApp();
  }), [tourStep, showSettings, showReport, tab]);

  // grįžus iš fono perpiešiam — kitaip po vidurnakčio rodytų vakarykštę dieną
  const [dayTick, bumpDay] = useState(0);
  useEffect(() => onResume(() => { bumpDay((x) => x + 1); loadTimer().then(setTimer); }), []);

  const lang = data.settings?.lang || "lt";
  const t = useMemo(() => ({ ...(STR[lang] || STR.lt), n: NOTIF[lang] || NOTIF.lt }), [lang]);
  const lc = localeOf(lang);

  // priminimai perplanuojami pasikeitus vaistams, kalbai ar jungikliui,
  // ir papildomi kiekvieną grįžimą iš fono — tvarkaraštis siekia 14 d. į priekį
  const medSig = JSON.stringify(data.meds.map((m) => [m.id, m.name, m.dose, m.times]));
  const notify = data.settings?.notify !== false;
  useEffect(() => {
    if (!loaded) return;
    Promise.all([initChannel(t), initActions(t)])
      .then(() => syncMedReminders(data.meds, data.doseLog, t, notify));
  }, [loaded, medSig, lang, notify, dayTick]);

  // „Išgėriau“ paspaudus pačiame pranešime.
  //
  // Registruojam tik po `loaded`: paleidžiant programėlę iš pranešimo įvykis
  // pristatomas, kai atsiranda klausytojas, o `loadData()` yra asinchroninis.
  // Anksti pažymėta dozė būtų perrašyta įkeltais duomenimis ir tyliai dingtų.
  useEffect(() => {
    if (!loaded) return;
    return onDoseAction(({ medId, time, dk }) => {
      update((d) => {
        const day = { ...(d.doseLog[dk] || {}) };
        const k = `${medId}@${time}`;
        if (!day[k]) day[k] = new Date().toISOString();
        d.doseLog[dk] = day;
        return d;
      });
      cancelDose(medId, time, dk);   // nutildom šios dozės pakartojimą po 30 min
    });
  }, [loaded]);

  // 4.1: skaičiuojam paleidimus – po vieną kartą kiekvienam
  const counted = useRef(false);
  useEffect(() => {
    if (!loaded || counted.current) return;
    counted.current = true;
    update((d) => { d.settings = { ...d.settings, opens: (d.settings?.opens || 0) + 1 }; return d; });
  }, [loaded]);

  const entries = data.seizures.length + (data.auraEvents || []).length;
  const showFbCard = loaded
    && data.settings?.fbCard === "pending"
    && (data.settings?.opens || 0) >= 3
    && entries >= 1
    && !savedThisSession.current;      // 4.2: ne iškart po įrašo

  const closeFbCard = () => update((d) => { d.settings = { ...d.settings, fbCard: "done" }; return d; });
  const fbCard = showFbCard ? (
    <FeedbackCard t={t} onDismiss={closeFbCard}
      onWrite={() => { closeFbCard(); setShowFeedback(true); }} />
  ) : null;

  /**
   * Apžvalga rodoma tik tikrai tuščiam dienynui. Kas jau turi įrašų — vaistų,
   * priepuolių ar užrašų — programėlę jau moka, ir po atnaujinimo gauti apžvalgą
   * būtų erzinantis žingsnis atgal. Tokiems ji tyliai pažymima kaip peržiūrėta.
   */
  const tourInit = useRef(false);
  useEffect(() => {
    if (!loaded || tourInit.current) return;
    tourInit.current = true;
    if (data.settings?.tour === "done") return;
    const hasData = data.meds.length || data.seizures.length || Object.keys(data.daily).length;
    // jau naudojančiam programėlę ir nustatymas, ir apžvalga būtų žingsnis atgal
    if (hasData) {
      update((d) => { d.settings = { ...d.settings, tour: "done", setup: "done" }; return d; });
      return;
    }
    // tuščiam dienynui pirma nustatymas; apžvalgą paleis jis pats, kai baigsis
    if (data.settings?.setup !== "done") { setShowSetup(true); return; }
    setTab(HOME_TAB);
    setTourStep(0);
  }, [loaded]);

  const finishSetup = () => {
    setShowSetup(false);
    update((d) => { d.settings = { ...d.settings, setup: "done" }; return d; });
    setTab(HOME_TAB);
    setTourStep(0);
  };

  const tourSteps = useMemo(() => TOUR_STEPS(t), [t]);

  // skirtukas perjungiamas efekte, ne piešiant – setTab piešimo metu būtų šalutinis
  // efektas rendere ir React 18 concurrent režime elgtųsi nenuspėjamai
  useEffect(() => {
    if (tourStep < 0) return;
    const s = tourSteps[tourStep];
    if (s?.tab) setTab(s.tab);
  }, [tourStep]);

  const endTour = () => {
    setTourStep(-1);
    setTab(HOME_TAB);   // apžvalga baigiasi ties ataskaita – grąžinam į pradžią
    update((d) => { d.settings = { ...d.settings, tour: "done" }; return d; });
  };

  /**
   * Tema: atributas ant <html> perjungia CSS kintamuosius, o native pusė gauna
   * tikrą HEX — status bar ir theme-color var() nesupranta.
   *
   * „auto“ atveju klausiam sistemos ir persipiešiam, jei vartotojas pakeičia
   * telefono temą programėlei veikiant.
   */
  const theme = data.settings?.theme || "auto";
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "auto" && mq.matches);
      const p = dark ? PALETTE.dark : PALETTE.light;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", p.bg);
      setNativeTheme(p.bg, dark);
    };
    apply();
    if (theme !== "auto") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const backupRemind = data.settings?.backupRemind !== false;
  useEffect(() => {
    if (!loaded) return;
    syncBackupReminder(t, notify && backupRemind);
  }, [loaded, lang, notify, backupRemind]);

  // Miego priminimas: numatytai išjungtas. Laikas yra vartotojo sprendimas, todėl
  // pats savaime niekas neįsijungia – programėlė nesiūlo, kada eiti miegoti.
  const bedOn = data.settings?.bedOn === true;
  const bedtime = data.settings?.bedtime || "22:30";
  useEffect(() => {
    if (!loaded) return;
    syncBedtimeReminder(t, notify && bedOn, bedtime);
  }, [loaded, lang, notify, bedOn, bedtime, dayTick]);

  // 3.2: aura fiksuojama su laiko žyma IR iškart atidaromas kvėpavimo pratimas
  const logAura = () => {
    update((d) => { d.auraEvents = [...(d.auraEvents || []), { id: uid(), at: Date.now() }]; return d; });
    savedThisSession.current = true;
    setAuraMsg(true);
    setShowBreathe(true);
    setTimeout(() => setAuraMsg(false), 4000);
  };

  // 3.3: paskutinė aura per AURA_LINK_MIN, dar nepriskirta jokiam priepuoliui
  const recentAura = useMemo(() => {
    const used = new Set(data.seizures.map((x) => x.auraEventId).filter(Boolean));
    return [...(data.auraEvents || [])]
      .filter((a) => !used.has(a.id) && Date.now() - a.at <= AURA_LINK_MIN * 60000)
      .sort((a, b) => b.at - a.at)[0] || null;
  }, [data.auraEvents, data.seizures]);

  const beginSeizure = async () => {
    const at = await startTimer();
    setTimer({ startedAt: at });
    setTab("seizures");
  };

  const endSeizure = async (endedAt = Date.now()) => {
    if (!timer) return;
    const durSec = elapsedSec(timer.startedAt, endedAt);
    await clearTimer();
    setTimer(null);
    setMeasured({ startedAt: timer.startedAt, durSec });
    setTab("seizures");
  };

  const View = { meds: MedsView, seizures: SeizuresView, calendar: CalendarView, state: StateView }[tab];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: T.body, display: "flex", justifyContent: "center" }}>
      <style>{GLOBAL_CSS}</style>
      {/* flex stulpelis, kad atsakomybės tekstas gulėtų ekrano apačioje, o ne kabėtų
          iškart po turiniu: tuščiuose skirtukuose tarp jo ir juostos likdavo didelė properša */}
      <div style={{ width: "100%", maxWidth: 480, padding: "calc(22px + env(safe-area-inset-top)) 16px 104px",
                    display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AuraMark size={32} />
            <div>
              <div style={{ fontFamily: T.serif, fontSize: 26, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em" }}>Aura</div>
              <div style={{ fontSize: 12, color: C.sub }}>{t.tagline}{data.settings?.name ? ` · ${data.settings.name}` : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            <button className="press" onClick={() => setShowReport(true)} aria-label={t.report} data-tour="report" style={iconBtn}><FileText size={20} /></button>
            <button className="press" onClick={() => setShowSettings(true)} aria-label={t.settings} data-tour="settings" style={iconBtn}><Cog size={20} /></button>
          </div>
        </header>
        {!storageOk && <div style={{ fontSize: 12, color: C.amber, fontWeight: 600, marginTop: 6 }}>{t.notSaved}</div>}

        {loaded ? <View data={data} update={update} t={t} lc={lc} onReport={() => setShowReport(true)} quickLog={quickLog}
            onAura={logAura} auraMsg={auraMsg} fbCard={fbCard} recentAura={recentAura}
            onSaved={() => { savedThisSession.current = true; }}
            measured={measured} onMeasuredUsed={() => setMeasured(null)}
            timer={timer} onStartTimer={beginSeizure} onEndTimer={endSeizure}
            onDiscardTimer={async () => { await clearTimer(); setTimer(null); }} /> : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 90 }}>
            <div className="breathe"><AuraMark size={44} /></div>
            <div style={{ fontSize: 13, color: C.sub }}>{t.loading}</div>
          </div>
        )}

        {/* marginTop:auto – prilipdo prie apačios, kai turinio maža; kai turinio daug,
            elgiasi kaip anksčiau ir palieka 28 px tarpą */}
        <div style={{ fontSize: 11, color: C.sub, marginTop: "auto", paddingTop: 28, textAlign: "center", lineHeight: 1.5 }}>{t.disclaimer}</div>
      </div>

      {showReport && <ReportSheet data={data} t={t} onClose={() => setShowReport(false)} />}
      {showSettings && <SettingsSheet data={data} update={update} t={t} onReset={resetAll}
        onFeedback={() => { setShowSettings(false); setShowFeedback(true); }}
        onBackup={() => { setShowSettings(false); setShowBackup(true); }}
        onNotifHelp={() => { setShowSettings(false); setShowNotifHelp(true); }}
        onReplayTour={() => { setShowSettings(false); setTab(HOME_TAB); setTourStep(0); }}
        onClose={() => setShowSettings(false)} />}
      {showNotifHelp && <NotifHelpSheet t={t} onClose={() => setShowNotifHelp(false)} />}
      {tourStep >= 0 && tourSteps[tourStep] && (
        <Spotlight target={tourSteps[tourStep].el} hint={tourSteps[tourStep].text} t={t}
          step={tourStep + 1} total={tourSteps.length}
          onNext={() => { if (tourStep + 1 < tourSteps.length) setTourStep(tourStep + 1); else endTour(); }}
          onSkip={endTour} onClose={endTour} />
      )}
      {showSetup && (
        <SetupSheet t={t} lang={lang} name={data.settings?.name || ""}
          notify={notify} perm={setupPerm}
          onLang={(id) => update((d) => { d.settings = { ...d.settings, lang: id }; return d; })}
          onName={(v) => update((d) => { d.settings = { ...d.settings, name: v }; return d; })}
          onNotify={async (v) => {
            // įjungiant pirma prašom leidimo: be jo jungiklis meluotų
            if (v && setupPerm !== "granted") {
              const ok = await requestPermission();
              setSetupPerm(ok ? "granted" : "denied");
              if (!ok) return;
            }
            update((d) => { d.settings = { ...d.settings, notify: v }; return d; });
          }}
          onDone={finishSetup} />
      )}
      {showBreathe && <BreatheSheet data={data} update={update} t={t} onClose={() => setShowBreathe(false)} />}
      {showBackup && <BackupSheet t={t} onClose={() => setShowBackup(false)}
        onRestored={async () => { const p = await loadData(); if (p) setData(hydrate(p)); }} />}
      {showFeedback && <FeedbackSheet data={data} t={t} onClose={() => setShowFeedback(false)} />}

      <div style={{
        position: "fixed", bottom: "calc(70px + env(safe-area-inset-bottom))", left: "50%",
        transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 20,
        display: "flex", justifyContent: "flex-end", pointerEvents: "none",
      }}>
        <button className="press" aria-label={timer ? t.seizEnd : t.seizStart}
          onClick={() => (timer ? endSeizure() : beginSeizure())}
          style={{
            pointerEvents: "auto", marginRight: 16, width: 56, height: 56, borderRadius: "50%",
            background: timer ? C.red : C.plum, color: C.onAccent, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 14px ${C.sh3}`, transition: "transform 80ms ease",
          }}>
          {timer ? <Square size={22} strokeWidth={2.6} /> : <Zap size={25} strokeWidth={2.3} />}
        </button>
      </div>

      <nav data-tour="nav" style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: C.card, borderTop: `1px solid ${C.line}`,
        display: "flex", padding: "7px 2px calc(7px + env(safe-area-inset-bottom))",
      }}>
        {TABS.map(({ id, key, icon: Icon }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} aria-current={active ? "page" : undefined} data-tour={`tab-${id}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 0", color: active ? C.clayDark : C.sub, minWidth: 0 }}>
              <span style={{ width: 40, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, background: active ? C.claySoft : "transparent" }}>
                <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
              </span>
              <div style={{ fontSize: 10, fontWeight: active ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{t[key]}</div>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

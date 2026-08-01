import { useState, useEffect, useRef, useMemo } from "react";
import { load as loadData, save as saveData, clear as clearData } from "./storage";
import { syncMedReminders, initChannel, permissionState, requestPermission, isNative,
         cancelDose, restoreDose, pendingCount, FOLLOWUP_MIN } from "./notifications";
import { pad, dkey, todayKey, addDays } from "./dates";
import { hideSplash, initStatusBar, onBackButton, onResume, exitApp } from "./native";
import { Pill, Zap, Activity, NotebookPen, Plus, X, Check, Trash2, Minus, Wind, CalendarDays, ChevronLeft, ChevronRight, Play, Square, FileText, Settings as Cog, Pencil, Pause } from "lucide-react";

// ---------- design tokens: Claude-style ----------
const C = {
  bg: "#F0EEE5", card: "#FAF9F5", white: "#FFFFFF", ink: "#3D3929", sub: "#87867F", line: "#E3DFD3",
  clay: "#D97757", claySoft: "#F6E4DB", clayDark: "#C05F3C",
  blue: "#7286A8", blueSoft: "#E7EBF2",
  sage: "#6E8F6E", sageSoft: "#E7EDE2",
  amber: "#B0741F", amberSoft: "#F3E8D3",
  plum: "#96637F", plumSoft: "#F0E4EB",
  red: "#B04A4A", redSoft: "#F5E4E4",
};
const T = { serif: "'Source Serif 4', Georgia, serif", body: "'Inter', system-ui, sans-serif" };
const GLOBAL_CSS = `
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
    disclaimer: "Duomenys saugomi tik tavo paskyroje. Programėlė nėra medicinos prietaisas ir nekeičia gydytojo.",
    tMeds: "Vaistai", tSeiz: "Priepuoliai", tCal: "Kalendorius", tWell: "Savijauta", tNotes: "Užrašai",
    save: "Išsaugoti", deleteQ: "Ištrinti?", copied: "Nukopijuota ✓", today: "šiandien", tomorrow: "rytoj",
    inDays: (n) => `po ${n} d.`, passed: "praėjo", allDay: "visą dieną", close: "Uždaryti", del: "Ištrinti",
    prev: "Ankstesnis mėnuo", next: "Kitas mėnuo", less: "Mažiau", more: "Daugiau",
    newMed: "Naujas vaistas", medName: "Pavadinimas, pvz. Levetiracetamas", medDose: "Dozė, pvz. 500 mg",
    times: "Vartojimo laikai", addTime: "Pridėti laiką", removeTime: "Pašalinti laiką", saveMed: "Išsaugoti vaistą",
    todayIs: "Šiandien", medsEmptyT: "Kol kas tuščia",
    medsEmptyB: "Pridėk vaistą su vartojimo laikais — dienos dozes pažymėsi vienu paspaudimu.",
    taken: (a, b) => `Išgerta ${a} iš ${b} dozių šiandien`, allDone: " — viskas ✓",
    last7: "Paskutinės 7 dienos", addMed: "Pridėti vaistą", missed: "praleista?", dose: "Dozė",
    regSeiz: "Registruoti priepuolį", per30: "per 30 d.", daysSince: "d. be priepuolio", diary: "Dienynas",
    seizEmpty: "Įrašų nėra. Registruok kiekvieną priepuolį — dienynas neurologui vertingesnis už atmintį.",
    type: "Tipas", duration: "Trukmė", auraYes: "Aura buvo ✓", auraNo: "Auros nebuvo", withAura: "su aura",
    effects: "Pasekmės", triggers: "Galimi trigeriai",
    seizNote: "Pastabos (kaip jauteisi po, kas matė…)", saveEntry: "Išsaugoti įrašą",
    statusWarn: "Ilgesnis nei 5 min priepuolis gali būti status epilepticus — būtina skubi pagalba (112).",
    newEvent: "Naujas įrašas kalendoriuje", eventWhat: "Kas? pvz. Užeiti pas tėvus",
    timeOptional: "Laikas nebūtinas — be jo įrašas bus „visą dieną“.",
    saveEvent: "Įrašyti į kalendorių", noEventsDay: "Šią dieną įrašų nėra.", addForDay: "Pridėti šiai dienai", upcoming: "Artimiausi",
    breathing: "Kvėpavimas", prepare: "Pasiruošk", inhale: "Įkvėpk", hold: "Sulaikyk", exhale: "Iškvėpk",
    pBox: "Dėžutė 4·4·4·4", pRelax: "Ramybei 4·7·8", start: "Pradėti", stop: "Stabdyti",
    remaining: (n) => `liko ${n} min`, doneMin: (n) => `Baigta — ${n} min ✓`, stoppedMin: (n) => `Sustabdyta — ${n} min įrašyta`,
    thisMonth: "Šį mėnesį", sessions: "seansai", minTotal: "min iš viso",
    calmHint: "Lėtas kvėpavimas mažina stresą — vieną iš dažniausių priepuolių trigerių.",
    segState: "Būsena", segCalm: "Kvėpavimas",
    todayState: "Šiandienos būsena", sleep: "Miegas", stress: "Stresas", fatigue: "Nuovargis", alcohol: "Alkoholis",
    yes: "Taip", no: "Ne", optNote: "Pastaba (nebūtina)", autosave: "Įrašoma automatiškai.",
    sleep7: "Miegas per 7 d.", sleepHint: "Mažiau nei 6 h — vienas dažniausių priepuolių trigerių.",
    newNote: "Naujas užrašas", note: "Užrašas", notesTitle: "Užrašai",
    notesEmpty: "Tuščia. Užsirašyk klausimus gydytojui ar pastebėjimus apie savijautą.",
    notePh: "Klausimai gydytojui, savijauta, pastebėjimai…", delNote: "Ištrinti užrašą",
    report: "Ataskaita gydytojui", rSeiz: "Priepuoliai", rTypes: "Tipai", rAura: "Su aura",
    rLongest: "Ilgiausia trukmė", rAdh: "Vaistų laikymasis", rSleep: "Miegas", rSleepV: (a, s, n) => `vid. ${a} h · <6 h: ${s}/${n}`,
    rStressFat: "Stresas / nuovargis", rOf5: "(iš 5)", rAlco: "Alkoholis", rDays: (n) => `${n} d.`,
    rCalm: "Kvėpavimo pratimai", rCalmV: (s, m) => `${s} seansai · ${m} min`, copyText: "Kopijuoti kaip tekstą",
    rNote: "Vaistų laikymasis skaičiuojamas pagal dabartinį vaistų sąrašą, todėl laikotarpiui iki vaisto pridėjimo — apytikslis.",
    rTitle: (n) => `AURA — ${n} d. ataskaita`, rPatient: "Pacientas", rFooter: "Duomenys registruoti paties paciento programėle Aura.",
    rAdhLine: (p, t, s) => `VAISTAI: laikymasis ~${p}% (${t} iš ${s} dozių)`,
    settings: "Nustatymai", language: "Kalba", profile: "Profilis", namePh: "Vardas (rodomas ataskaitoje)",
    overdueAfter: "Dozė žymima „praleista?“ po:", data: "Duomenys", exportJson: "Eksportuoti duomenis (JSON)",
    deleteAll: "Ištrinti visus duomenis", confirmAll: "Tikrai ištrinti viską? Negrįžtama", about: "Apie",
    aboutText: "Aura · prototipas v0.9. Duomenys saugomi tik tavo paskyroje. Programėlė nėra medicinos prietaisas — priepuolių detekcijai naudok sertifikuotus įrenginius, o skubiai informacijai užsipildyk telefono Medical ID.",
    aura: "Aura", edit: "Redaguoti", editSeiz: "Redaguoti priepuolį", editEvent: "Redaguoti įrašą",
    unanswered: "neatsakyta", rAnswered: (a, b) => `atsakyta ${a} iš ${b}`,
    sum30: "Per 30 dienų", sumSeiz: "priepuoliai", sumAdh: "vaistų", sumSleep: "miegas",
    sumDemo: "Pavyzdys — čia atsiras tavo duomenys",
    sumWhy: "Bloknotas kaupia įrašus. Aura iš jų suskaičiuoja tai, ko gydytojui reikia: vaistų laikymosi procentą, trigerius pagal dažnį ir miegą prieš priepuolius.",
    sumOpen: "Atidaryti ataskaitą",
    stTaken: "Išgerta", stLate: "Vėluoja", stSoon: "Laukia",
    fbLabel: "Atsiliepimas", fbBtn: "Rašyti kūrėjui", fbSubj: "Aura — atsiliepimas",
    fbNote: "Atsidarys tavo el. pašto programa. Prisegama tik versija ir įrenginio tipas — dienyno įrašai nesiunčiami.",
    pause: "Pauzė", resume: "Tęsti", paused: "Pristabdyta", quickLog: "Registruoti priepuolį",
    editMed: "Redaguoti vaistą", rAdhDays: (a, b) => `skaičiuota ${a} iš ${b} d.`,
    auraKinds: "Kaip aura pasireiškė?", auraNew: "Pridėti savo aprašymą", rAuraKinds: "Auros pasireiškimas",
    auraHint: "Įrašyk savo žodžiais — auros turinys neurologui pasako, kurioje smegenų vietoje priepuolis prasideda.",
    fbBug: "Klaida", fbIdea: "Pasiūlymas", fbOther: "Kita",
    fbPh: "Kas nutiko arba ką norėtum pakeisti? Jei tai klaida — kaip ją pakartoti?",
    fbAttach: "Bus prisegta", fbSend: "Siųsti", fbCopy: "Kopijuoti tekstą",
    fbSent: "Atsidarė pašto programa", fbFallback: "Jei pašto programa neatsidarė, nukopijuok tekstą ir atsiųsk į", fbNoText: "Įrašyk, kas nutiko",
    ty: { tonicClonic: "Toninis-kloninis", absence: "Absansas", focal: "Židininis", myoclonic: "Miokloninis", other: "Kitas", unspec: "Nenurodyta" },
    ef: { fall: "Nukritau", injury: "Susižalojau", tongue: "Prikandau liežuvį", incontinence: "Šlapimo nelaikymas" },
    tg: { insomnia: "Nemiga", stress: "Stresas", fatigue: "Pervargimas", alcohol: "Alkoholis", missedMeds: "Praleisti vaistai", missedMeal: "Praleistas valgis", flashing: "Mirganti šviesa", illness: "Liga / karščiavimas", unknown: "Nežinoma" },
    cat: { doctor: "Gydytojas", surgery: "Operacija", family: "Šeima", other: "Kita" },
  },
  en: {
    tagline: "Epilepsy diary", loading: "Loading…", notSaved: "Not saved to storage",
    disclaimer: "Data is stored only in your account. This app is not a medical device and does not replace your doctor.",
    tMeds: "Meds", tSeiz: "Seizures", tCal: "Calendar", tWell: "Wellbeing", tNotes: "Notes",
    save: "Save", deleteQ: "Delete?", copied: "Copied ✓", today: "today", tomorrow: "tomorrow",
    inDays: (n) => `in ${n} d.`, passed: "passed", allDay: "all day", close: "Close", del: "Delete",
    prev: "Previous month", next: "Next month", less: "Less", more: "More",
    newMed: "New medication", medName: "Name, e.g. Levetiracetam", medDose: "Dose, e.g. 500 mg",
    times: "Dose times", addTime: "Add time", removeTime: "Remove time", saveMed: "Save medication",
    todayIs: "Today", medsEmptyT: "Nothing here yet",
    medsEmptyB: "Add a medication with its times — then mark each dose with a single tap.",
    taken: (a, b) => `Taken ${a} of ${b} doses today`, allDone: " — all done ✓",
    last7: "Last 7 days", addMed: "Add medication", missed: "missed?", dose: "Dose",
    regSeiz: "Log a seizure", per30: "in 30 d.", daysSince: "d. seizure-free", diary: "Diary",
    seizEmpty: "No entries yet. Log every seizure — a diary is worth more to your neurologist than memory.",
    type: "Type", duration: "Duration", auraYes: "Aura present ✓", auraNo: "No aura", withAura: "with aura",
    effects: "Consequences", triggers: "Possible triggers",
    seizNote: "Notes (how you felt after, who witnessed it…)", saveEntry: "Save entry",
    statusWarn: "A seizure longer than 5 min may be status epilepticus — call emergency services immediately.",
    newEvent: "New calendar entry", eventWhat: "What? e.g. Visit my parents",
    timeOptional: "Time is optional — without it the entry is “all day”.",
    saveEvent: "Add to calendar", noEventsDay: "No entries on this day.", addForDay: "Add for this day", upcoming: "Upcoming",
    breathing: "Breathing", prepare: "Get ready", inhale: "Breathe in", hold: "Hold", exhale: "Breathe out",
    pBox: "Box 4·4·4·4", pRelax: "Calming 4·7·8", start: "Start", stop: "Stop",
    remaining: (n) => `${n} min left`, doneMin: (n) => `Done — ${n} min ✓`, stoppedMin: (n) => `Stopped — ${n} min saved`,
    thisMonth: "This month", sessions: "sessions", minTotal: "min total",
    calmHint: "Slow breathing lowers stress — one of the most common seizure triggers.",
    segState: "State", segCalm: "Breathing",
    todayState: "Today's state", sleep: "Sleep", stress: "Stress", fatigue: "Fatigue", alcohol: "Alcohol",
    yes: "Yes", no: "No", optNote: "Note (optional)", autosave: "Saved automatically.",
    sleep7: "Sleep over 7 days", sleepHint: "Under 6 h — one of the most common seizure triggers.",
    newNote: "New note", note: "Note", notesTitle: "Notes",
    notesEmpty: "Empty. Jot down questions for your doctor or things you notice.",
    notePh: "Questions for the doctor, how you feel, observations…", delNote: "Delete note",
    report: "Report for doctor", rSeiz: "Seizures", rTypes: "Types", rAura: "With aura",
    rLongest: "Longest duration", rAdh: "Medication adherence", rSleep: "Sleep", rSleepV: (a, s, n) => `avg ${a} h · <6 h: ${s}/${n}`,
    rStressFat: "Stress / fatigue", rOf5: "(of 5)", rAlco: "Alcohol", rDays: (n) => `${n} d.`,
    rCalm: "Breathing exercises", rCalmV: (s, m) => `${s} sessions · ${m} min`, copyText: "Copy as text",
    rNote: "Adherence is calculated from your current medication list, so it is approximate for periods before a medication was added.",
    rTitle: (n) => `AURA — ${n}-day report`, rPatient: "Patient", rFooter: "Data self-recorded by the patient using the Aura app.",
    rAdhLine: (p, t, s) => `MEDICATION: adherence ~${p}% (${t} of ${s} doses)`,
    settings: "Settings", language: "Language", profile: "Profile", namePh: "Name (shown in the report)",
    overdueAfter: "Mark a dose as “missed?” after:", data: "Data", exportJson: "Export data (JSON)",
    deleteAll: "Delete all data", confirmAll: "Delete everything? This cannot be undone", about: "About",
    aboutText: "Aura · prototype v0.9. Data is stored only in your account. This app is not a medical device — use certified devices for seizure detection, and fill in your phone's Medical ID for emergencies.",
    aura: "Aura", edit: "Edit", editSeiz: "Edit seizure", editEvent: "Edit entry",
    unanswered: "not answered", rAnswered: (a, b) => `answered ${a} of ${b}`,
    sum30: "Last 30 days", sumSeiz: "seizures", sumAdh: "meds", sumSleep: "sleep",
    sumDemo: "Example — your data will appear here",
    sumWhy: "A notepad collects entries. Aura turns them into what your doctor needs: adherence percentage, triggers ranked by frequency, and sleep before seizures.",
    sumOpen: "Open report",
    stTaken: "Taken", stLate: "Late", stSoon: "Due",
    fbLabel: "Feedback", fbBtn: "Email the developer", fbSubj: "Aura — feedback",
    fbNote: "Opens your email app. Only the version and device type are attached — no diary entries are sent.",
    pause: "Pause", resume: "Resume", paused: "Paused", quickLog: "Log a seizure",
    editMed: "Edit medication", rAdhDays: (a, b) => `over ${a} of ${b} d.`,
    auraKinds: "How did the aura present?", auraNew: "Add your own description", rAuraKinds: "Aura presentation",
    auraHint: "Use your own words — what the aura feels like tells your neurologist where the seizure starts.",
    fbBug: "Bug", fbIdea: "Idea", fbOther: "Other",
    fbPh: "What happened, or what would you change? If it is a bug — how do you reproduce it?",
    fbAttach: "Will be attached", fbSend: "Send", fbCopy: "Copy text",
    fbSent: "Mail app opened", fbFallback: "If your mail app did not open, copy the text and send it to", fbNoText: "Describe what happened",
    ty: { tonicClonic: "Tonic-clonic", absence: "Absence", focal: "Focal", myoclonic: "Myoclonic", other: "Other", unspec: "Unspecified" },
    ef: { fall: "I fell", injury: "Injured myself", tongue: "Bit my tongue", incontinence: "Incontinence" },
    tg: { insomnia: "Poor sleep", stress: "Stress", fatigue: "Exhaustion", alcohol: "Alcohol", missedMeds: "Missed meds", missedMeal: "Missed meal", flashing: "Flashing lights", illness: "Illness / fever", unknown: "Unknown" },
    cat: { doctor: "Doctor", surgery: "Surgery", family: "Family", other: "Other" },
  },
  ru: {
    tagline: "Дневник эпилепсии", loading: "Загрузка…", notSaved: "Не сохранено",
    disclaimer: "Данные хранятся только в вашей учётной записи. Приложение не является медицинским прибором и не заменяет врача.",
    tMeds: "Лекарства", tSeiz: "Приступы", tCal: "Календарь", tWell: "Состояние", tNotes: "Заметки",
    save: "Сохранить", deleteQ: "Удалить?", copied: "Скопировано ✓", today: "сегодня", tomorrow: "завтра",
    inDays: (n) => `через ${n} д.`, passed: "прошло", allDay: "весь день", close: "Закрыть", del: "Удалить",
    prev: "Предыдущий месяц", next: "Следующий месяц", less: "Меньше", more: "Больше",
    newMed: "Новое лекарство", medName: "Название, напр. Леветирацетам", medDose: "Доза, напр. 500 мг",
    times: "Время приёма", addTime: "Добавить время", removeTime: "Убрать время", saveMed: "Сохранить лекарство",
    todayIs: "Сегодня", medsEmptyT: "Пока пусто",
    medsEmptyB: "Добавьте лекарство с временем приёма — отмечать дозы можно одним касанием.",
    taken: (a, b) => `Принято ${a} из ${b} доз сегодня`, allDone: " — всё ✓",
    last7: "Последние 7 дней", addMed: "Добавить лекарство", missed: "пропущено?", dose: "Доза",
    regSeiz: "Записать приступ", per30: "за 30 д.", daysSince: "д. без приступов", diary: "Дневник",
    seizEmpty: "Записей нет. Записывайте каждый приступ — дневник ценнее для невролога, чем память.",
    type: "Тип", duration: "Длительность", auraYes: "Аура была ✓", auraNo: "Ауры не было", withAura: "с аурой",
    effects: "Последствия", triggers: "Возможные триггеры",
    seizNote: "Заметки (как чувствовали себя после, кто видел…)", saveEntry: "Сохранить запись",
    statusWarn: "Приступ дольше 5 минут может быть эпилептическим статусом — нужна срочная помощь (112).",
    newEvent: "Новая запись в календаре", eventWhat: "Что? напр. Зайти к родителям",
    timeOptional: "Время необязательно — без него запись будет «весь день».",
    saveEvent: "Добавить в календарь", noEventsDay: "В этот день записей нет.", addForDay: "Добавить на этот день", upcoming: "Ближайшие",
    breathing: "Дыхание", prepare: "Приготовьтесь", inhale: "Вдох", hold: "Задержка", exhale: "Выдох",
    pBox: "Квадрат 4·4·4·4", pRelax: "Расслабление 4·7·8", start: "Начать", stop: "Остановить",
    remaining: (n) => `осталось ${n} мин`, doneMin: (n) => `Готово — ${n} мин ✓`, stoppedMin: (n) => `Остановлено — ${n} мин записано`,
    thisMonth: "В этом месяце", sessions: "сеансы", minTotal: "мин всего",
    calmHint: "Медленное дыхание снижает стресс — один из самых частых триггеров приступов.",
    segState: "Состояние", segCalm: "Дыхание",
    todayState: "Состояние сегодня", sleep: "Сон", stress: "Стресс", fatigue: "Усталость", alcohol: "Алкоголь",
    yes: "Да", no: "Нет", optNote: "Заметка (необязательно)", autosave: "Сохраняется автоматически.",
    sleep7: "Сон за 7 дней", sleepHint: "Меньше 6 ч — один из самых частых триггеров приступов.",
    newNote: "Новая заметка", note: "Заметка", notesTitle: "Заметки",
    notesEmpty: "Пусто. Запишите вопросы врачу или свои наблюдения.",
    notePh: "Вопросы врачу, самочувствие, наблюдения…", delNote: "Удалить заметку",
    report: "Отчёт для врача", rSeiz: "Приступы", rTypes: "Типы", rAura: "С аурой",
    rLongest: "Самый долгий", rAdh: "Соблюдение приёма", rSleep: "Сон", rSleepV: (a, s, n) => `сред. ${a} ч · <6 ч: ${s}/${n}`,
    rStressFat: "Стресс / усталость", rOf5: "(из 5)", rAlco: "Алкоголь", rDays: (n) => `${n} д.`,
    rCalm: "Дыхательные упражнения", rCalmV: (s, m) => `${s} сеансов · ${m} мин`, copyText: "Скопировать как текст",
    rNote: "Соблюдение приёма считается по текущему списку лекарств, поэтому для периода до добавления лекарства оно приблизительно.",
    rTitle: (n) => `AURA — отчёт за ${n} д.`, rPatient: "Пациент", rFooter: "Данные записаны самим пациентом в приложении Aura.",
    rAdhLine: (p, t, s) => `ЛЕКАРСТВА: соблюдение ~${p}% (${t} из ${s} доз)`,
    settings: "Настройки", language: "Язык", profile: "Профиль", namePh: "Имя (показывается в отчёте)",
    overdueAfter: "Отмечать дозу «пропущено?» через:", data: "Данные", exportJson: "Экспорт данных (JSON)",
    deleteAll: "Удалить все данные", confirmAll: "Точно удалить всё? Необратимо", about: "О приложении",
    aboutText: "Aura · прототип v0.9. Данные хранятся только в вашей учётной записи. Приложение не медицинский прибор — для обнаружения приступов используйте сертифицированные устройства, а для экстренных случаев заполните Medical ID в телефоне.",
    aura: "Аура", edit: "Изменить", editSeiz: "Изменить приступ", editEvent: "Изменить запись",
    unanswered: "нет ответа", rAnswered: (a, b) => `отвечено ${a} из ${b}`,
    sum30: "За 30 дней", sumSeiz: "приступы", sumAdh: "лекарства", sumSleep: "сон",
    sumDemo: "Пример — здесь появятся ваши данные",
    sumWhy: "Блокнот накапливает записи. Aura считает из них то, что нужно врачу: процент соблюдения приёма, триггеры по частоте и сон перед приступами.",
    sumOpen: "Открыть отчёт",
    stTaken: "Принято", stLate: "Опаздывает", stSoon: "Ожидает",
    fbLabel: "Отзыв", fbBtn: "Написать разработчику", fbSubj: "Aura — отзыв",
    fbNote: "Откроется почтовое приложение. Прилагается только версия и тип устройства — записи дневника не отправляются.",
    pause: "Пауза", resume: "Продолжить", paused: "Приостановлено", quickLog: "Записать приступ",
    editMed: "Изменить лекарство", rAdhDays: (a, b) => `за ${a} из ${b} д.`,
    auraKinds: "Как проявилась аура?", auraNew: "Добавить своё описание", rAuraKinds: "Проявление ауры",
    auraHint: "Своими словами — содержаниеауры показывает неврологу, где начинается приступ.",
    fbBug: "Ошибка", fbIdea: "Предложение", fbOther: "Другое",
    fbPh: "Что произошло или что хотели бы изменить? Если ошибка — как её повторить?",
    fbAttach: "Будет приложено", fbSend: "Отправить", fbCopy: "Скопировать текст",
    fbSent: "Почтовое приложение открыто", fbFallback: "Если почта не открылась, скопируйте текст и отправьте на", fbNoText: "Опишите, что произошло",
    ty: { tonicClonic: "Тонико-клонический", absence: "Абсанс", focal: "Фокальный", myoclonic: "Миоклонический", other: "Другой", unspec: "Не указан" },
    ef: { fall: "Упал(а)", injury: "Травма", tongue: "Прикус языка", incontinence: "Недержание мочи" },
    tg: { insomnia: "Недосып", stress: "Стресс", fatigue: "Переутомление", alcohol: "Алкоголь", missedMeds: "Пропуск лекарств", missedMeal: "Пропуск еды", flashing: "Мерцающий свет", illness: "Болезнь / жар", unknown: "Неизвестно" },
    cat: { doctor: "Врач", surgery: "Операция", family: "Семья", other: "Другое" },
  },
  pl: {
    tagline: "Dziennik padaczki", loading: "Ładowanie…", notSaved: "Nie zapisano",
    disclaimer: "Dane są przechowywane tylko na Twoim koncie. Aplikacja nie jest wyrobem medycznym i nie zastępuje lekarza.",
    tMeds: "Leki", tSeiz: "Napady", tCal: "Kalendarz", tWell: "Samopoczucie", tNotes: "Notatki",
    save: "Zapisz", deleteQ: "Usunąć?", copied: "Skopiowano ✓", today: "dziś", tomorrow: "jutro",
    inDays: (n) => `za ${n} dni`, passed: "minęło", allDay: "cały dzień", close: "Zamknij", del: "Usuń",
    prev: "Poprzedni miesiąc", next: "Następny miesiąc", less: "Mniej", more: "Więcej",
    newMed: "Nowy lek", medName: "Nazwa, np. Lewetyracetam", medDose: "Dawka, np. 500 mg",
    times: "Pory przyjmowania", addTime: "Dodaj porę", removeTime: "Usuń porę", saveMed: "Zapisz lek",
    todayIs: "Dziś", medsEmptyT: "Na razie pusto",
    medsEmptyB: "Dodaj lek wraz z porami — dawki oznaczysz jednym dotknięciem.",
    taken: (a, b) => `Przyjęto ${a} z ${b} dawek dziś`, allDone: " — wszystko ✓",
    last7: "Ostatnie 7 dni", addMed: "Dodaj lek", missed: "pominięto?", dose: "Dawka",
    regSeiz: "Zapisz napad", per30: "w 30 dni", daysSince: "dni bez napadu", diary: "Dziennik",
    seizEmpty: "Brak wpisów. Zapisuj każdy napad — dziennik jest dla neurologa cenniejszy niż pamięć.",
    type: "Typ", duration: "Czas trwania", auraYes: "Aura wystąpiła ✓", auraNo: "Bez aury", withAura: "z aurą",
    effects: "Następstwa", triggers: "Możliwe wyzwalacze",
    seizNote: "Notatki (jak się czułeś po, kto widział…)", saveEntry: "Zapisz wpis",
    statusWarn: "Napad dłuższy niż 5 min może być stanem padaczkowym — konieczna pilna pomoc (112).",
    newEvent: "Nowy wpis w kalendarzu", eventWhat: "Co? np. Odwiedzić rodziców",
    timeOptional: "Godzina nieobowiązkowa — bez niej wpis będzie „cały dzień”.",
    saveEvent: "Dodaj do kalendarza", noEventsDay: "Brak wpisów w tym dniu.", addForDay: "Dodaj na ten dzień", upcoming: "Najbliższe",
    breathing: "Oddech", prepare: "Przygotuj się", inhale: "Wdech", hold: "Wstrzymaj", exhale: "Wydech",
    pBox: "Kwadrat 4·4·4·4", pRelax: "Uspokojenie 4·7·8", start: "Zacznij", stop: "Zatrzymaj",
    remaining: (n) => `pozostało ${n} min`, doneMin: (n) => `Gotowe — ${n} min ✓`, stoppedMin: (n) => `Zatrzymano — zapisano ${n} min`,
    thisMonth: "W tym miesiącu", sessions: "sesje", minTotal: "min łącznie",
    calmHint: "Powolny oddech obniża stres — jeden z najczęstszych wyzwalaczy napadów.",
    segState: "Stan", segCalm: "Oddech",
    todayState: "Dzisiejszy stan", sleep: "Sen", stress: "Stres", fatigue: "Zmęczenie", alcohol: "Alkohol",
    yes: "Tak", no: "Nie", optNote: "Notatka (opcjonalnie)", autosave: "Zapisywane automatycznie.",
    sleep7: "Sen przez 7 dni", sleepHint: "Poniżej 6 h — jeden z najczęstszych wyzwalaczy napadów.",
    newNote: "Nowa notatka", note: "Notatka", notesTitle: "Notatki",
    notesEmpty: "Pusto. Zapisz pytania do lekarza albo swoje spostrzeżenia.",
    notePh: "Pytania do lekarza, samopoczucie, spostrzeżenia…", delNote: "Usuń notatkę",
    report: "Raport dla lekarza", rSeiz: "Napady", rTypes: "Typy", rAura: "Z aurą",
    rLongest: "Najdłuższy", rAdh: "Przestrzeganie leczenia", rSleep: "Sen", rSleepV: (a, s, n) => `śr. ${a} h · <6 h: ${s}/${n}`,
    rStressFat: "Stres / zmęczenie", rOf5: "(z 5)", rAlco: "Alkohol", rDays: (n) => `${n} dni`,
    rCalm: "Ćwiczenia oddechowe", rCalmV: (s, m) => `${s} sesji · ${m} min`, copyText: "Kopiuj jako tekst",
    rNote: "Przestrzeganie liczone jest na podstawie bieżącej listy leków, więc dla okresu przed dodaniem leku jest przybliżone.",
    rTitle: (n) => `AURA — raport z ${n} dni`, rPatient: "Pacjent", rFooter: "Dane zapisane samodzielnie przez pacjenta w aplikacji Aura.",
    rAdhLine: (p, t, s) => `LEKI: przestrzeganie ~${p}% (${t} z ${s} dawek)`,
    settings: "Ustawienia", language: "Język", profile: "Profil", namePh: "Imię (widoczne w raporcie)",
    overdueAfter: "Oznacz dawkę „pominięto?” po:", data: "Dane", exportJson: "Eksportuj dane (JSON)",
    deleteAll: "Usuń wszystkie dane", confirmAll: "Na pewno usunąć wszystko? Nieodwracalne", about: "O aplikacji",
    aboutText: "Aura · prototyp v0.9. Dane są przechowywane tylko na Twoim koncie. Aplikacja nie jest wyrobem medycznym — do wykrywania napadów używaj certyfikowanych urządzeń, a na wypadek nagły wypełnij Medical ID w telefonie.",
    aura: "Aura", edit: "Edytuj", editSeiz: "Edytuj napad", editEvent: "Edytuj wpis",
    unanswered: "brak odpowiedzi", rAnswered: (a, b) => `odpowiedzi: ${a} z ${b}`,
    sum30: "Ostatnie 30 dni", sumSeiz: "napady", sumAdh: "leki", sumSleep: "sen",
    sumDemo: "Przykład — tu pojawią się Twoje dane",
    sumWhy: "Notatnik gromadzi wpisy. Aura wylicza z nich to, czego potrzebuje lekarz: procent przestrzegania, wyzwalacze według częstości i sen przed napadami.",
    sumOpen: "Otwórz raport",
    stTaken: "Przyjęte", stLate: "Spóźnione", stSoon: "Oczekuje",
    fbLabel: "Opinia", fbBtn: "Napisz do autora", fbSubj: "Aura — opinia",
    fbNote: "Otworzy się aplikacja pocztowa. Dołączana jest tylko wersja i typ urządzenia — wpisy z dziennika nie są wysyłane.",
    pause: "Pauza", resume: "Kontynuuj", paused: "Wstrzymane", quickLog: "Zapisz napad",
    editMed: "Edytuj lek", rAdhDays: (a, b) => `za ${a} z ${b} dni`,
    auraKinds: "Jak objawiła się aura?", auraNew: "Dodaj własny opis", rAuraKinds: "Objawy aury",
    auraHint: "Własnymi słowami — treść aury mówi neurologowi, gdzie napad się zaczyna.",
    fbBug: "Błąd", fbIdea: "Pomysł", fbOther: "Inne",
    fbPh: "Co się stało lub co chciałbyś zmienić? Jeśli to błąd — jak go powtórzyć?",
    fbAttach: "Zostanie dołączone", fbSend: "Wyślij", fbCopy: "Kopiuj tekst",
    fbSent: "Otwarto aplikację pocztową", fbFallback: "Jeśli poczta się nie otworzyła, skopiuj tekst i wyślij na", fbNoText: "Opisz, co się stało",
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
    fuTitle: "Dozė nepažymėta", fuBody: (m) => `${m.name} — ar tikrai išgėrei?`,
    channel: "Vaistų priminimai", label: "Priminimai",
    diag: "Suplanuota priminimų", diagRun: "Tikrinti", diagNone: "nėra",
    desc: "Kasdieniai pranešimai pagal vaistų vartojimo laikus.",
    on: "Įjungti", off: "Išjungti",
    denied: "Pranešimai uždrausti. Įjunk juos telefono nustatymuose.",
    webOnly: "Priminimai veikia tik įdiegus programėlę telefone.",
  },
  en: {
    title: "Time to take your medication", body: (m) => `${m.name}${m.dose ? " · " + m.dose : ""}`,
    fuTitle: "Dose not marked", fuBody: (m) => `${m.name} — did you actually take it?`,
    channel: "Medication reminders", label: "Reminders",
    diag: "Scheduled reminders", diagRun: "Check", diagNone: "none",
    desc: "Daily notifications based on your dose times.",
    on: "On", off: "Off",
    denied: "Notifications are blocked. Enable them in your phone settings.",
    webOnly: "Reminders only work in the installed mobile app.",
  },
  ru: {
    title: "Время принять лекарство", body: (m) => `${m.name}${m.dose ? " · " + m.dose : ""}`,
    fuTitle: "Доза не отмечена", fuBody: (m) => `${m.name} — вы действительно приняли?`,
    channel: "Напоминания о лекарствах", label: "Напоминания",
    diag: "Запланировано напоминаний", diagRun: "Проверить", diagNone: "нет",
    desc: "Ежедневные уведомления по времени приёма.",
    on: "Вкл.", off: "Выкл.",
    denied: "Уведомления запрещены. Включите их в настройках телефона.",
    webOnly: "Напоминания работают только в установленном приложении.",
  },
  pl: {
    title: "Czas wziąć lek", body: (m) => `${m.name}${m.dose ? " · " + m.dose : ""}`,
    fuTitle: "Dawka nieoznaczona", fuBody: (m) => `${m.name} — czy naprawdę wziąłeś?`,
    channel: "Przypomnienia o lekach", label: "Przypomnienia",
    diag: "Zaplanowane przypomnienia", diagRun: "Sprawdź", diagNone: "brak",
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
const APP_VERSION = "0.9";
const DEFAULT_DATA = { meds: [], doseLog: {}, seizures: [], daily: {}, notes: [], events: [], calm: [], auraTypes: [], settings: { name: "", overdueMin: 60, lang: "lt", notify: true } };
const DAILY_EMPTY = { sleep: null, stress: null, fatigue: null, alcohol: null, note: "" };
const TYPE_IDS = ["tonicClonic", "absence", "focal", "myoclonic", "other"];
const EFFECT_IDS = ["fall", "injury", "tongue", "incontinence"];
const TRIGGER_IDS = ["insomnia", "stress", "fatigue", "alcohol", "missedMeds", "missedMeal", "flashing", "illness", "unknown"];
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

// ---------- Claude starburst logo ----------
function Sunburst({ size = 30, color = C.clay }) {
  const rays = [13, 11.5, 13, 12, 13, 11, 13, 12.5, 13, 11.5, 13, 12];
  return (
    <svg viewBox="-16 -16 32 32" width={size} height={size} aria-hidden="true">
      <g stroke={color} strokeWidth="3.4" strokeLinecap="round">
        {rays.map((len, i) => <line key={i} x1="0" y1="-5" x2="0" y2={-len} transform={`rotate(${i * 30})`} />)}
      </g>
    </svg>
  );
}

// ---------- shared pieces ----------
function SectionLabel({ children, style }) {
  return <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 600, color: C.ink, margin: "24px 4px 10px", ...style }}>{children}</div>;
}

function Card({ children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(61,57,41,0.04)", ...style }}>{children}</div>;
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
  return <button onClick={() => setArmed(true)} aria-label={t.del} style={{ padding: 6, color: C.sub }}><Trash2 size={16} /></button>;
}

function Sheet({ title, onClose, children, t }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(61,57,41,0.4)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", background: C.bg, borderRadius: "18px 18px 0 0", padding: "18px 18px 28px", boxShadow: "0 -4px 24px rgba(61,57,41,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} aria-label={t.close} style={{ padding: 8, color: C.sub }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PrimaryBtn({ onClick, children, disabled, color = C.clay, style }) {
  return (
    <button className="press" onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "13px 16px", borderRadius: 12, fontFamily: T.body, fontSize: 15, fontWeight: 600,
      background: disabled ? C.line : color, color: disabled ? C.sub : "#FFF",
      transition: "transform 80ms ease, background 120ms ease", ...style,
    }}>{children}</button>
  );
}

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
        background: taken ? C.clay : "transparent", color: "#FFF",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {taken && <Check size={20} strokeWidth={3} />}
      </div>
    </button>
  );
}

function MedsView({ data, update, t, lc, onReport }) {
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
              <button className="press" onClick={() => setEditing(m)} aria-label={t.edit} style={{ padding: 6, color: C.sub }}><Pencil size={16} /></button>
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
                      color: full ? "#FFF" : some ? C.amber : C.line, fontSize: 12, fontWeight: 600,
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

      <PrimaryBtn onClick={() => setEditing(null)} style={{ marginTop: 18 }}>
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
function SeizureForm({ initial, onSave, onClose, t, auraTypes = [], onAddAuraType }) {
  const [at, setAt] = useState(toLocalInput(initial ? new Date(initial.at) : new Date()));
  const [type, setType] = useState(initial?.type && initial.type !== "unspec" ? initial.type : null);
  const [dur, setDur] = useState(initial?.dur ?? null);
  const [aura, setAura] = useState(initial ? (initial.aura ?? null) : null);
  const [trigs, setTrigs] = useState(initial?.triggers ?? []);
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DURATIONS.map((x) => <Chip key={x} active={dur === x} onClick={() => setDur(x)} color={C.plum} soft={C.plumSoft}>{x}</Chip>)}
        </div>
        {dur === ">5 min" && (
          <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.5 }}>{t.statusWarn}</div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{t.aura}</div>
          <Segmented ariaLabel={t.aura} value={aura} onChange={setAura}
            options={[{ v: true, label: t.yes }, { v: false, label: t.no }]} />
        </div>
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
                style={{ width: 44, borderRadius: 10, background: newKind.trim() ? C.plum : C.line, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} placeholder={t.seizNote} value={note} onChange={(e) => setNote(e.target.value)} />
        <PrimaryBtn color={C.plum} onClick={() => {
          const when = new Date(at), now = new Date();
          onSave({ ...(initial || {}), id: initial?.id || uid(), at: (when > now ? now : when).toISOString(), type: type || "unspec", dur, aura, auraKinds: aura === true ? kinds : [], effects, triggers: trigs, note: note.trim() });
        }}>
          {t.saveEntry}
        </PrimaryBtn>
      </div>
    </Sheet>
  );
}

function SeizuresView({ data, update, t, lc, onReport, quickLog }) {
  const [editing, setEditing] = useState(undefined);
  useEffect(() => { if (quickLog) setEditing(null); }, [quickLog]); // undefined=uždaryta, null=naujas, objektas=redaguojamas
  const list = [...data.seizures].sort((a, b) => new Date(b.at) - new Date(a.at));
  const now = new Date();
  const last30 = list.filter((s) => now - new Date(s.at) < 30 * 86400000).length;
  const daysSince = list.length ? Math.floor((now - new Date(list[0].at)) / 86400000) : null;

  return (
    <div>
      <PrimaryBtn color={C.plum} onClick={() => setEditing(null)} style={{ marginTop: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Zap size={17} /> {t.regSeiz}</span>
      </PrimaryBtn>

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
                <button className="press" onClick={() => setEditing(s)} aria-label={t.edit} style={{ padding: 6, color: C.sub }}><Pencil size={16} /></button>
                <DeleteBtn t={t} onConfirm={() => update((d) => { d.seizures = d.seizures.filter((x) => x.id !== s.id); return d; })} />
              </div>
            </div>
            <div style={{ fontSize: 14, marginTop: 2 }}>
              {lbl(t.ty, s.type)}{s.dur ? ` · ${s.dur}` : ""}{s.aura ? ` · ${t.withAura}` : ""}
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
              </div>
            )}
            {s.note && <div style={{ fontSize: 13, color: C.sub, marginTop: 8 }}>{s.note}</div>}
          </Card>
        ))}
      </div>

      {editing !== undefined && (
        <SeizureForm t={t} initial={editing} auraTypes={data.auraTypes || []}
          onAddAuraType={(label) => {
            const exist = (data.auraTypes || []).find((a) => a.label.toLowerCase() === label.toLowerCase());
            if (exist) return exist.id;
            const id = "aura_" + uid();
            update((d) => { d.auraTypes = [...(d.auraTypes || []), { id, label }]; return d; });
            return id;
          }}
          onClose={() => setEditing(undefined)} onSave={(e) => {
          update((d) => {
            const i = d.seizures.findIndex((x) => x.id === e.id);
            if (i >= 0) d.seizures[i] = e; else d.seizures.push(e);
            return d;
          });
          setEditing(undefined);
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
      <button className="press" onClick={onEdit} aria-label={t.edit} style={{ padding: 6, color: C.sub }}><Pencil size={15} /></button>
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

  const tk = todayKey();
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
      <Card style={{ marginTop: 16, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button className="press" onClick={() => setCur(new Date(y, m - 1, 1))} aria-label={t.prev} style={{ padding: 6, color: C.sub }}><ChevronLeft size={20} /></button>
          <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 600, textTransform: "capitalize" }}>{fMonth(cur, lc)}</div>
          <button className="press" onClick={() => setCur(new Date(y, m + 1, 1))} aria-label={t.next} style={{ padding: 6, color: C.sub }}><ChevronRight size={20} /></button>
        </div>
        <div {...swipe} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, touchAction: "pan-y" }}>
          {WD_MON.map((w, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, color: C.sub, fontWeight: 600, paddingBottom: 4 }}>{w}</div>)}
          {Array.from({ length: offset }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: dim }, (_, i) => {
            const day = i + 1;
            const k = `${y}-${pad(m + 1)}-${pad(day)}`;
            const isToday = k === tk, isSel = k === sel;
            const evs = byDate[k] || [];
            return (
              <button key={k} onClick={() => setSel(k)} style={{
                height: 46, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                borderRadius: 10, border: isSel ? `1.5px solid ${C.clay}` : "1.5px solid transparent",
                background: isToday ? C.claySoft : "transparent",
              }}>
                <div style={{ fontSize: 14, fontWeight: isToday || isSel ? 700 : 400, color: isToday ? C.clayDark : C.ink }}>{day}</div>
                <div style={{ display: "flex", gap: 2, height: 6 }}>
                  {evs.slice(0, 3).map((e) => <div key={e.id} style={{ width: 5, height: 5, borderRadius: "50%", background: (CAT_COLOR[e.cat] || CAT_COLOR.other)[0] }} />)}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <SectionLabel style={{ textTransform: "capitalize" }}>{fDay(parseDay(sel), lc)}</SectionLabel>
      <Card style={{ padding: "6px 14px 14px" }}>
        {selEvents.length === 0 && <div style={{ color: C.sub, fontSize: 14, padding: "10px 2px" }}>{t.noEventsDay}</div>}
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

function CalmView({ data, update, t }) {
  const [patKey, setPatKey] = useState("box");
  const [minutes, setMinutes] = useState(5);
  const [run, setRun] = useState(null); // { startedAt|null, acc, limit } — startedAt null = pauzė
  const [, setTick] = useState(0);
  const [doneMsg, setDoneMsg] = useState("");
  const phases = PATTERNS[patKey].phases;

  // fazių ciklas ir kiekvienos fazės mastelis (sulaikymas paveldi ankstesnį)
  const { cycle, scales } = useMemo(() => {
    let last = 1;
    const sc = phases.map((p) => { if (p.sc !== undefined) last = p.sc; return last; });
    return { cycle: phases.reduce((a, p) => a + p.s, 0), scales: sc };
  }, [patKey]);

  const save = (mins) => update((d) => { d.calm.push({ id: uid(), at: new Date().toISOString(), minutes: mins }); return d; });

  const elapsedOf = (r) => (r ? r.acc + (r.startedAt ? (Date.now() - r.startedAt) / 1000 : 0) : 0);

  useEffect(() => {
    if (!run || !run.startedAt) return;
    const iv = setInterval(() => {
      const el = elapsedOf(run);
      if (el >= run.limit) { save(Math.round(run.limit / 60)); setDoneMsg(t.doneMin(Math.round(run.limit / 60))); setRun(null); }
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

  const start = () => { setDoneMsg(""); setRun({ startedAt: Date.now(), acc: 0, limit: minutes * 60 }); };
  const pause = () => setRun((r) => (r && r.startedAt ? { ...r, startedAt: null, acc: elapsedOf(r) } : r));
  const resume = () => setRun((r) => (r && !r.startedAt ? { ...r, startedAt: Date.now() } : r));
  const stop = () => {
    const mins = Math.round(elapsed / 60);
    if (run && elapsed >= 60) { save(mins); setDoneMsg(t.stoppedMin(mins)); }
    setRun(null);
  };

  const now = new Date();
  const monthSessions = data.calm.filter((s) => { const d = new Date(s.at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const monthMin = monthSessions.reduce((a, s) => a + s.minutes, 0);

  return (
    <div>
      <SectionLabel style={{ marginTop: 12 }}>{t.breathing}</SectionLabel>
      <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "26px 16px", gap: 18 }}>
        <div style={{ height: 210, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: 164, height: 164, borderRadius: "50%", border: `1.5px solid ${C.clay}`, background: C.claySoft,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            transform: `scale(${run ? scales[idx] : 0.9})`, transition: `transform ${ph ? ph.s : 1}s ease-in-out`,
          }}>
            <div style={{ fontFamily: T.serif, fontSize: 21, fontWeight: 600, color: C.clayDark }}>{run && !run.startedAt ? t.paused : ph ? t[ph.l] : t.prepare}</div>
            <div style={{ fontFamily: T.serif, fontSize: 38, fontWeight: 700, lineHeight: 1.1, color: C.ink }}>{run ? left : ""}</div>
          </div>
        </div>

        {!run ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {Object.entries(PATTERNS).map(([k, p]) => <Chip key={k} active={patKey === k} onClick={() => setPatKey(k)}>{t[p.key]}</Chip>)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[2, 5, 10].map((n) => <Chip key={n} active={minutes === n} onClick={() => setMinutes(n)} color={C.sage} soft={C.sageSoft}>{n} min</Chip>)}
            </div>
            <PrimaryBtn onClick={start} style={{ maxWidth: 260 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Play size={17} /> {t.start}</span>
            </PrimaryBtn>
            {doneMsg && <div style={{ fontSize: 14, fontWeight: 600, color: C.sage }}>{doneMsg}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: C.sub }}>{t[PATTERNS[patKey].key]} · {t.remaining(Math.max(0, Math.ceil((run.limit - elapsed) / 60)))}</div>
            <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 260 }}>
              <PrimaryBtn color={C.clay} onClick={run.startedAt ? pause : resume}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {run.startedAt ? <Pause size={15} /> : <Play size={15} />} {run.startedAt ? t.pause : t.resume}
                </span>
              </PrimaryBtn>
              <PrimaryBtn color={C.red} onClick={stop}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Square size={15} /> {t.stop}</span>
              </PrimaryBtn>
            </div>
          </>
        )}
      </Card>

      <SectionLabel>{t.thisMonth}</SectionLabel>
      <Card style={{ display: "flex", gap: 12, padding: 12 }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontFamily: T.serif, fontSize: 26, fontWeight: 700, color: C.clay, lineHeight: 1.1 }}>{monthSessions.length}</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{t.sessions}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontFamily: T.serif, fontSize: 26, fontWeight: 700, color: C.sage, lineHeight: 1.1 }}>{monthMin}</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{t.minTotal}</div>
        </div>
      </Card>
      <div style={{ fontSize: 12, color: C.sub, margin: "12px 4px 0", lineHeight: 1.5 }}>{t.calmHint}</div>
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
          return <button key={n} className="press" onClick={() => onChange(n)} aria-label={`${label} ${n}`} style={{
            width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${on ? col : C.line}`,
            background: on ? col : C.white, transition: "all 120ms ease",
          }} />;
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
  const stepBtn = { width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", background: C.white };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <button className="press" onClick={() => setOffset(offset + 1)} aria-label={t.prev} style={{ padding: 8, color: C.sub }}><ChevronLeft size={20} /></button>
        <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 600, textTransform: "capitalize" }}>
          {offset === 0 ? t.todayState : fDay(day, lc)}
        </div>
        <button className="press" onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} aria-label={t.next}
          style={{ padding: 8, color: offset === 0 ? C.line : C.sub }}><ChevronRight size={20} /></button>
      </div>
      <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

// ---------- notes ----------
function NoteEditor({ note, onSave, onDelete, onClose, t }) {
  const [text, setText] = useState(note?.text || "");
  return (
    <Sheet title={note ? t.note : t.newNote} onClose={onClose} t={t}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <textarea autoFocus style={{ ...inputStyle, minHeight: 180, resize: "vertical", lineHeight: 1.6 }} placeholder={t.notePh} value={text} onChange={(e) => setText(e.target.value)} />
        <PrimaryBtn disabled={!text.trim()} onClick={() => onSave(text.trim())}>{t.save}</PrimaryBtn>
        {note && <button onClick={onDelete} style={{ color: C.red, fontWeight: 600, fontSize: 14, padding: 8 }}>{t.delNote}</button>}
      </div>
    </Sheet>
  );
}

function NotesView({ data, update, t, lc }) {
  const [editing, setEditing] = useState(undefined);
  const list = [...data.notes].sort((a, b) => new Date(b.updated) - new Date(a.updated));
  return (
    <div>
      <PrimaryBtn onClick={() => setEditing(null)} style={{ marginTop: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Plus size={17} /> {t.newNote}</span>
      </PrimaryBtn>
      <SectionLabel>{t.notesTitle}</SectionLabel>
      {list.length === 0 && <Card style={{ textAlign: "center", padding: 24, color: C.sub, fontSize: 14, lineHeight: 1.5 }}>{t.notesEmpty}</Card>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((n) => {
          const lines = n.text.split("\n");
          return (
            <Card key={n.id} style={{ padding: 14, cursor: "pointer" }}>
              <div onClick={() => setEditing(n)}>
                <div style={{ fontFamily: T.serif, fontWeight: 600, fontSize: 16, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lines[0]}</div>
                {lines.length > 1 && <div style={{ fontSize: 13, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lines.slice(1).join(" ")}</div>}
                <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>{fDateTime(n.updated, lc)}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {editing !== undefined && (
        <NoteEditor t={t} note={editing} onClose={() => setEditing(undefined)}
          onSave={(text) => {
            update((d) => {
              if (editing) d.notes = d.notes.map((x) => (x.id === editing.id ? { ...x, text, updated: new Date().toISOString() } : x));
              else d.notes.push({ id: uid(), text, updated: new Date().toISOString() });
              return d;
            });
            setEditing(undefined);
          }}
          onDelete={() => { if (editing) update((d) => { d.notes = d.notes.filter((x) => x.id !== editing.id); return d; }); setEditing(undefined); }} />
      )}
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
  const trigs = cnt(seiz.flatMap((s) => (s.triggers || []).map((x) => lbl(t.tg, x))));
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
  const sleeps = dailies.filter((e) => e.sleep != null).map((e) => e.sleep);
  const sleepAvg = avg(sleeps);
  const shortN = sleeps.filter((h) => h < 6).length;
  const stressAvg = avg(dailies.filter((e) => e.stress != null).map((e) => e.stress));
  const fatAvg = avg(dailies.filter((e) => e.fatigue != null).map((e) => e.fatigue));
  const alcoN = dailies.filter((e) => e.alcohol === true).length;
  const alcoAns = dailies.filter((e) => e.alcohol === true || e.alcohol === false).length;
  const calm = data.calm.filter((s) => new Date(s.at) >= since);
  const calmMin = calm.reduce((a, s) => a + s.minutes, 0);

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
    data.meds.forEach((m) => L.push(`  ${m.name}${m.dose ? " " + m.dose : ""} — ${m.times.join(", ")}`));
    L.push("");
  }
  if (sleepAvg != null) L.push(`${t.rSleep.toUpperCase()}: ${t.rSleepV(sleepAvg, shortN, sleeps.length)}`);
  if (stressAvg != null || fatAvg != null) L.push(`${t.rStressFat.toUpperCase()}: ${stressAvg ?? "—"} / ${fatAvg ?? "—"} ${t.rOf5}`);
  if (alcoAns) L.push(`${t.rAlco.toUpperCase()}: ${t.rDays(alcoN)}` + ` (${t.rAnswered(alcoAns, days)})`);
  if (calm.length) L.push(`${t.rCalm.toUpperCase()}: ${t.rCalmV(calm.length, calmMin)}`);
  L.push("");
  L.push(t.rFooter);
  return { text: L.join("\n"), seiz, types, trigs, effs, auraN, auraAns, auraKinds, alcoAns, adhDays, durMax, adh, taken, scheduled, sleepAvg, shortN, sleepsN: sleeps.length, stressAvg, fatAvg, alcoN, calmN: calm.length, calmMin };
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
        {r.calmN > 0 && <Stat label={t.rCalm} value={t.rCalmV(r.calmN, r.calmMin)} />}
      </Card>
      <PrimaryBtn onClick={copy} style={{ marginTop: 14 }}>{copied ? t.copied : t.copyText}</PrimaryBtn>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 10, lineHeight: 1.5 }}>{t.rNote}</div>
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
  const subject = `${t.fbSubj} — ${kinds.find((k) => k.v === kind).label}`;
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
function SettingsSheet({ data, update, onReset, onClose, onFeedback, t }) {
  const s = { name: "", overdueMin: 60, lang: "lt", notify: true, ...(data.settings || {}) };
  const setS = (k, v) => update((d) => { d.settings = { name: "", overdueMin: 60, lang: "lt", notify: true, ...(d.settings || {}), [k]: v }; return d; });
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
      <SectionLabel style={{ margin: "0 4px 8px" }}>{t.language}</SectionLabel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {LANGS.map((l) => <Chip key={l.id} active={s.lang === l.id} onClick={() => setS("lang", l.id)}>{l.name}</Chip>)}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 13 }}>
          <div style={{ color: C.sub }}>
            {t.n.diag}: <b style={{ color: pend === 0 ? C.amber : C.ink }}>{pend === null ? "—" : pend === 0 ? t.n.diagNone : pend}</b>
          </div>
          <Chip active={false} onClick={async () => setPend(await pendingCount())}>{t.n.diagRun}</Chip>
        </div>
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

      <SectionLabel>{t.fbLabel}</SectionLabel>
      <PrimaryBtn color={C.ink} onClick={onFeedback}>{t.fbBtn}</PrimaryBtn>

      <SectionLabel>{t.about}</SectionLabel>
      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{t.aboutText}</div>
    </Sheet>
  );
}

// ---------- wellbeing ----------
function WellbeingView({ data, update, t, lc }) {
  const [seg, setSeg] = useState("state");
  return (
    <div>
      <div style={{ display: "flex", gap: 4, background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, padding: 4, marginTop: 16 }}>
        {[["state", t.segState], ["calm", t.segCalm]].map(([k, l]) => (
          <button key={k} className="press" onClick={() => setSeg(k)} style={{
            flex: 1, padding: "8px 0", borderRadius: 999, fontSize: 14, fontWeight: 600,
            background: seg === k ? C.claySoft : "transparent", color: seg === k ? C.clayDark : C.sub, transition: "all 120ms ease",
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display: seg === "state" ? "block" : "none" }}><StateView data={data} update={update} t={t} lc={lc} /></div>
      <div style={{ display: seg === "calm" ? "block" : "none" }}><CalmView data={data} update={update} t={t} /></div>
    </div>
  );
}

// ---------- app shell ----------
const TABS = [
  { id: "meds", key: "tMeds", icon: Pill },
  { id: "seizures", key: "tSeiz", icon: Zap },
  { id: "calendar", key: "tCal", icon: CalendarDays },
  { id: "wellbeing", key: "tWell", icon: Activity },
  { id: "notes", key: "tNotes", icon: NotebookPen },
];

export default function App() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [tab, setTab] = useState("meds");
  const [showReport, setShowReport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [quickLog, setQuickLog] = useState(0);

  useEffect(() => {
    initStatusBar();
    (async () => {
      try {
        const p = await loadData();
        if (p) setData({ ...DEFAULT_DATA, ...p, settings: { ...DEFAULT_DATA.settings, ...(p.settings || {}) } });
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
    if (showSettings) setShowSettings(false);
    else if (showReport) setShowReport(false);
    else if (tab !== "meds") setTab("meds");
    else exitApp();
  }), [showSettings, showReport, tab]);

  // grįžus iš fono perpiešiam — kitaip po vidurnakčio rodytų vakarykštę dieną
  const [dayTick, bumpDay] = useState(0);
  useEffect(() => onResume(() => bumpDay((x) => x + 1)), []);

  const lang = data.settings?.lang || "lt";
  const t = useMemo(() => ({ ...(STR[lang] || STR.lt), n: NOTIF[lang] || NOTIF.lt }), [lang]);
  const lc = localeOf(lang);

  // priminimai perplanuojami pasikeitus vaistams, kalbai ar jungikliui,
  // ir papildomi kiekvieną grįžimą iš fono — tvarkaraštis siekia 14 d. į priekį
  const medSig = JSON.stringify(data.meds.map((m) => [m.id, m.name, m.dose, m.times]));
  const notify = data.settings?.notify !== false;
  useEffect(() => {
    if (!loaded) return;
    initChannel(t).then(() => syncMedReminders(data.meds, data.doseLog, t, notify));
  }, [loaded, medSig, lang, notify, dayTick]);

  const View = { meds: MedsView, seizures: SeizuresView, calendar: CalendarView, wellbeing: WellbeingView, notes: NotesView }[tab];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: T.body, display: "flex", justifyContent: "center" }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ width: "100%", maxWidth: 480, padding: "calc(22px + env(safe-area-inset-top)) 16px 104px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sunburst size={32} />
            <div>
              <div style={{ fontFamily: T.serif, fontSize: 26, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em" }}>Aura</div>
              <div style={{ fontSize: 12, color: C.sub }}>{t.tagline}{data.settings?.name ? ` · ${data.settings.name}` : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            <button className="press" onClick={() => setShowReport(true)} aria-label={t.report} style={{ padding: 9, borderRadius: 10, color: C.sub }}><FileText size={20} /></button>
            <button className="press" onClick={() => setShowSettings(true)} aria-label={t.settings} style={{ padding: 9, borderRadius: 10, color: C.sub }}><Cog size={20} /></button>
          </div>
        </header>
        {!storageOk && <div style={{ fontSize: 12, color: C.amber, fontWeight: 600, marginTop: 6 }}>{t.notSaved}</div>}

        {loaded ? <View data={data} update={update} t={t} lc={lc} onReport={() => setShowReport(true)} quickLog={quickLog} /> : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 90 }}>
            <div className="breathe"><Sunburst size={44} /></div>
            <div style={{ fontSize: 13, color: C.sub }}>{t.loading}</div>
          </div>
        )}

        <div style={{ fontSize: 11, color: C.sub, marginTop: 28, textAlign: "center", lineHeight: 1.5 }}>{t.disclaimer}</div>
      </div>

      {showReport && <ReportSheet data={data} t={t} onClose={() => setShowReport(false)} />}
      {showSettings && <SettingsSheet data={data} update={update} t={t} onReset={resetAll}
        onFeedback={() => { setShowSettings(false); setShowFeedback(true); }} onClose={() => setShowSettings(false)} />}
      {showFeedback && <FeedbackSheet data={data} t={t} onClose={() => setShowFeedback(false)} />}

      <div style={{
        position: "fixed", bottom: "calc(70px + env(safe-area-inset-bottom))", left: "50%",
        transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 20,
        display: "flex", justifyContent: "flex-end", pointerEvents: "none",
      }}>
        <button className="press" aria-label={t.quickLog}
          onClick={() => { setTab("seizures"); setQuickLog((x) => x + 1); }}
          style={{
            pointerEvents: "auto", marginRight: 16, width: 56, height: 56, borderRadius: "50%",
            background: C.plum, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(61,57,41,0.22)", transition: "transform 80ms ease",
          }}>
          <Zap size={25} strokeWidth={2.3} />
        </button>
      </div>

      <nav style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: C.card, borderTop: `1px solid ${C.line}`,
        display: "flex", padding: "7px 2px calc(7px + env(safe-area-inset-bottom))",
      }}>
        {TABS.map(({ id, key, icon: Icon }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} aria-current={active ? "page" : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 0", color: active ? C.clayDark : C.sub, minWidth: 0 }}>
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

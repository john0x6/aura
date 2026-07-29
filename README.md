# Aura — Capacitor migracija

Epilepsijos dienynas: vaistai, priepuoliai, kalendorius, savijauta, užrašai, ataskaita gydytojui.
Duomenys niekada nepalieka įrenginio.

## Paleidimas

```bash
npm install
npm run dev            # naršyklėje (priminimai neveiks — tai native funkcija)

npx cap add android
npm run android        # build + sync + atidaro Android Studio
```

iOS analogiškai: `npx cap add ios && npm run ios` (reikia macOS + Xcode).

## Ką reikia padaryti Android Studio pusėje

### 1. Leidimai — `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

- `POST_NOTIFICATIONS` — privalomas nuo Android 13.
- `USE_EXACT_ALARM` — leidžia tikslų laiką be atskiro vartotojo sutikimo. **Google Play tai leidžia
  tik programėlėms, kurių pagrindinė funkcija yra žadintuvai, kalendorius arba vaistų priminimai** —
  Aura patenka, bet Play Console reikės tai deklaruoti ir pagrįsti. Jei nenori rizikuoti atmetimu,
  naudok tik `SCHEDULE_EXACT_ALARM` ir nukreipk vartotoją į sistemos nustatymus.
- `RECEIVE_BOOT_COMPLETED` — kad priminimai atsistatytų po telefono perkrovimo.

### 2. Ikonos ir splash — jau sugeneruotos

`assets/` kataloge yra paruošti šaltiniai (ikona, adaptive foreground/background, splash, pranešimų
piktogramos). Sugeneruok platformų variantus:

```bash
npx @capacitor/assets generate --iconBackgroundColor '#F0EEE5' --splashBackgroundColor '#F0EEE5'
```

Pranešimų piktogramą reikia įdėti ranka — `assets/ic_stat_aura_*.png` nukopijuok į atitinkamus
`android/app/src/main/res/drawable-*dpi/ic_stat_aura.png`. Ji **balta ant permatomo fono**: spalvotą
Android paverčia baltu kvadratu.

### 3. Splash ekranas

`launchAutoHide: false` — splash slepiamas ne pagal taimerį, o `hideSplash()` iškvietimu, kai
duomenys jau nuskaityti. Kitaip vartotojas akimirką pamatytų tuščią sąrašą, kuris po to „šoktelėtų“.

## Native elgsena

- **„Atgal“ mygtukas (Android):** uždaro atidarytą lapą → grįžta į pradinį skirtuką → tik tada
  išeina. Be šito pirmas paspaudimas uždarytų programėlę su nebaigtu įrašu.
- **Grįžimas iš fono:** perpiešia sąsają. Programėlė, palikta atidaryta per naktį, kitaip rodytų
  vakarykštę dieną — „šiandien“ apskaičiuojama piešimo metu.
- **Saugios zonos:** viršus ir apačia atitraukti per `env(safe-area-inset-*)`, todėl antraštė
  nelenda po status bar'u, o navigacija — po gestų juosta.
- **Klaviatūra:** `resize: native`, kad laukai neliktų po klaviatūra.
- **Krovimo animacija:** 2,5 s ciklas (0,4 Hz). Fotosensityviems pavojinga zona prasideda ties
  3 Hz, todėl animacija sąmoningai lėta ir be ryškaus kontrasto.

## Architektūros pastabos

- **`src/storage.js`** — `@capacitor/preferences`. Tinka iki ~1 MB duomenų; tai maždaug 10+ metų
  dienyno. Peraugus — migruoti į `@capacitor-community/sqlite`, duomenų modelis (vienas JSON)
  tam paruoštas.
- **`src/notifications.js`** — priminimai perplanuojami kaskart pasikeitus vaistų sąrašui, kalbai
  ar jungikliui. Seni atšaukiami prieš planuojant naujus, todėl dublikatų nesikaupia.
- **Įrašymas debounce'intas 700 ms** su priverstiniu flush'u minimizuojant (`visibilitychange`)
  ir uždarant (`pagehide`).
- **Priepuolių tipai, trigeriai ir pasekmės saugomi ID, ne tekstais** — perjungus kalbą seni įrašai
  išsiverčia.

## Play Console — kas dar reikalinga

| Punktas | Statusas |
|---|---|
| Privatumo politikos URL | **Būtina.** Net kai duomenys lokalūs — reikia viešo puslapio. |
| Data safety forma | Lengva: "no data collected, no data shared". |
| Health apps deklaracija | Būtina. Aiškiai nurodyti, kad tai ne diagnostikos priemonė. |
| Aprašymas | Turi būti `ne medicinos prietaisas` disclaimer'is. |
| Target API | Naujoms programėlėms — API 36 (Android 16) nuo 2026-08-31. |
| 12 testuotojų × 14 d. | Taikoma asmeninėms paskyroms, sukurtoms po 2023-11-13. Organizacijos paskyra — atleista. |
| Mokestis | 25 $ vienkartinis. |

## Kas sąmoningai NEDAROMA

- **Priepuolių ar kritimo detekcija.** Naršyklės ar telefono akselerometras fone patikimai neveikia;
  netikras saugumo jausmas pavojingesnis už funkcijos nebuvimą. Tam skirti sertifikuoti įrenginiai
  (Apple Watch, Empatica Embrace2).
- **SOS / avarinė kortelė.** Android Emergency SOS ir iOS Medical ID rodo informaciją užrakintame
  ekrane — programėlė to niekada nepasieks. Vartotoją nukreipiam ten.

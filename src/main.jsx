// Šriftai bundle'inami lokaliai. Google Fonts užklausa iš sveikatos programėlės
// reikštų kreipimąsi į trečią šalį kiekvieno paleidimo metu — ir lūžtų be interneto.
// Abu turi pilną latin-ext (lt, pl) ir cyrillic (ru) padengimą.
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/literata";

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

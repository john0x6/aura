// Šriftai bundle'inami lokaliai. Google Fonts užklausa iš sveikatos programėlės
// reikštų kreipimąsi į trečią šalį kiekvieno paleidimo metu — ir lūžtų be interneto.
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

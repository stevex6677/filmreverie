import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./components/film-strip-header.css";
import "./components/film-panel.css";
import "./components/roll-editor.css";
import "./components/camera-display.css";

import { startOffline } from "./offline/client";
startOffline();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

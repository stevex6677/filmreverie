import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./components/film-strip-header.css";
import "./components/film-panel.css";
import "./components/roll-editor.css";
import "./components/camera-display.css";

import { startOffline } from "./offline/client";

// The promotional showreel is an unlinked page; it loads on demand and does
// not prepare the offline app.
const showreel = /^\/showreel\/?$/.test(window.location.pathname);
const Showreel = lazy(() => import("./showreel/Showreel"));
if (showreel) document.getElementById("darkroom-loader")?.remove();
else startOffline();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      {showreel ? <Suspense fallback={null}><Showreel /></Suspense> : <App />}
    </React.StrictMode>
  );
}

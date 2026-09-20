import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { startOffline } from "./offline/client";
import { loadModel } from '../standalone/model-viewer/model-core.js';
import { PRIMARY_CAMERA } from './data/cameras';
// Begin alongside film downloads, before the room mounts. The shelf shares
// this decoded model; failures are presented by its normal retry UI.
void loadModel(PRIMARY_CAMERA.url, PRIMARY_CAMERA.profile).catch(() => {});
startOffline();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

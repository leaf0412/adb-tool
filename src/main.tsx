import React from "react";
import ReactDOM from "react-dom/client";
import { getBridge } from "./bridge";
import App from "./App";

getBridge().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

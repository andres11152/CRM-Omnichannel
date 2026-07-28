import React from "react";
import ReactDOM from "react-dom/client";
import { registerServiceWorker } from "./hooks/usePushNotifications";

// Register the service worker at boot (not gated behind any settings page)
// so the app meets standard PWA installability criteria and the browser can
// offer its own native install affordance — no custom install UI needed.
registerServiceWorker();

import "./index.css";
import "./i18n";
import "./bones/registry";
import App from "./App";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

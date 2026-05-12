import React from "react";
import ReactDOM from "react-dom/client";

//  EMERGENCY: Kill any zombie Service Workers from previous projects/versions
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      console.log("Unregistering zombie SW:", registration);
      registration.unregister();
    }
  });
}

import "./index.css";
import "./i18n";
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

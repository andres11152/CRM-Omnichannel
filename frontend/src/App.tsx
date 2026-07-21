import React, { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "./lib/queryClient";
import { SoundProvider } from "./components/SoundContext";
import { ImpersonationHandler } from "./components/auth/ImpersonationHandler";
import { ImpersonationBanner } from "./components/auth/ImpersonationBanner.tsx";

// SECURITY: Tenant isolation and emergency logout
import { SecurityProvider } from "./context/SecurityProvider";
import { ModalProvider } from "./context/ModalContext";
import { setupAxiosInterceptors } from "./config/axiosInterceptors";

// REAL-TIME: Conversation synchronization
import { useConversationSync } from "./hooks/useConversationSync";

// ROUTING
import { AppRoutes } from "./routes/AppRoutes";
import { ServiceProvider } from "./context/ServiceContext";

const App: React.FC = () => {
  // Initialize security interceptors on app mount
  useEffect(() => {
    setupAxiosInterceptors();
    console.log("[Security] Axios interceptors configured");
  }, []);

  // REAL-TIME: Enable conversation synchronization
  useConversationSync();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* SECURITY: Wrap entire app with SecurityProvider */}
        <SecurityProvider>
          <ImpersonationHandler />
          <div className="flex flex-col h-screen w-full overflow-hidden bg-reply-bg dark:bg-reply-bg-dark">
            <ImpersonationBanner />
            <div className="flex-1 relative w-full overflow-hidden flex flex-col">
              <SoundProvider>
                <ModalProvider>
                  <ServiceProvider>
                    <AppRoutes />
                  </ServiceProvider>
                </ModalProvider>
              </SoundProvider>
            </div>
          </div>
        </SecurityProvider>
      </BrowserRouter>
      {/* React Query Devtools - Only in development */}
    </QueryClientProvider>
  );
};

export default App;

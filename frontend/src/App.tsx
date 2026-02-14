import React, { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "./lib/queryClient";
import { useAuthStore } from "./stores/authStore";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { MainLayout } from "./components/layout/MainLayout";
import { SoundProvider } from "./components/SoundContext";
import { ImpersonationHandler } from "./components/auth/ImpersonationHandler";
import { ImpersonationBanner } from "./components/auth/ImpersonationBanner.tsx";

// 🛡️ SECURITY: Tenant isolation and emergency logout
import { SecurityProvider } from "./context/SecurityProvider";
import { setupAxiosInterceptors } from "./config/axiosInterceptors";

// 🔄 REAL-TIME: Conversation synchronization
import { useConversationSync } from "./hooks/useConversationSync";

// --- PAGES & COMPONENTS (Legacy Paths) ---
import { LoginScreen } from "./components/LoginScreen";
import { ForgotPassword } from "./components/ForgotPassword";
import { ResetPassword } from "./components/ResetPassword";

import { SchemaVisualizer } from "./components/SchemaVisualizer";
import { QueueDashboard } from "./components/QueueDashboard";
import { MainDashboard } from "./components/MainDashboard";
import { MarketingDashboard } from "./components/MarketingDashboard";
import { DeveloperSettings } from "./components/DeveloperSettings";
import { IntegrationsPanel } from "./components/IntegrationsPanel";
import { TeamManager } from "./components/TeamManager";
import { FlowBuilder } from "./components/FlowBuilder/index";
import { FlowsListPage } from "./pages/FlowsListPage";
import { TenantManagement } from "./components/TenantManagement";
import { PlanManagement } from "./components/PlanManagement";
import { BillingOpsPage } from "./components/BillingOpsPage";
import { AgentWorkspace } from "./components/AgentWorkspace";
import { CompanySettings } from "./components/CompanySettings";
import { TagsManager } from "./components/TagsManager";
import { ProfileSettings } from "./components/ProfileSettings";
import { MediaLibrary } from "./components/MediaLibrary";
import { AIAgentConfig } from "./components/AIAgentConfig";
import { ContactsPage } from "./pages/ContactsPage";
import { AccountsPage } from "./pages/AccountsPage";
import { DealsPage } from "./pages/DealsPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { AnalyticsDashboard } from "./components/analytics/AnalyticsDashboard";
import { ProductCatalogView } from "./components/ProductCatalogView";
import { LoginPage as NewLoginPage } from "./pages/LoginPage"; // Import New Login Page

// --- WRAPPERS FOR LEGACY COMPONENTS ---

const LegacyLoginWrapper = () => {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleLogin = (user: any) => {
    // Legacy LoginScreen sets token in localStorage internally.
    const token = localStorage.getItem("token") || "mock-token";
    // Provide a valid user object shape or cast if legacy user matches
    login(user, token);
    navigate("/");
  };

  return (
    <LoginScreen
      onLogin={handleLogin}
      darkMode={false}
      setDarkMode={() => {}}
    />
  );
};

const DashboardWrapper = () => {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  if (!user) return null;
  // Use 'as any' to bypass strict type check for legacy component props if needed
  return (
    <MainDashboard
      role={user.role as any}
      user={user}
      onNavigate={(path: string) => navigate("/" + path)}
      onUserUpdate={() => {}}
    />
  );
};

const WorkspaceWrapper = () => {
  const user = useAuthStore((s) => s.user);
  const aiConfig = {
    companyId: user?.companyId || "comp_123",
    provider: "gemini",
    model: "gemini-2.5-flash",
    isActive: true,
    temperature: 0.7,
    systemPrompt: "Asistente Virtual",
    knowledgeBaseIds: [],
  };
  return <AgentWorkspace user={user} aiConfig={aiConfig as any} />;
};

// --- ADAPTERS FOR LEGACY NAV PROPS ---
const TenantManagementWrapper = () => {
  const navigate = useNavigate();
  return (
    <TenantManagement
      onNavigate={(tab: string) =>
        navigate(tab === "dashboard" ? "/dashboard" : "/" + tab)
      }
    />
  );
};

const PlanManagementWrapper = () => {
  const navigate = useNavigate();
  return (
    <PlanManagement onNavigateToDashboard={() => navigate("/dashboard")} />
  );
};

// --- MAIN APP ---

const App: React.FC = () => {
  // 🛡️ Initialize security interceptors on app mount
  useEffect(() => {
    setupAxiosInterceptors();
    console.log("[Security] ✅ Axios interceptors configured");
  }, []);

  // 🔄 REAL-TIME: Enable conversation synchronization
  useConversationSync();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* 🛡️ SECURITY: Wrap entire app with SecurityProvider */}
        <SecurityProvider>
          <ImpersonationHandler />
          <div className="flex flex-col h-screen w-full overflow-hidden bg-reply-bg dark:bg-reply-bg-dark">
            <ImpersonationBanner />
            <div className="flex-1 relative w-full overflow-hidden flex flex-col">
              <SoundProvider>
                <Routes>
                  {/* PUBLIC ROUTES */}
                  {/* We use the NEW LoginPage by default, but keep legacy wrapper available if needed */}
                  <Route path="/login" element={<NewLoginPage />} />
                  <Route
                    path="/login-legacy"
                    element={<LegacyLoginWrapper />}
                  />

                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route
                    path="/reset-password/:token"
                    element={<ResetPassword />}
                  />

                  {/* PROTECTED APP ROUTES */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<MainLayout />}>
                      {/* DEFAULT REDIRECT */}
                      <Route
                        path="/"
                        element={<Navigate to="/dashboard" replace />}
                      />

                      {/* MAIN MODULES */}
                      <Route path="/dashboard" element={<DashboardWrapper />} />
                      <Route path="/workspace" element={<WorkspaceWrapper />} />
                      <Route path="/contacts" element={<ContactsPage />} />
                      <Route path="/accounts" element={<AccountsPage />} />
                      <Route path="/deals" element={<DealsPage />} />
                      <Route
                        path="/products"
                        element={<ProductCatalogView />}
                      />
                      <Route path="/activities" element={<ActivitiesPage />} />
                      <Route
                        path="/analytics"
                        element={<AnalyticsDashboard />}
                      />

                      {/* COMMUNICATION & MARKETING */}
                      <Route
                        path="/marketing"
                        element={<MarketingDashboard />}
                      />
                      <Route path="/queue" element={<QueueDashboard />} />

                      {/* SETTINGS & ADMIN */}
                      <Route path="/team" element={<TeamManager />} />
                      <Route
                        path="/integrations"
                        element={<IntegrationsPanel />}
                      />
                      <Route path="/tags" element={<TagsManager />} />
                      <Route path="/media" element={<MediaLibrary />} />

                      {/* CHATBOT FLOWS (NESTED ROUTES) */}
                      <Route
                        path="/chatbot/flujos"
                        element={<FlowsListPage />}
                      />
                      <Route
                        path="/chatbot/flujos/nuevo"
                        element={<FlowBuilder />}
                      />
                      <Route
                        path="/chatbot/flujos/:id/editar"
                        element={<FlowBuilder />}
                      />

                      {/* ADVANCED SETTINGS */}
                      <Route path="/settings" element={<CompanySettings />} />
                      <Route path="/profile" element={<ProfileSettings />} />
                      <Route
                        path="/settings/developers"
                        element={<DeveloperSettings />}
                      />
                      <Route
                        path="/developers"
                        element={<DeveloperSettings />}
                      />
                      <Route path="/ai" element={<AIAgentConfig />} />

                      {/* MASTER ADMIN */}
                      <Route
                        path="/tenants"
                        element={<TenantManagementWrapper />}
                      />
                      <Route
                        path="/plans"
                        element={<PlanManagementWrapper />}
                      />
                      <Route
                        path="/plans"
                        element={<PlanManagementWrapper />}
                      />
                      <Route path="/billing" element={<BillingOpsPage />} />
                      <Route path="/schema" element={<SchemaVisualizer />} />
                    </Route>
                  </Route>

                  {/* CATCH ALL */}
                  <Route path="*" element={<Navigate to="/dashboard" />} />
                </Routes>
              </SoundProvider>
            </div>
          </div>
          {/* 🛡️ Close SecurityProvider */}
        </SecurityProvider>
      </BrowserRouter>
      {/* React Query Devtools - Only in development */}
    </QueryClientProvider>
  );
};

export default App;

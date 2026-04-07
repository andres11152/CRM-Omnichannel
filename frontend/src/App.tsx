import React, { useEffect, Suspense } from "react";
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

// SECURITY: Tenant isolation and emergency logout
import { SecurityProvider } from "./context/SecurityProvider";
import { setupAxiosInterceptors } from "./config/axiosInterceptors";

// REAL-TIME: Conversation synchronization
import { useConversationSync } from "./hooks/useConversationSync";

// --- CRITICAL PATH (Always loaded) ---
import { LoginPage as NewLoginPage } from "./pages/LoginPage";
import { ForgotPassword } from "./components/ForgotPassword";
import { ResetPassword } from "./components/ResetPassword";
import { LoginScreen } from "./components/LoginScreen";

// --- CODE-SPLIT: Lazy-loaded modules ---
// Each chunk loads only when the user navigates to that route.
// This reduces initial bundle from ~2.7MB to ~800KB.

const MainDashboard = React.lazy(() =>
  import("./components/MainDashboard").then((m) => ({
    default: m.MainDashboard,
  })),
);
const AgentWorkspace = React.lazy(() =>
  import("./components/AgentWorkspace").then((m) => ({
    default: m.AgentWorkspace,
  })),
);
const ContactsPage = React.lazy(() =>
  import("./pages/ContactsPage").then((m) => ({ default: m.ContactsPage })),
);
const AccountsPage = React.lazy(() =>
  import("./pages/AccountsPage").then((m) => ({ default: m.AccountsPage })),
);
const DealsPage = React.lazy(() =>
  import("./pages/DealsPage").then((m) => ({ default: m.DealsPage })),
);
const ProductCatalogView = React.lazy(() =>
  import("./components/ProductCatalogView").then((m) => ({
    default: m.ProductCatalogView,
  })),
);
const ActivitiesPage = React.lazy(() =>
  import("./pages/ActivitiesPage").then((m) => ({ default: m.ActivitiesPage })),
);
const AnalyticsDashboard = React.lazy(() =>
  import("./components/analytics/AnalyticsDashboard").then((m) => ({
    default: m.AnalyticsDashboard,
  })),
);
const MarketingDashboard = React.lazy(() =>
  import("./components/MarketingDashboard").then((m) => ({
    default: m.MarketingDashboard,
  })),
);
const QueueDashboard = React.lazy(() =>
  import("./components/QueueDashboard").then((m) => ({
    default: m.QueueDashboard,
  })),
);
const TeamManager = React.lazy(() =>
  import("./components/TeamManager").then((m) => ({ default: m.TeamManager })),
);
const IntegrationsPanel = React.lazy(() =>
  import("./components/IntegrationsPanel").then((m) => ({
    default: m.IntegrationsPanel,
  })),
);
const TagsManager = React.lazy(() =>
  import("./components/TagsManager").then((m) => ({ default: m.TagsManager })),
);
const MediaLibrary = React.lazy(() =>
  import("./components/MediaLibrary").then((m) => ({
    default: m.MediaLibrary,
  })),
);
const FlowsListPage = React.lazy(() =>
  import("./pages/FlowsListPage").then((m) => ({ default: m.FlowsListPage })),
);
const FlowBuilder = React.lazy(() =>
  import("./components/FlowBuilder/index").then((m) => ({
    default: m.FlowBuilder,
  })),
);
const CompanySettings = React.lazy(() =>
  import("./components/CompanySettings").then((m) => ({
    default: m.CompanySettings,
  })),
);
const ProfileSettings = React.lazy(() =>
  import("./components/ProfileSettings").then((m) => ({
    default: m.ProfileSettings,
  })),
);
const DeveloperSettings = React.lazy(() =>
  import("./components/DeveloperSettings").then((m) => ({
    default: m.DeveloperSettings,
  })),
);
const AIAgentConfig = React.lazy(() =>
  import("./components/AIAgentConfig").then((m) => ({
    default: m.AIAgentConfig,
  })),
);
const TenantManagement = React.lazy(() =>
  import("./components/TenantManagement").then((m) => ({
    default: m.TenantManagement,
  })),
);
const PlanManagement = React.lazy(() =>
  import("./components/PlanManagement").then((m) => ({
    default: m.PlanManagement,
  })),
);
const BillingOpsPage = React.lazy(() =>
  import("./components/BillingOpsPage").then((m) => ({
    default: m.BillingOpsPage,
  })),
);
const SchemaVisualizer = React.lazy(() =>
  import("./components/SchemaVisualizer").then((m) => ({
    default: m.SchemaVisualizer,
  })),
);

// --- LOADING FALLBACK ---
const PageLoader = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-400 font-medium">
        Cargando módulo...
      </span>
    </div>
  </div>
);

// --- WRAPPERS FOR LEGACY COMPONENTS ---

const LegacyLoginWrapper = () => {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleLogin = (user: import("@/types").User) => {
    const token = localStorage.getItem("token") || "mock-token";
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
  return (
    <MainDashboard
      role={user.role as import("@/types").UserRole}
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
  return (
    <AgentWorkspace
      user={user}
      aiConfig={aiConfig as import("@/types").AIConfig}
    />
  );
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
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* PUBLIC ROUTES */}
                    <Route path="/login" element={<NewLoginPage />} />
                    <Route
                      path="/login-legacy"
                      element={<LegacyLoginWrapper />}
                    />

                    <Route
                      path="/forgot-password"
                      element={<ForgotPassword />}
                    />
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
                        <Route
                          path="/dashboard"
                          element={<DashboardWrapper />}
                        />
                        <Route
                          path="/workspace"
                          element={<WorkspaceWrapper />}
                        />
                        <Route path="/contacts" element={<ContactsPage />} />
                        <Route path="/accounts" element={<AccountsPage />} />
                        <Route path="/deals" element={<DealsPage />} />
                        <Route
                          path="/products"
                          element={<ProductCatalogView />}
                        />
                        <Route
                          path="/activities"
                          element={<ActivitiesPage />}
                        />
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
                        <Route path="/billing" element={<BillingOpsPage />} />
                        <Route path="/schema" element={<SchemaVisualizer />} />
                      </Route>
                    </Route>

                    {/* CATCH ALL */}
                    <Route path="*" element={<Navigate to="/dashboard" />} />
                  </Routes>
                </Suspense>
              </SoundProvider>
            </div>
          </div>
          {/* Close SecurityProvider */}
        </SecurityProvider>
      </BrowserRouter>
      {/* React Query Devtools - Only in development */}
    </QueryClientProvider>
  );
};

export default App;

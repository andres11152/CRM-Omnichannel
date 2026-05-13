import React, { Suspense } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/stores/authStore";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageSkeleton } from "@/components/ui/Skeleton";

// --- CRITICAL PATH (Always loaded) ---
import { LoginPage as NewLoginPage } from "@/pages/LoginPage";
import { ForgotPassword } from "@/components/ForgotPassword";
import { ResetPassword } from "@/components/ResetPassword";
import { LoginScreen } from "@/components/LoginScreen";

// --- CODE-SPLIT: Lazy-loaded modules ---
const MainDashboard = React.lazy(() => import("@/components/MainDashboard").then(m => ({ default: m.MainDashboard })));
const AgentWorkspace = React.lazy(() => import("@/components/AgentWorkspace").then(m => ({ default: m.AgentWorkspace })));
const ContactsPage = React.lazy(() => import("@/pages/ContactsPage").then(m => ({ default: m.ContactsPage })));
const AccountsPage = React.lazy(() => import("@/pages/AccountsPage").then(m => ({ default: m.AccountsPage })));
const DealsPage = React.lazy(() => import("@/pages/DealsPage").then(m => ({ default: m.DealsPage })));
const ProductCatalogView = React.lazy(() => import("@/components/ProductCatalogView").then(m => ({ default: m.ProductCatalogView })));
const ActivitiesPage = React.lazy(() => import("@/pages/ActivitiesPage").then(m => ({ default: m.ActivitiesPage })));
const AnalyticsDashboard = React.lazy(() => import("@/components/analytics/AnalyticsDashboard").then(m => ({ default: m.AnalyticsDashboard })));
const MarketingDashboard = React.lazy(() => import("@/components/MarketingDashboard").then(m => ({ default: m.MarketingDashboard })));
const QueueDashboard = React.lazy(() => import("@/components/QueueDashboard").then(m => ({ default: m.QueueDashboard })));
const TeamManager = React.lazy(() => import("@/components/TeamManager").then(m => ({ default: m.TeamManager })));
const IntegrationsPanel = React.lazy(() => import("@/components/IntegrationsPanel").then(m => ({ default: m.IntegrationsPanel })));
const TagsManager = React.lazy(() => import("@/components/TagsManager").then(m => ({ default: m.TagsManager })));
const MediaLibrary = React.lazy(() => import("@/components/MediaLibrary").then(m => ({ default: m.MediaLibrary })));
const FlowsListPage = React.lazy(() => import("@/pages/FlowsListPage").then(m => ({ default: m.FlowsListPage })));
const FlowBuilder = React.lazy(() => import("@/components/FlowBuilder/index").then(m => ({ default: m.FlowBuilder })));
const CompanySettings = React.lazy(() => import("@/components/CompanySettings").then(m => ({ default: m.CompanySettings })));
const ProfileSettings = React.lazy(() => import("@/components/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const DeveloperSettings = React.lazy(() => import("@/components/DeveloperSettings").then(m => ({ default: m.DeveloperSettings })));
const AIAgentConfig = React.lazy(() => import("@/components/AIAgentConfig").then(m => ({ default: m.AIAgentConfig })));
const TenantManagement = React.lazy(() => import("@/components/TenantManagement").then(m => ({ default: m.TenantManagement })));
const PlanManagement = React.lazy(() => import("@/components/PlanManagement").then(m => ({ default: m.PlanManagement })));
const BillingOpsPage = React.lazy(() => import("@/components/BillingOpsPage").then(m => ({ default: m.BillingOpsPage })));
const SchemaVisualizer = React.lazy(() => import("@/components/SchemaVisualizer").then(m => ({ default: m.SchemaVisualizer })));
const GlobalAuditLog = React.lazy(() => import("@/components/admin/GlobalAuditLog").then(m => ({ default: m.GlobalAuditLog })));
const SystemDeepMonitor = React.lazy(() => import("@/components/admin/SystemDeepMonitor").then(m => ({ default: m.SystemDeepMonitor })));
const FeatureFlagManager = React.lazy(() => import("@/components/admin/FeatureFlagManager").then(m => ({ default: m.FeatureFlagManager })));
const GlobalTemplateMarketplace = React.lazy(() => import("@/components/admin/GlobalTemplateMarketplace").then(m => ({ default: m.GlobalTemplateMarketplace })));
const EmailInbox = React.lazy(() => import("@/components/EmailInbox").then(m => ({ default: m.EmailInbox })));
const NotFoundPage = React.lazy(() => import("@/pages/NotFoundPage").then(m => ({ default: m.NotFoundPage })));

// --- LOADING FALLBACK ---
const PageLoader = () => <PageSkeleton />;

// --- WRAPPERS FOR LEGACY COMPONENTS ---
const LegacyLoginWrapper = () => {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleLogin = (user: import("@/types").User) => {
    const token = localStorage.getItem("token") || "mock-token";
    login(user, token);
    navigate("/");
  };

  return <LoginScreen onLogin={handleLogin} darkMode={false} setDarkMode={() => {}} />;
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
  return <AgentWorkspace user={user} aiConfig={aiConfig as import("@/types").AIConfig} />;
};

const TenantManagementWrapper = () => {
  const navigate = useNavigate();
  return <TenantManagement onNavigate={(tab: string) => navigate(tab === "dashboard" ? "/dashboard" : "/" + tab)} />;
};

const PlanManagementWrapper = () => {
  const navigate = useNavigate();
  return <PlanManagement onNavigateToDashboard={() => navigate("/dashboard")} />;
};

const EmailInboxWrapper = () => {
  return <EmailInbox />;
};

// --- APP ROUTES ---
export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/login" element={<NewLoginPage />} />
        <Route path="/login-legacy" element={<LegacyLoginWrapper />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* PROTECTED APP ROUTES */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            {/* DEFAULT REDIRECT */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* MAIN MODULES */}
            <Route path="/dashboard" element={<DashboardWrapper />} />
            <Route path="/workspace" element={<WorkspaceWrapper />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/products" element={<ProductCatalogView />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />

            {/* COMMUNICATION & MARKETING */}
            <Route path="/email" element={<EmailInboxWrapper />} />
            <Route path="/marketing" element={<MarketingDashboard />} />
            <Route path="/queue" element={<QueueDashboard />} />

            {/* SETTINGS & ADMIN */}
            <Route path="/team" element={<TeamManager />} />
            <Route path="/integrations" element={<IntegrationsPanel />} />
            <Route path="/tags" element={<TagsManager />} />
            <Route path="/media" element={<MediaLibrary />} />

            {/* CHATBOT FLOWS (NESTED ROUTES) */}
            <Route path="/chatbot/flujos" element={<FlowsListPage />} />
            <Route path="/chatbot/flujos/nuevo" element={<FlowBuilder />} />
            <Route path="/chatbot/flujos/:id/editar" element={<FlowBuilder />} />

            {/* ADVANCED SETTINGS */}
            <Route path="/settings" element={<CompanySettings />} />
            <Route path="/profile" element={<ProfileSettings />} />
            <Route path="/settings/developers" element={<DeveloperSettings />} />
            <Route path="/developers" element={<DeveloperSettings />} />
            <Route path="/ai" element={<AIAgentConfig />} />

            {/* MASTER ADMIN */}
            <Route path="/tenants" element={<TenantManagementWrapper />} />
            <Route path="/plans" element={<PlanManagementWrapper />} />
            <Route path="/billing" element={<BillingOpsPage />} />
            <Route path="/schema" element={<SchemaVisualizer />} />
            <Route path="/audit" element={<GlobalAuditLog />} />
            <Route path="/system/health" element={<SystemDeepMonitor />} />
            <Route path="/system/flags" element={<FeatureFlagManager />} />
            <Route path="/system/marketplace" element={<GlobalTemplateMarketplace />} />
          </Route>
        </Route>

        {/* CATCH ALL - PREMIUM 404 EXPERIENCE */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

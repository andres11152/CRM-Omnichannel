import React from "react";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  MessageSquare,
  Mail,
  Users,
  Briefcase,
  DollarSign,
  Home,
  Package,
  Calendar,
  Image,
  Link as LinkIcon,
  ListOrdered,
  Megaphone,
  Bot,
  Tag,
  Code,
  BrainCircuit,
  Database,
  BarChart3,
  TrendingUp,
  Settings,
  Receipt,
  Shield,
  Cpu,
  Flag,
  ShoppingBag,
  LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  title: string;
  path: string;
  // Icon is now a Lucide Component, passing generic React Node
  icon: React.ReactNode;
  allowedRoles: (
    | "master"
    | "company_admin"
    | "agent"
    | "MASTER"
    | "ADMIN"
    | "AGENT"
  )[];
  masterOnly?: boolean;
  agentOnly?: boolean;
  disabled?: boolean;
  badge?: string;
  // Company-level feature flag gating this module server-side (see
  // backend/src/middleware/requireFeature.ts). When set and the flag is
  // off for the tenant, MainLayout greys the item out instead of letting
  // the user click into a page that will just 403.
  requiredFlag?:
    | "advanced_ai"
    | "email_module"
    | "bulk_marketing"
    | "api_access"
    | "group_sync"
    | "kanban_deals"
    | "voice_messages"
    | "automation_flows"
    | "team_collaboration";
}

// Helper to render icon consistently with stroke width
const Icon = ({ I }: { I: LucideIcon }) => <I size={24} strokeWidth={1.5} />;

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    title: "Panel de Control",
    path: "/dashboard",
    allowedRoles: [
      "master",
      "company_admin",
      "agent",
      "MASTER",
      "ADMIN",
      "AGENT",
    ],
    icon: <Icon I={LayoutDashboard} />,
  },
  {
    id: "workspace",
    title: "Bandeja de Entrada",
    path: "/workspace",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={MessageSquare} />,
  },
  {
    id: "email",
    title: "Email",
    path: "/email",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Mail} />,
  },
  {
    id: "contacts",
    title: "Contactos",
    path: "/contacts",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Users} />,
  },
  {
    id: "accounts",
    title: "Empresas",
    path: "/accounts",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Building2} />,
  },
  {
    id: "deals",
    title: "Oportunidades",
    path: "/deals",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={DollarSign} />,
  },
  {
    id: "properties",
    title: "Propiedades",
    path: "/properties",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Home} />,
  },
  {
    id: "activities",
    title: "Actividades",
    path: "/activities",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Calendar} />,
  },
  {
    id: "products",
    title: "Catálogo",
    path: "/products",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Package} />,
  },
  {
    id: "marketing",
    title: "Campañas",
    path: "/marketing",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Megaphone} />,
    requiredFlag: "bulk_marketing",
  },
  {
    id: "flows",
    title: "Chatbots",
    path: "/chatbot/flujos",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Bot} />,
    requiredFlag: "automation_flows",
  },
  {
    id: "queue",
    title: "Enrutamiento",
    path: "/queue",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={ListOrdered} />,
  },
  {
    id: "analytics",
    title: "Analítica",
    path: "/analytics",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={BarChart3} />,
  },
  {
    id: "sales-reports",
    title: "Reportes de Ventas",
    path: "/sales-reports",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={TrendingUp} />,
  },
  {
    id: "ai",
    title: "Agentes IA",
    path: "/ai",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={BrainCircuit} />,
    requiredFlag: "advanced_ai",
  },
  {
    id: "team",
    title: "Equipo",
    path: "/team",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Users} />,
  },
  {
    id: "integrations",
    title: "Integraciones",
    path: "/integrations",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={LinkIcon} />,
  },
  {
    id: "media",
    title: "Archivos",
    path: "/media",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Image} />,
  },
  {
    id: "tags",
    title: "Etiquetas",
    path: "/tags",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Tag} />,
  },
  // --- MASTER & DEV ---
  {
    id: "tenants",
    title: "Empresas",
    path: "/tenants",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={Building2} />,
  },
  {
    id: "plans",
    title: "Planes",
    path: "/plans",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={CreditCard} />,
  },
  {
    id: "billing",
    title: "Facturación",
    path: "/billing",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={Receipt} />,
  },
  {
    id: "schema",
    title: "Base de Datos",
    path: "/schema",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={Database} />,
  },
  {
    id: "audit",
    title: "Auditoría",
    path: "/audit",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={Shield} />,
  },
  {
    id: "system-health",
    title: "Infraestructura",
    path: "/system/health",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={Cpu} />,
  },
  {
    id: "feature-flags",
    title: "Feature Flags",
    path: "/system/flags",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={Flag} />,
  },
  {
    id: "marketplace",
    title: "Marketplace Maestro",
    path: "/system/marketplace",
    allowedRoles: ["master", "MASTER"],
    masterOnly: true,
    icon: <Icon I={ShoppingBag} />,
  },
  {
    id: "developers",
    title: "API & Devs",
    path: "/developers",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Code} />,
  },
  {
    id: "settings",
    title: "Configuración",
    path: "/settings",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Settings} />,
  },
];

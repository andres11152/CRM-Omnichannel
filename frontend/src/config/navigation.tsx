import React from "react";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  MessageSquare,
  Users,
  Briefcase,
  DollarSign,
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
  Settings,
  Receipt,
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
    id: "activities",
    title: "Actividades",
    path: "/activities",
    allowedRoles: ["company_admin", "agent", "ADMIN", "AGENT"],
    icon: <Icon I={Calendar} />,
  },
  {
    id: "products",
    title: "Catlogo",
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
  },
  {
    id: "flows",
    title: "Chatbots",
    path: "/chatbot/flujos",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Bot} />,
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
    id: "ai",
    title: "Agentes IA",
    path: "/ai",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={BrainCircuit} />,
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
  {
    id: "settings",
    title: "Configuración",
    path: "/settings",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Settings} />,
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
    id: "developers",
    title: "API & Devs",
    path: "/developers",
    allowedRoles: ["company_admin", "ADMIN"],
    icon: <Icon I={Code} />,
  },
];

import {
  Wallet,
  Users,
  Handshake,
  UserCheck,
  ShoppingCart,
  Clock,
  CalendarDays,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type AppModule = Database["public"]["Enums"]["app_module"];
export type ModuleStatus = Database["public"]["Enums"]["module_status"];

export interface ModuleDefinition {
  slug: AppModule;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  entryRoute: string;
  available: boolean; // se o módulo já tem implementação minimamente utilizável
  /** Módulo vendido separadamente (unidade comercial). */
  sellable?: boolean;
  /** Módulo pai — usado para agrupar submódulos no backoffice. */
  parent?: AppModule;
  /** Pré-requisitos declarados (espelho de module_dependencies, só para UI). */
  requires?: AppModule[];
}


export const MODULES: ModuleDefinition[] = [
  {
    slug: "financeiro",
    name: "Financeiro 360°",
    shortName: "Financeiro",
    description: "Fluxo de caixa, lançamentos, orçamento e relatórios contábeis.",
    icon: Wallet,
    entryRoute: "/dashboard",
    available: true,
  },
  {
    slug: "dp",
    name: "Pessoas 360°",
    shortName: "Pessoas",
    description: "Departamento pessoal: colaboradores, solicitações e documentos.",
    icon: Users,
    entryRoute: "/dp",
    available: true,
    sellable: true,
  },
  {
    slug: "ponto",
    name: "Ponto 360°",
    shortName: "Ponto",
    description: "Registro de ponto, espelho, ajustes e apuração de horas.",
    icon: Clock,
    entryRoute: "/dp/ponto",
    available: true,
    sellable: true,
    parent: "dp",
    requires: ["dp"],
  },
  {
    slug: "escala",
    name: "Escala 360°",
    shortName: "Escala",
    description: "Gerador de escalas, turnos, folgas e convocações.",
    icon: CalendarDays,
    entryRoute: "/dp/escalas",
    available: true,
    sellable: true,
    parent: "dp",
    requires: ["dp"],
  },
  {
    slug: "folha",
    name: "Folha 360°",
    shortName: "Folha",
    description: "Folha de pagamento, provisões, rescisão e holerite.",
    icon: Receipt,
    entryRoute: "/dp/folha",
    available: true,
    sellable: true,
    parent: "dp",
    requires: ["dp", "ponto"],
  },
  {
    slug: "crm",
    name: "CRM 360°",
    shortName: "CRM",
    description: "Gestão de clientes, oportunidades e funil de vendas.",
    icon: Handshake,
    entryRoute: "/crm",
    available: false,
  },
  {
    slug: "rh",
    name: "RH 360°",
    shortName: "RH",
    description: "Recrutamento, avaliações e desenvolvimento de pessoas.",
    icon: UserCheck,
    entryRoute: "/rh",
    available: false,
  },
  {
    slug: "pedidos",
    name: "Pedidos 360°",
    shortName: "Pedidos",
    description: "Gestão de pedidos, entregas e integração com balcão/delivery.",
    icon: ShoppingCart,
    entryRoute: "/pedidos",
    available: true,
    sellable: true,
  },
];

export const MODULE_BY_SLUG: Record<AppModule, ModuleDefinition> = Object.fromEntries(
  MODULES.map((m) => [m.slug, m]),
) as Record<AppModule, ModuleDefinition>;

/** Módulos comercializáveis individualmente (backoffice / contratação). */
export const SELLABLE_MODULES: ModuleDefinition[] = MODULES.filter((m) => m.sellable);

/** Submódulos vendáveis do DP. */
export const DP_SUBMODULES: AppModule[] = ["ponto", "escala", "folha"];


export function statusLabel(status: ModuleStatus): string {
  switch (status) {
    case "active": return "Ativo";
    case "trial": return "Trial";
    case "suspended": return "Suspenso";
    case "canceled": return "Cancelado";
    case "not_contracted": return "Não contratado";
    case "trial_expirado": return "Trial expirado";
    default:
      return String(status);
  }
}

export function isModuleUsable(status: ModuleStatus | undefined): boolean {
  return status === "active" || status === "trial";
}

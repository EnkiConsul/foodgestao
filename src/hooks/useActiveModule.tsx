import { useLocation } from "react-router-dom";

export type ActiveModule =
  | "hub"
  | "financeiro"
  | "dp"
  | "portal_colaborador"
  | "crm"
  | "rh"
  | "pedidos"
  | "admin";

export function useActiveModule(): ActiveModule {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/dp/meu")) return "portal_colaborador";
  if (pathname.startsWith("/dp")) return "dp";
  if (pathname.startsWith("/crm")) return "crm";
  if (pathname.startsWith("/rh")) return "rh";
  if (pathname.startsWith("/pedidos")) return "pedidos";
  if (pathname.startsWith("/hub")) return "hub";
  return "financeiro";
}

export const MODULE_LABEL: Record<ActiveModule, string> = {
  hub: "Hub",
  financeiro: "Financeiro 360°",
  dp: "DP 360°",
  portal_colaborador: "Portal do Colaborador",
  crm: "CRM 360°",
  rh: "RH 360°",
  pedidos: "Pedidos 360°",
  admin: "Backoffice",
};

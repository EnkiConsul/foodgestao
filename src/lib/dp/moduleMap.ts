// Mapa rota → módulo vendável do DP.
// Fonte única para, numa etapa futura, aplicar o gate de contratação por rota.
// Nada aqui bloqueia telas: é apenas a classificação comercial das rotas.
import type { AppModule } from "@/lib/modules";

export interface DpRouteModuleRule {
  /** Prefixo da rota (match por igualdade ou por "prefixo/"). */
  prefix: string;
  module: AppModule;
}

/**
 * Ordem importa: o primeiro match mais específico ganha.
 * Rotas do DP não listadas pertencem ao DP base (`dp`), que é obrigatório.
 */
export const DP_ROUTE_MODULES: DpRouteModuleRule[] = [
  // Ponto
  { prefix: "/dp/ponto", module: "ponto" },
  { prefix: "/dp/meu/ponto", module: "ponto" },

  // Escala / gerador de escala
  { prefix: "/dp/escalas", module: "escala" },
  { prefix: "/dp/escala", module: "escala" },
  { prefix: "/dp/operacao", module: "escala" },
  { prefix: "/dp/turnos", module: "escala" },
  { prefix: "/dp/jornadas", module: "escala" },
  { prefix: "/dp/folgas", module: "escala" },
  { prefix: "/dp/trocas", module: "escala" },
  { prefix: "/dp/convocacoes", module: "escala" },
  { prefix: "/dp/cobertura", module: "escala" },
  { prefix: "/dp/bloqueios", module: "escala" },
  { prefix: "/dp/meu/escala", module: "escala" },

  // Folha de pagamento
  { prefix: "/dp/folha", module: "folha" },
  { prefix: "/dp/rescisoes", module: "folha" },
  { prefix: "/dp/beneficios", module: "folha" },
  { prefix: "/dp/meu/contracheque", module: "folha" },

];

/**
 * Módulos temporariamente pausados: as telas seguem no código e nas rotas,
 * mas exibem a máscara "Módulo em desenvolvimento".
 * Para liberar um módulo, basta removê-lo desta lista.
 */
export const MODULOS_EM_DESENVOLVIMENTO: AppModule[] = ["ponto", "folha"];

/**
 * Rotas pausadas individualmente (não pertencem a um módulo comercial pausado).
 * Para liberar, remova a rota desta lista.
 */
export const ROTAS_EM_DESENVOLVIMENTO: string[] = ["/dp/conformidade"];

export function isModuleEmDesenvolvimento(module: AppModule): boolean {
  return MODULOS_EM_DESENVOLVIMENTO.includes(module);
}

/** A rota está pausada individualmente? */
export function isRotaEmDesenvolvimento(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ROTAS_EM_DESENVOLVIMENTO.some(
    (rota) => path === rota || path.startsWith(`${rota}/`),
  );
}

/** A rota pertence a um módulo pausado (ou está pausada individualmente)? */
export function isDpRouteEmDesenvolvimento(pathname: string): boolean {
  return (
    isRotaEmDesenvolvimento(pathname) ||
    isModuleEmDesenvolvimento(moduleForDpRoute(pathname))
  );
}


/** Retorna o módulo vendável responsável por uma rota do DP. */
export function moduleForDpRoute(pathname: string): AppModule {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = [...DP_ROUTE_MODULES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((rule) => path === rule.prefix || path.startsWith(`${rule.prefix}/`));
  return match?.module ?? "dp";
}

/** Chave de operação padrão usada pelo motor de entitlement. */
export function dpOperationForRoute(pathname: string, action: "view" | "manage" = "view"): string {
  const mod = moduleForDpRoute(pathname);
  return action === "view" ? `${mod}.dashboard` : `${mod}.manage`;
}

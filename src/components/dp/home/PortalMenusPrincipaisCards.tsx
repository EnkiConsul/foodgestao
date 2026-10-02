import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { DP_PORTAL_NAV } from "@/config/dpNavigation";
import { applyMenuLayout } from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { distribuirLinhas } from "@/lib/dp/menuGridRows";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const FORMATOS = [5, 4, 3] as const;
type Cols = (typeof FORMATOS)[number];

/**
 * Atalhos para os menus principais do Portal do Colaborador — primeiros
 * itens do Início no celular, na mesma ordem do menu do usuário. Mesmo
 * padrão visual dos atalhos do gestor (5x1, 4x1 ou 3x1 por linha), com a
 * escolha salva nas preferências por usuário/empresa.
 */
export function PortalMenusPrincipaisCards() {
  const { layout } = useDpMenuLayout("portal");
  const { prefs, save } = useDpUserPrefs();
  const cols = ((): Cols => {
    const v = (prefs?.extras as any)?.portal_atalhos_cols;
    return FORMATOS.includes(v) ? (v as Cols) : 5;
  })();

  const grupos = useMemo(() => {
    return (layout ? applyMenuLayout(DP_PORTAL_NAV, layout) : DP_PORTAL_NAV).groups;
  }, [layout]);

  const linhas = useMemo(
    () => distribuirLinhas(grupos.length, cols),
    [grupos.length, cols],
  );

  const densidade =
    cols === 5
      ? { icon: "h-8 w-8", iconSize: "h-4 w-4", label: "text-[10px]", gap: "gap-1", largura: "w-[calc(20%-5px)]" }
      : cols === 4
        ? { icon: "h-10 w-10", iconSize: "h-5 w-5", label: "text-[11px]", gap: "gap-1.5", largura: "w-[calc(25%-5px)]" }
        : { icon: "h-11 w-11", iconSize: "h-5 w-5", label: "text-xs", gap: "gap-2", largura: "w-[calc(33.333%-6px)]" };

  let offset = 0;

  return (
    <div>
      <div className="flex justify-end mb-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-0.5 rounded-full bg-muted/60 px-2 h-5 text-[10px] font-medium text-muted-foreground"
              aria-label="Ícones por linha"
            >
              {cols}x1
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-0">
            {FORMATOS.map((n) => (
              <DropdownMenuItem
                key={n}
                onSelect={() =>
                  save({ extras: { ...(prefs?.extras ?? {}), portal_atalhos_cols: n } })
                }
                className={cn("text-xs", cols === n && "font-semibold text-primary")}
              >
                {n}x1 — {n} ícones por linha
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-1.5">
        {linhas.map((tamanho, li) => {
          const itens = grupos.slice(offset, offset + tamanho);
          offset += tamanho;
          return (
            <div key={li} className="flex justify-center gap-1.5">
              {itens.map((g) => (
                <Link
                  key={g.id}
                  to={g.hubTo ?? g.items[0]?.to ?? "/dp/meu"}
                  className={cn(
                    "flex flex-col items-center rounded-xl py-1.5 px-1 active:scale-[0.96] transition-transform",
                    densidade.gap,
                    densidade.largura,
                  )}
                >
                  <span className={cn("shrink-0 rounded-lg bg-primary/10 flex items-center justify-center", densidade.icon)}>
                    <g.icon className={cn("text-primary", densidade.iconSize)} />
                  </span>
                  <span className={cn("font-medium text-center leading-tight line-clamp-2", densidade.label)}>{g.label}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

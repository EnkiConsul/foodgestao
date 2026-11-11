import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { jornadaDaFicha, type FichaItem } from "@/hooks/useDpFichaImportacao";
import { useDpSalarioCargoResolver } from "@/hooks/useDpSalarioCargoResolver";
import { inferirFormaPagamento } from "@/lib/dp/ficha-registro/inferencia";
import {
  pendenciasFichaLote, vinculoOrganizado, type OrganizacaoLote, type PadroesLote,
} from "@/lib/dp/ficha-registro/organizacao-lote";
import { cn } from "@/lib/utils";

type Filtro = "todas" | "pronta" | "atencao" | "concluida";

const ROTULO: Record<string, { texto: string; classe: string }> = {
  pronta: { texto: "Pronta", classe: "border-primary/40 bg-primary/10 text-primary" },
  atencao: { texto: "Atenção", classe: "border-warning/50 bg-warning/15 text-warning-foreground" },
  concluida: { texto: "No cadastro", classe: "border-success/40 bg-success/10 text-success" },
  ignorada: { texto: "Ignorada", classe: "border-border bg-muted text-muted-foreground" },
};

const brl = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;
};

interface Props {
  itens: FichaItem[];
  organizacao: OrganizacaoLote | null;
  cargos: Array<{ id: string; nome: string }>;
  setores: Array<{ id: string; nome: string }>;
  /** Padrões da maioria (vínculo, adiantamento, ponto da unidade) usados na situação de cada ficha. */
  padroes: PadroesLote;
  unidadeId: string | null;
  onAbrir: (itemId: string) => void;
}

const lista = (xs: string[], max = 4) => {
  const v = xs.slice(0, max);
  const resto = xs.length - v.length;
  const base = v.length > 1 ? `${v.slice(0, -1).join(", ")} e ${v[v.length - 1]}` : v[0] ?? "";
  return resto > 0 ? `${base} e mais ${resto}` : base;
};

/** Etapa 3: lista enxuta do lote; cada pessoa abre a conferência completa numa janela. */
export function FichaLoteLista({ itens, organizacao, cargos, setores, padroes, unidadeId, onAbrir }: Props) {
  const salarioCargoDe = useDpSalarioCargoResolver();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");

  const linhas = useMemo(
    () =>
      itens.map((item, idx) => {
        const d = (item.dados_extraidos ?? {}) as Record<string, unknown>;
        const v = vinculoOrganizado(item, organizacao);
        const concluida = item.status === "criado" || item.status === "atualizado";
        const pend = pendenciasFichaLote(item, organizacao, {
          padroes,
          formaPagamento: inferirFormaPagamento(d, jornadaDaFicha(d)),
          salarioCargo: salarioCargoDe(v?.cargoId ?? null, unidadeId),
          exigirSetor: setores.length > 0,
        });
        const situacao = concluida ? "concluida" : item.status === "ignorado" ? "ignorada" : pend.obrigatorias.length ? "atencao" : "pronta";
        return {
          item,
          posicao: idx + 1,
          nome: String(d.nome ?? item.nome_extraido ?? "Ficha sem nome"),
          cargo: cargos.find((c) => c.id === v?.cargoId)?.nome ?? (d.cargo_nome ? String(d.cargo_nome) : null),
          cargoDecidido: !!v?.cargoId,
          setor: setores.find((s) => s.id === v?.setorId)?.nome ?? null,
          salario: brl(d.salario),
          situacao,
          obrigatorias: situacao === "atencao" ? pend.obrigatorias : [],
          complementares: situacao === "atencao" || situacao === "pronta" ? pend.complementares : [],
        };
      }),
    [itens, organizacao, cargos, setores, padroes, unidadeId, salarioCargoDe],
  );

  const contagem = useMemo(() => {
    const c = { todas: linhas.length, pronta: 0, atencao: 0, concluida: 0 };
    for (const l of linhas) if (l.situacao in c) c[l.situacao as Exclude<Filtro, "todas">] += 1;
    return c;
  }, [linhas]);

  const termo = busca.trim().toLowerCase();
  const visiveis = linhas.filter(
    (l) =>
      (filtro === "todas" || l.situacao === filtro) &&
      (!termo || l.nome.toLowerCase().includes(termo) || (l.cargo ?? "").toLowerCase().includes(termo)),
  );

  const FILTROS: Array<{ id: Filtro; label: string }> = [
    { id: "todas", label: "Todas" },
    { id: "pronta", label: "Prontas" },
    { id: "atencao", label: "Atenção" },
    { id: "concluida", label: "No cadastro" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-xl border bg-card p-1" role="tablist" aria-label="Filtrar fichas">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={cn(
              "flex min-h-10 flex-col items-center justify-center rounded-lg px-1 text-[11px] font-medium leading-tight sm:flex-row sm:gap-1 sm:text-sm",
              filtro === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="truncate">{f.label}</span>
            <span className="tabular-nums">({contagem[f.id]})</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Buscar por nome ou cargo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {visiveis.map((l) => {
          const r = ROTULO[l.situacao];
          return (
            <li key={l.item.id}>
              <button
                type="button"
                onClick={() => onAbrir(l.item.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
              >
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{l.posicao}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[l.cargoDecidido ? l.cargo : l.cargo ? `${l.cargo} (sem cargo definido)` : "Sem cargo", l.setor, l.salario]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {l.obrigatorias.length > 0 && (
                    <span className="block truncate text-xs font-medium text-warning-foreground">
                      Falta definir: {lista(l.obrigatorias)}
                    </span>
                  )}
                  {l.complementares.length > 0 && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      Não veio na ficha: {lista(l.complementares)}
                    </span>
                  )}
                </span>
                <Badge variant="outline" className={cn("shrink-0 text-[11px]", r.classe)}>{r.texto}</Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
        {visiveis.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma ficha neste filtro.</li>
        )}
      </ul>
    </div>
  );
}

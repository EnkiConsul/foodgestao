import { useMemo, useState } from "react";
import { CheckSquare, ChevronRight, KeyRound, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { jornadaDaFicha, type FichaItem } from "@/hooks/useDpFichaImportacao";
import { useDpSalarioCargoResolver } from "@/hooks/useDpSalarioCargoResolver";
import { inferirFormaPagamento } from "@/lib/dp/ficha-registro/inferencia";
import {
  dadosDaFichaLote, pendenciasFichaLote, setoresDoLote, situacaoPorPendencias, vinculoOrganizado,
  type OrganizacaoLote, type PadroesLote, type SituacaoFichaLote, STATUS_PENDENTES,
} from "@/lib/dp/ficha-registro/organizacao-lote";
import { cn } from "@/lib/utils";

type Filtro = "todas" | "pronta" | "atencao" | "concluida";

const ROTULO: Record<SituacaoFichaLote, { texto: string; classe: string }> = {
  pronta: { texto: "Pronta", classe: "border-primary/40 bg-primary/10 text-primary" },
  atencao: { texto: "Atenção", classe: "border-warning/50 bg-warning/15 text-warning-foreground" },
  acesso: { texto: "Dados de acesso", classe: "border-warning/50 bg-warning/10 text-warning-foreground" },
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
  /** Abre "Padrões do lote" já no modo de pessoas escolhidas, com estas fichas marcadas. */
  onAplicarMarcadas: (itemIds: string[]) => void;
  /** Abre a lista rápida de dados para acesso (opcionalmente focando uma ficha). */
  onPreencherContatos: (focoId: string | null) => void;
}

const lista = (xs: string[], max = 4) => {
  const v = xs.slice(0, max);
  const resto = xs.length - v.length;
  const base = v.length > 1 ? `${v.slice(0, -1).join(", ")} e ${v[v.length - 1]}` : v[0] ?? "";
  return resto > 0 ? `${base} e mais ${resto}` : base;
};

/** Etapa 3: lista enxuta do lote, com atalhos por setor, ação em grupo e contato rápido. */
export function FichaLoteLista({
  itens, organizacao, cargos, setores, padroes, unidadeId, onAbrir, onAplicarMarcadas, onPreencherContatos,
}: Props) {
  const salarioCargoDe = useDpSalarioCargoResolver();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [setorFiltro, setSetorFiltro] = useState<string | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [selecionando, setSelecionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const linhas = useMemo(
    () =>
      itens.map((item, idx) => {
        const d = dadosDaFichaLote(item, organizacao);
        const v = vinculoOrganizado(item, organizacao);
        const concluida = item.status === "criado" || item.status === "atualizado";
        const pend = pendenciasFichaLote(item, organizacao, {
          padroes,
          formaPagamento: inferirFormaPagamento(d, jornadaDaFicha(d)),
          salarioCargo: salarioCargoDe(v?.cargoId ?? null, unidadeId),
          exigirSetor: setores.length > 0,
        });
        const situacao: SituacaoFichaLote = concluida ? "concluida" : item.status === "ignorado" ? "ignorada" : situacaoPorPendencias(pend);
        const aberta = !concluida && item.status !== "ignorado";
        return {
          item,
          posicao: idx + 1,
          nome: String(d.nome ?? item.nome_extraido ?? "Ficha sem nome"),
          cargo: cargos.find((c) => c.id === v?.cargoId)?.nome ?? (d.cargo_nome ? String(d.cargo_nome) : null),
          cargoDecidido: !!v?.cargoId,
          setorChave: v?.setorId ?? "__sem",
          setor: setores.find((s) => s.id === v?.setorId)?.nome ?? null,
          salario: brl(d.salario),
          situacao,
          pendente: aberta && STATUS_PENDENTES.includes(item.status),
          obrigatorias: aberta ? pend.obrigatorias : [],
          complementares: aberta ? pend.complementares : [],
          semAcesso: aberta && pend.semAcesso,
        };
      }),
    [itens, organizacao, cargos, setores, padroes, unidadeId, salarioCargoDe],
  );

  const gruposSetor = useMemo(() => setoresDoLote(itens, organizacao, setores), [itens, organizacao, setores]);

  const contagem = useMemo(() => {
    const c = { todas: linhas.length, pronta: 0, atencao: 0, concluida: 0 };
    for (const l of linhas) {
      if (l.situacao === "pronta") c.pronta += 1;
      else if (l.situacao === "atencao" || l.situacao === "acesso") c.atencao += 1;
      else if (l.situacao === "concluida") c.concluida += 1;
    }
    return c;
  }, [linhas]);

  const termo = busca.trim().toLowerCase();
  const visiveis = linhas.filter(
    (l) =>
      (filtro === "todas" ||
        l.situacao === filtro ||
        (filtro === "atencao" && l.situacao === "acesso")) &&
      (setorFiltro === "todos" || l.setorChave === setorFiltro) &&
      (!termo || l.nome.toLowerCase().includes(termo) || (l.cargo ?? "").toLowerCase().includes(termo)),
  );
  const visiveisPendentes = visiveis.filter((l) => l.pendente);
  const setorAtual = gruposSetor.find((g) => (g.id ?? "__sem") === setorFiltro) ?? null;

  const alternar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const sairSelecao = () => { setSelecionando(false); setMarcadas(new Set()); };

  const semAcesso = linhas.filter((l) => l.semAcesso).length;

  const FILTROS: Array<{ id: Filtro; label: string }> = [
    { id: "todas", label: "Todas" },
    { id: "pronta", label: "Prontas" },
    { id: "atencao", label: "Atenção" },
    { id: "concluida", label: "No cadastro" },
  ];

  return (
    <div className="space-y-3">
      {semAcesso > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 gap-2">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Faltam dados de acesso para {semAcesso} {semAcesso === 1 ? "colaborador" : "colaboradores"}
              </p>
              <p className="text-xs text-muted-foreground">Sem WhatsApp ou e-mail a pessoa não recebe o acesso ao portal.</p>
            </div>
          </div>
          <Button size="sm" className="h-10 shrink-0" onClick={() => onPreencherContatos(null)}>
            Preencher em lista rápida
          </Button>
        </div>
      )}

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

      {gruposSetor.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Filtrar por setor">
          {[{ chave: "todos", nome: "Todos", n: gruposSetor.reduce((a, g) => a + g.itemIds.length, 0) },
            ...gruposSetor.map((g) => ({ chave: g.id ?? "__sem", nome: g.nome, n: g.itemIds.length }))].map((g) => (
            <button
              key={g.chave}
              type="button"
              aria-pressed={setorFiltro === g.chave}
              onClick={() => setSetorFiltro(g.chave)}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium",
                setorFiltro === g.chave ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {g.nome} <span className="tabular-nums">({g.n})</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Buscar por nome ou cargo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {visiveisPendentes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-2">
          {selecionando ? (
            <>
              <span className="px-1 text-sm font-medium tabular-nums">{marcadas.size} marcada(s)</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => setMarcadas(new Set(visiveisPendentes.map((l) => l.item.id)))}
              >
                Marcar todas ({visiveisPendentes.length})
              </Button>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" className="h-9" onClick={sairSelecao} aria-label="Cancelar seleção">
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={marcadas.size === 0}
                  onClick={() => {
                    onAplicarMarcadas([...marcadas]);
                    sairSelecao();
                  }}
                >
                  Aplicar às marcadas
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="h-9 bg-background" onClick={() => setSelecionando(true)}>
                <CheckSquare className="mr-1.5 h-4 w-4" /> Escolher fichas
              </Button>
              {setorAtual && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => onAplicarMarcadas(visiveisPendentes.map((l) => l.item.id))}
                >
                  Aplicar a todo o {setorAtual.nome} ({visiveisPendentes.length})
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {visiveis.map((l) => {
          const r = ROTULO[l.situacao];
          const marcada = marcadas.has(l.item.id);
          return (
            <li key={l.item.id} className={cn(marcada && "bg-primary/5")}>
              <div className="flex items-center">
                {selecionando && l.pendente && (
                  <label className="flex min-h-12 shrink-0 items-center pl-3" aria-label={`Marcar ${l.nome}`}>
                    <Checkbox checked={marcada} onCheckedChange={() => alternar(l.item.id)} />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => (selecionando && l.pendente ? alternar(l.item.id) : onAbrir(l.item.id))}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
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
                    {l.semAcesso && (
                      <span className="flex items-center gap-1 truncate text-xs font-medium text-warning-foreground">
                        <KeyRound className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                        Faltam dados de acesso: sem WhatsApp ou e-mail
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
              </div>
              {l.semAcesso && !selecionando && (
                <div className="-mt-1 pb-2 pl-12 pr-3">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onPreencherContatos(l.item.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> WhatsApp ou e-mail
                  </Button>
                </div>
              )}
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

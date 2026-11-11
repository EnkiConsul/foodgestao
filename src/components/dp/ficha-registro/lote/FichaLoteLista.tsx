import { useMemo, useState } from "react";
import { CheckSquare, ChevronRight, FileSignature, KeyRound, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { jornadaDaFicha, type FichaItem } from "@/hooks/useDpFichaImportacao";
import { useDpSalarioCargoResolver } from "@/hooks/useDpSalarioCargoResolver";
import { inferirFormaPagamento } from "@/lib/dp/ficha-registro/inferencia";
import {
  dadosDaFichaLote, pendenciasFichaLote, rotuloSetor, setoresDoLote, situacaoPorPendencias, vinculoOrganizado,
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
  /** Abre os campos para aplicar só a estas fichas (setor inteiro ou marcadas na lista). */
  onAplicarMarcadas: (itemIds: string[], titulo: string) => void;
  /** Abre a lista rápida de dados para acesso (opcionalmente focando uma ficha). */
  onPreencherContatos: (focoId: string | null) => void;
  /** Marca (ou desmarca) que estas fichas assinam os documentos em papel. */
  onAssinaturaPapel?: (itemIds: string[], papel: boolean) => Promise<void> | void;
}

const lista = (xs: string[], max = 4) => {
  const v = xs.slice(0, max);
  const resto = xs.length - v.length;
  const base = v.length > 1 ? `${v.slice(0, -1).join(", ")} e ${v[v.length - 1]}` : v[0] ?? "";
  return resto > 0 ? `${base} e mais ${resto}` : base;
};

/** Etapa 3: lista enxuta do lote, com atalhos por setor, ação em grupo e contato rápido. */
export function FichaLoteLista({
  itens, organizacao, cargos, setores, padroes, unidadeId, onAbrir, onAplicarMarcadas, onPreencherContatos, onAssinaturaPapel,
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
          setor: rotuloSetor(setores.find((s) => s.id === v?.setorId)?.nome) || null,
          salario: brl(d.salario),
          situacao,
          pendente: aberta && STATUS_PENDENTES.includes(item.status),
          obrigatorias: aberta ? pend.obrigatorias : [],
          complementares: aberta ? pend.complementares : [],
          semAcesso: aberta && pend.semAcesso && !pend.assinaPapel,
          papel: !concluida && !!pend.assinaPapel,
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
  const tituloSetor = setorAtual ? (setorAtual.id ? `Aplicar ao setor ${rotuloSetor(setorAtual.nome)}` : "Aplicar às fichas sem setor") : null;

  const alternar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const sairSelecao = () => { setSelecionando(false); setMarcadas(new Set()); };

  const idsSemAcesso = linhas.filter((l) => l.semAcesso).map((l) => l.item.id);
  const semAcesso = idsSemAcesso.length;

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
              <p className="text-xs text-muted-foreground">
                Sem WhatsApp ou e-mail a pessoa não recebe o acesso ao portal. Quem não tem celular pode assinar os documentos em papel.
              </p>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            {onAssinaturaPapel && (
              <Button size="sm" variant="outline" className="h-10 w-full sm:w-auto" onClick={() => onAssinaturaPapel(idsSemAcesso, true)}>
                <FileSignature className="mr-1 h-4 w-4" /> {semAcesso === 1 ? "Assina em papel" : "Todos assinam em papel"}
              </Button>
            )}
            <Button size="sm" className="h-10 w-full sm:w-auto" onClick={() => onPreencherContatos(null)}>
              Preencher contatos
            </Button>
          </div>
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
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1" aria-label="Filtrar por setor">
          {[{ chave: "todos", nome: "Todos", n: gruposSetor.reduce((a, g) => a + g.itemIds.length, 0) },
            ...gruposSetor.map((g) => ({ chave: g.id ?? "__sem", nome: rotuloSetor(g.nome), n: g.itemIds.length }))].map((g) => (
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
        <div className="flex items-center gap-2">
          {selecionando ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-10 bg-background"
                onClick={() => setMarcadas(new Set(visiveisPendentes.map((l) => l.item.id)))}
              >
                Marcar todas ({visiveisPendentes.length})
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto h-10" onClick={sairSelecao}>
                <X className="mr-1 h-4 w-4" /> Cancelar
              </Button>
            </>
          ) : (
            <>
              {tituloSetor && (
                <Button
                  size="sm"
                  className="h-10 min-w-0 flex-1 sm:flex-none"
                  onClick={() => onAplicarMarcadas(visiveisPendentes.map((l) => l.item.id), tituloSetor)}
                >
                  <SlidersHorizontal className="mr-1.5 h-4 w-4 shrink-0" />
                  <span className="truncate">{setorAtual?.id ? "Aplicar ao setor" : "Aplicar às sem setor"}</span>
                  <span className="ml-1 tabular-nums">({visiveisPendentes.length})</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className={cn("h-10 bg-background", tituloSetor ? "shrink-0" : "w-full sm:w-auto")}
                onClick={() => setSelecionando(true)}
              >
                <CheckSquare className="mr-1.5 h-4 w-4" />
                <span className={cn(tituloSetor && "sm:hidden")}>{tituloSetor ? "Escolher" : "Escolher fichas"}</span>
                {tituloSetor && <span className="hidden sm:inline">Escolher fichas</span>}
              </Button>
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
                  <label className="flex min-h-12 shrink-0 items-center self-stretch pl-3" aria-label={`Marcar ${l.nome}`}>
                    <Checkbox checked={marcada} onCheckedChange={() => alternar(l.item.id)} />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => (selecionando && l.pendente ? alternar(l.item.id) : onAbrir(l.item.id))}
                  className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/50 sm:gap-3"
                >
                  <span className="mt-0.5 hidden w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">{l.posicao}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.nome}</span>
                      <Badge variant="outline" className={cn("shrink-0 px-1.5 py-0 text-[11px]", r.classe)}>{r.texto}</Badge>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[l.cargoDecidido ? l.cargo : l.cargo ? `${l.cargo} (sem cargo definido)` : "Sem cargo", l.setor, l.salario]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {l.obrigatorias.length > 0 && (
                      <span className="line-clamp-2 text-xs font-medium text-warning-foreground">
                        Falta definir: {lista(l.obrigatorias)}
                      </span>
                    )}
                    {l.semAcesso && (
                      <span className="flex items-center gap-1 text-xs font-medium text-warning-foreground">
                        <KeyRound className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                        Faltam dados de acesso
                      </span>
                    )}
                    {l.papel && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileSignature className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Assina em papel
                      </span>
                    )}
                    {l.complementares.length > 0 && (
                      <span className="line-clamp-2 text-[11px] text-muted-foreground">
                        Não veio na ficha: {lista(l.complementares)}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
              {l.semAcesso && !selecionando && (
                <div className="-mt-1 pb-2 pl-3 pr-3 sm:pl-12">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => onPreencherContatos(l.item.id)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> WhatsApp ou e-mail
                    </Button>
                    {onAssinaturaPapel && (
                      <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => onAssinaturaPapel([l.item.id], true)}>
                        <FileSignature className="mr-1 h-3.5 w-3.5" /> Não tem celular: assina em papel
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {visiveis.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma ficha neste filtro.</li>
        )}
      </ul>

      {selecionando && (
        <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom)+0.5rem+4.5rem)] z-20 flex items-center gap-2 rounded-xl border border-primary/40 bg-card p-2 shadow-lg md:bottom-24">
          <p className="min-w-0 flex-1 px-1 text-sm font-medium tabular-nums">
            {marcadas.size === 0 ? "Toque nas fichas para marcar" : `${marcadas.size} ${marcadas.size === 1 ? "marcada" : "marcadas"}`}
          </p>
          <Button
            className="h-11 shrink-0"
            disabled={marcadas.size === 0}
            onClick={() => {
              onAplicarMarcadas([...marcadas], "Aplicar às fichas marcadas");
              sairSelecao();
            }}
          >
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Aplicar dados
          </Button>
        </div>
      )}
    </div>
  );
}

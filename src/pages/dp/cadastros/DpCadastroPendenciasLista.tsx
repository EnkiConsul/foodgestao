import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CalendarClock, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { DpFilters, DpFilterField, type DpFilterChip } from "@/components/dp/DpFilters";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDpPendencias } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { PendenciaAcoes } from "@/components/dp/pendencias/PendenciaAcoes";
import {
  agruparPorColaborador,
  agruparPorTipo,
  filtrarAbertas,
  opcoesFiltro,
  urgenciaDe,
  type PendenciaUrgencia,
} from "@/lib/dp/pendencias";
import { UrgenciaBadge } from "@/components/dp/home/PendenciasCard";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { mensagemErro } from "@/lib/dp/mensagemErro";

type Filtro = {
  tipo: string;
  colaborador: string;
  unidade: string;
  urgencia: PendenciaUrgencia | "todas";
  escopo: Escopo;
};
type Escopo = "todos" | "pessoa" | "empresa";

const URGENCIA_OP: { value: Filtro["urgencia"]; pill: string }[] = [
  { value: "todas", pill: "Todas" },
  { value: "atrasada", pill: "Atrasadas" },
  { value: "hoje", pill: "Vencem hoje" },
  { value: "proxima", pill: "Próximas" },
];

const FILTRO_INICIAL: Filtro = { tipo: "todos", colaborador: "todos", unidade: "todas", urgencia: "todas", escopo: "todos" };

/** Pendência de pessoa quando tem colaborador; senão é da empresa/unidade. */
function escopoDe(p: { escopo?: string; colaboradorNome?: string | null }): "pessoa" | "empresa" {
  if (p.escopo === "pessoa") return "pessoa";
  if (p.escopo === "unidade") return "empresa";
  return p.colaboradorNome ? "pessoa" : "empresa";
}

export default function DpCadastroPendenciasLista() {
  const { data = [], isLoading, isError, error, refetch } = useDpPendencias();
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas, decisaoDe } = useDpPendenciasDecisoes();
  const [mostrarAdiadas, setMostrarAdiadas] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [busca, setBusca] = useState("");

  const adiamentos = useMemo(
    () => ({ ...prefs.pendencias_adiadas, ...adiadas }),
    [prefs.pendencias_adiadas, adiadas],
  );

  const semUrgencia = useMemo(() => {
    const semIgnoradas = mostrarAdiadas ? data : data.filter((p) => !ignoradas.has(p.id));
    const visiveis = mostrarAdiadas ? semIgnoradas : filtrarAbertas(semIgnoradas, adiamentos);
    const termo = busca.trim().toLowerCase();
    return visiveis.filter((p) => {
      if (filtro.tipo !== "todos" && p.tipo !== filtro.tipo) return false;
      if (filtro.colaborador !== "todos" && (p.colaboradorNome ?? "") !== filtro.colaborador) return false;
      if (filtro.unidade !== "todas" && (p.unidadeNome ?? "") !== filtro.unidade) return false;
      if (filtro.escopo !== "todos" && escopoDe(p) !== filtro.escopo) return false;
      if (termo && !`${p.titulo} ${p.subtitulo} ${p.tipo} ${p.colaboradorNome ?? ""} ${p.unidadeNome ?? ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [data, mostrarAdiadas, adiamentos, ignoradas, filtro, busca]);

  const contagem = useMemo(() => {
    const c = { todas: semUrgencia.length, atrasada: 0, hoje: 0, proxima: 0 } as Record<Filtro["urgencia"], number>;
    semUrgencia.forEach((p) => { c[urgenciaDe(p)] += 1; });
    return c;
  }, [semUrgencia]);
  const base = useMemo(
    () => (filtro.urgencia === "todas" ? semUrgencia : semUrgencia.filter((p) => urgenciaDe(p) === filtro.urgencia)),
    [semUrgencia, filtro.urgencia],
  );
  const baseEmpresa = useMemo(() => base.filter((p) => escopoDe(p) === "empresa"), [base]);
  const basePessoa = useMemo(() => base.filter((p) => escopoDe(p) === "pessoa"), [base]);
  const gruposEmpresa = useMemo(
    () => agruparPorTipo(baseEmpresa).map((g) => ({ ...g, itens: baseEmpresa.filter((p) => p.tipo === g.tipo) })),
    [baseEmpresa],
  );

  const gruposPessoa = useMemo(
    () => agruparPorColaborador(basePessoa, { ordenarPorAtraso: true }),
    [basePessoa],
  );

  const chips: DpFilterChip[] = [
    filtro.escopo !== "todos" && { key: "escopo", label: filtro.escopo === "pessoa" ? "Colaboradores" : "Empresa e unidades", onRemove: () => setFiltro((f) => ({ ...f, escopo: "todos" })) },
    filtro.tipo !== "todos" && { key: "tipo", label: filtro.tipo, onRemove: () => setFiltro((f) => ({ ...f, tipo: "todos" })) },
    filtro.colaborador !== "todos" && { key: "colab", label: filtro.colaborador, onRemove: () => setFiltro((f) => ({ ...f, colaborador: "todos" })) },
    filtro.unidade !== "todas" && { key: "un", label: filtro.unidade, onRemove: () => setFiltro((f) => ({ ...f, unidade: "todas" })) },
  ].filter(Boolean) as DpFilterChip[];
  const limpar = () => { setFiltro(FILTRO_INICIAL); setBusca(""); };

  const opcoes = useMemo(() => opcoesFiltro(data), [data]);

  const renderItem = (p: (typeof base)[number]) => {
    const adiada = !filtrarAbertas([p], adiamentos).length;
    const decisao = decisaoDe.get(p.id);
    const qtdPessoas = p.escopo === "unidade" ? p.pessoas?.length ?? 0 : 0;
    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button,a,[role=dialog]")) return;
          setDetalhe(p);
        }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setDetalhe(p); }}
        className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 cursor-pointer hover:bg-muted/40 transition-colors"
      >
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <p.icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium break-words min-w-0">{p.titulo}</p>
            <UrgenciaBadge atrasoDias={p.atrasoDias} urgente={p.urgente} />
          </div>
          <p className="text-xs text-muted-foreground break-words">{p.subtitulo}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{p.tipo}</span>
            {qtdPessoas > 0 && (
              <Badge variant="secondary" className="text-[11px] gap-1">
                <UserRound className="h-3 w-3" />
                {qtdPessoas} colaborador{qtdPessoas === 1 ? "" : "es"}
              </Badge>
            )}
            {p.unidadeNome && <span>Unidade: {p.unidadeNome}</span>}
            {p.vencimento && <span>Prazo: {new Date(p.vencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
            {adiada && adiamentos[p.id] && (
              <span className="font-medium text-foreground">
                Adiada até {new Date(adiamentos[p.id]).toLocaleDateString("pt-BR")}
              </span>
            )}
            {decisao?.acao === "ignorar" && <span className="font-medium">Ignorada: {decisao.justificativa}</span>}
          </div>
          <PendenciaAcoes pendencia={p} />
        </div>
      </div>
    );
  };

  return (
    <DpPage>
      <DpPageHeader
        icon={CalendarClock}
        title="Pendências"
        description="Lista completa das pendências da empresa, com filtros e ações individuais."
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/dp/configuracoes/prazos-pendencias">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurar prazos</span>
              <span className="sm:hidden">Prazos</span>
            </Link>
          </Button>
        }
      />

      {/* Situação rápida */}
      <div className="flex flex-wrap gap-2">
        {URGENCIA_OP.map((u) => {
          const ativo = filtro.urgencia === u.value;
          return (
            <button
              key={u.value}
              type="button"
              onClick={() => setFiltro((f) => ({ ...f, urgencia: u.value }))}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              {u.pill}
              <span className={cn("rounded-full px-1.5 text-xs", ativo ? "bg-primary-foreground/20" : "bg-muted")}>
                {contagem[u.value]}
              </span>
            </button>
          );
        })}
      </div>

      <DpFilters
        search={{ value: busca, onChange: setBusca, placeholder: "Buscar por nome, unidade ou assunto…" }}
        activeCount={chips.length}
        chips={chips}
        onClear={limpar}
        columns={4}
      >
        <DpFilterField label="Escopo">
          <Select value={filtro.escopo} onValueChange={(v) => setFiltro((f) => ({ ...f, escopo: v as Escopo }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Tudo</SelectItem>
              <SelectItem value="pessoa">Colaboradores</SelectItem>
              <SelectItem value="empresa">Empresa e unidades</SelectItem>
            </SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Assunto">
          <Select value={filtro.tipo} onValueChange={(v) => setFiltro((f) => ({ ...f, tipo: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os assuntos</SelectItem>
              {opcoes.tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Colaborador">
          <Select value={filtro.colaborador} onValueChange={(v) => setFiltro((f) => ({ ...f, colaborador: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os colaboradores</SelectItem>
              {opcoes.colaboradores.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Unidade">
          <Select value={filtro.unidade} onValueChange={(v) => setFiltro((f) => ({ ...f, unidade: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as unidades</SelectItem>
              {opcoes.unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </DpFilterField>
      </DpFilters>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {base.length} pendência(s) {mostrarAdiadas ? "(incluindo adiadas)" : "aberta(s)"}
        </p>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarAdiadas}
            onChange={(e) => setMostrarAdiadas(e.target.checked)}
            className="accent-primary"
          />
          Mostrar adiadas e ignoradas
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && isError && (
        <DpErrorState message={mensagemErro(error)} onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && base.length === 0 && (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Nenhuma pendência encontrada com os filtros atuais.
        </p>
      )}

      <div className="space-y-8">
        {gruposEmpresa.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="h-4 w-4 text-primary" /> Empresa e unidades
              <Badge variant="secondary" className="rounded-full">{baseEmpresa.length}</Badge>
            </h2>
            {gruposEmpresa.map((g) => (
              <div key={g.tipo} className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{g.tipo} · {g.total}</p>
                <div className="space-y-2">{g.itens.map(renderItem)}</div>
              </div>
            ))}
          </section>
        )}
        {gruposPessoa.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <UserRound className="h-4 w-4 text-primary" /> Colaboradores
              <Badge variant="secondary" className="rounded-full">{basePessoa.length}</Badge>
            </h2>
            {gruposPessoa.map((sub) => (
              <div key={sub.colaborador ?? "sem"} className="space-y-2">
                <p className="text-sm font-medium">
                  {sub.colaborador ?? "Sem colaborador"}{" "}
                  <span className="text-muted-foreground">· {sub.itens.length}</span>
                </p>
                <div className="space-y-2">{sub.itens.map(renderItem)}</div>
              </div>
            ))}
          </section>
        )}
      </div>
    </DpPage>
  );
}

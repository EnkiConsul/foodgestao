import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, ChevronRight, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { DpFilters, DpFilterField, type DpFilterChip } from "@/components/dp/DpFilters";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { Pendencia } from "@/hooks/useDpPendencias";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpPendencias } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { useIsMobile } from "@/hooks/use-mobile";
import { PendenciaAcoes } from "@/components/dp/pendencias/PendenciaAcoes";
import { compararUrgencia, filtrarAbertas, opcoesFiltro, urgenciaDe, type PendenciaUrgencia } from "@/lib/dp/pendencias";
import { EIXOS, eixoDe, type EixoAcao } from "@/lib/dp/acoes-eixos";
import { UrgenciaBadge } from "@/components/dp/home/PendenciasCard";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { mensagemErro } from "@/lib/dp/mensagemErro";

type Aba = EixoAcao | "todas";
type Filtro = { tipo: string; colaborador: string; unidade: string };
const FILTRO_INICIAL: Filtro = { tipo: "todos", colaborador: "todos", unidade: "todas" };

const SECOES: { chave: "agora" | "hoje" | "proximas"; titulo: string; urg: PendenciaUrgencia[] }[] = [
  { chave: "agora", titulo: "Resolver agora", urg: ["atrasada", "urgente"] },
  { chave: "hoje", titulo: "Para hoje", urg: ["hoje"] },
  { chave: "proximas", titulo: "Próximos dias", urg: ["proxima"] },
];

const FAIXA: Record<PendenciaUrgencia, string> = {
  atrasada: "bg-destructive",
  urgente: "bg-destructive",
  hoje: "bg-warning",
  proxima: "bg-border",
};

const dataBR = (d: string) => new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");

export default function DpCadastroPendenciasLista() {
  const { data = [], isLoading, isError, error, refetch } = useDpPendencias();
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas, decisaoDe } = useDpPendenciasDecisoes();
  const isMobile = useIsMobile();
  const [mostrarAdiadas, setMostrarAdiadas] = useState(false);
  const [aba, setAba] = useState<Aba>("todas");
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<Pendencia | null>(null);

  const adiamentos = useMemo(() => ({ ...prefs.pendencias_adiadas, ...adiadas }), [prefs.pendencias_adiadas, adiadas]);

  const filtradas = useMemo(() => {
    const semIgnoradas = mostrarAdiadas ? data : data.filter((p) => !ignoradas.has(p.id));
    const visiveis = mostrarAdiadas ? semIgnoradas : filtrarAbertas(semIgnoradas, adiamentos);
    const termo = busca.trim().toLowerCase();
    return visiveis.filter((p) => {
      if (filtro.tipo !== "todos" && p.tipo !== filtro.tipo) return false;
      if (filtro.colaborador !== "todos" && (p.colaboradorNome ?? "") !== filtro.colaborador) return false;
      if (filtro.unidade !== "todas" && (p.unidadeNome ?? "") !== filtro.unidade) return false;
      if (termo && !`${p.titulo} ${p.subtitulo} ${p.tipo} ${p.colaboradorNome ?? ""} ${p.unidadeNome ?? ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [data, mostrarAdiadas, adiamentos, ignoradas, filtro, busca]);

  const porEixo = useMemo(() => {
    const c: Record<Aba, number> = { todas: filtradas.length, criticas: 0, equipe: 0, documentos: 0, cadastros: 0 };
    filtradas.forEach((p) => { c[eixoDe(p)] += 1; });
    return c;
  }, [filtradas]);

  const lista = useMemo(
    () => (aba === "todas" ? filtradas : filtradas.filter((p) => eixoDe(p) === aba)).slice().sort(compararUrgencia),
    [filtradas, aba],
  );

  const resumo = useMemo(() => {
    const r = { agora: 0, hoje: 0, proximas: 0 };
    filtradas.forEach((p) => {
      const u = urgenciaDe(p);
      if (u === "atrasada" || u === "urgente") r.agora += 1;
      else if (u === "hoje") r.hoje += 1;
      else r.proximas += 1;
    });
    return r;
  }, [filtradas]);

  const chips: DpFilterChip[] = [
    filtro.tipo !== "todos" && { key: "tipo", label: filtro.tipo, onRemove: () => setFiltro((f) => ({ ...f, tipo: "todos" })) },
    filtro.colaborador !== "todos" && { key: "colab", label: filtro.colaborador, onRemove: () => setFiltro((f) => ({ ...f, colaborador: "todos" })) },
    filtro.unidade !== "todas" && { key: "un", label: filtro.unidade, onRemove: () => setFiltro((f) => ({ ...f, unidade: "todas" })) },
  ].filter(Boolean) as DpFilterChip[];
  const limpar = () => { setFiltro(FILTRO_INICIAL); setBusca(""); };
  const opcoes = useMemo(() => opcoesFiltro(data), [data]);

  const renderItem = (p: Pendencia) => {
    const u = urgenciaDe(p);
    const adiada = !filtrarAbertas([p], adiamentos).length;
    const decisao = decisaoDe.get(p.id);
    const qtdPessoas = p.escopo === "unidade" ? p.pessoas?.length ?? 0 : 0;
    const quem = p.colaboradorNome ?? p.unidadeNome;
    return (
      <li
        key={p.id}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button,a,[role=dialog]")) return;
          setDetalhe(p);
        }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setDetalhe(p); }}
        className="relative flex cursor-pointer gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 pl-4 transition-colors hover:bg-muted/40 active:bg-muted/60"
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", FAIXA[u])} aria-hidden="true" />
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <p.icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-semibold leading-snug">{p.titulo}</p>
            <UrgenciaBadge atrasoDias={p.atrasoDias} urgente={p.urgente} />
          </div>
          <p className="break-words text-xs leading-relaxed text-muted-foreground">{p.subtitulo}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">{p.tipo}</span>
            {quem && <span className="truncate">{quem}</span>}
            {qtdPessoas > 0 && (
              <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{qtdPessoas}</span>
            )}
            {p.vencimento && <span>Prazo {dataBR(p.vencimento)}</span>}
            {adiada && adiamentos[p.id] && <span className="font-medium text-foreground">Adiada até {dataBR(adiamentos[p.id])}</span>}
            {decisao?.acao === "ignorar" && <span className="font-medium">Ignorada: {decisao.justificativa}</span>}
          </div>
          <PendenciaAcoes pendencia={p} />
        </div>
      </li>
    );
  };

  const corpoDetalhe = detalhe && (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{detalhe.tipo}</span>
        {detalhe.unidadeNome && <span>Unidade: {detalhe.unidadeNome}</span>}
        {detalhe.vencimento && <span>Prazo: {dataBR(detalhe.vencimento)}</span>}
      </div>
      {(detalhe.pessoas?.length ?? 0) > 0 ? (
        <div className="space-y-1">
          <p className="font-medium">Colaboradores ({detalhe.pessoas!.length})</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {detalhe.pessoas!.map((pp, i) => (
              <li key={`${pp.nome}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="break-words">{pp.nome}</span>
                {pp.desligamento && <span className="shrink-0 text-xs text-muted-foreground">Desligado em {dataBR(pp.desligamento)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : detalhe.colaboradorNome ? (
        <p>Colaborador: <span className="font-medium">{detalhe.colaboradorNome}</span></p>
      ) : null}
      <PendenciaAcoes pendencia={detalhe} onNavigate={() => setDetalhe(null)} onResolved={() => setDetalhe(null)} />
    </div>
  );

  const vazioTotal = !isLoading && !isError && filtradas.length === 0 && chips.length === 0 && !busca;

  return (
    <DpPage>
      <DpPageHeader
        icon={CalendarClock}
        title="Ações do Dia"
        description="O que precisa da sua atenção hoje, do mais urgente ao que pode esperar."
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

      {/* Resumo do dia */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Resolver agora", v: resumo.agora, cls: resumo.agora > 0 ? "text-destructive" : "text-muted-foreground" },
          { k: "Para hoje", v: resumo.hoje, cls: resumo.hoje > 0 ? "text-warning" : "text-muted-foreground" },
          { k: "Próximos dias", v: resumo.proximas, cls: "text-foreground" },
        ].map((c) => (
          <div key={c.k} className="rounded-2xl border border-border bg-card px-3 py-2.5">
            <p className={cn("text-2xl font-bold tabular-nums leading-none", c.cls)}>{isLoading ? "–" : c.v}</p>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{c.k}</p>
          </div>
        ))}
      </div>

      {/* Assuntos: faixa rolável para o polegar no celular */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Assuntos">
        {([{ value: "todas" as Aba, curto: "Todas" }, ...EIXOS]).map((e) => {
          const ativo = aba === e.value;
          return (
            <button
              key={e.value}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setAba(e.value)}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              {e.curto}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", ativo ? "bg-primary-foreground/20" : "bg-muted")}>{porEixo[e.value]}</span>
            </button>
          );
        })}
      </div>
      {aba !== "todas" && <p className="-mt-2 text-xs text-muted-foreground">{EIXOS.find((e) => e.value === aba)?.descricao}</p>}

      <DpFilters
        search={{ value: busca, onChange: setBusca, placeholder: "Buscar por nome, unidade ou assunto…" }}
        activeCount={chips.length}
        chips={chips}
        onClear={limpar}
        columns={3}
      >
        <DpFilterField label="Tipo">
          <Select value={filtro.tipo} onValueChange={(v) => setFiltro((f) => ({ ...f, tipo: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
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

      <label className="flex min-h-10 cursor-pointer items-center gap-2 self-start text-sm text-muted-foreground">
        <input type="checkbox" checked={mostrarAdiadas} onChange={(e) => setMostrarAdiadas(e.target.checked)} className="h-4 w-4 accent-primary" />
        Mostrar adiadas e ignoradas
      </label>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && isError && <DpErrorState message={mensagemErro(error)} onRetry={() => void refetch()} />}

      {vazioTotal && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
          <p className="text-base font-semibold">Tudo em dia!</p>
          <p className="text-sm text-muted-foreground">Nenhuma ação aberta na empresa. Pode seguir com o serviço.</p>
        </div>
      )}
      {!isLoading && !isError && !vazioTotal && lista.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Nada neste assunto com os filtros atuais.</p>
      )}

      <div className="space-y-6">
        {SECOES.map((s) => {
          const itens = lista.filter((p) => s.urg.includes(urgenciaDe(p)));
          if (itens.length === 0) return null;
          return (
            <section key={s.chave} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {s.titulo}
                <Badge variant="secondary" className="rounded-full">{itens.length}</Badge>
              </h2>
              <ul className="space-y-2">{itens.map(renderItem)}</ul>
            </section>
          );
        })}
      </div>

      {isMobile ? (
        <Drawer open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
          <DrawerContent className="max-h-[88dvh]">
            {detalhe && (
              <>
                <DrawerHeader className="text-left">
                  <DrawerTitle className="break-words">{detalhe.titulo}</DrawerTitle>
                  <DrawerDescription>{detalhe.subtitulo}</DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{corpoDetalhe}</div>
              </>
            )}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            {detalhe && (
              <>
                <DialogHeader>
                  <DialogTitle>{detalhe.titulo}</DialogTitle>
                  <DialogDescription>{detalhe.subtitulo}</DialogDescription>
                </DialogHeader>
                {corpoDetalhe}
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
      <span className="hidden"><ChevronRight /></span>
    </DpPage>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Check, CheckCircle2, ChevronRight, ListChecks, Play, Settings, UserRound, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpIntermitenteConfirmacoes } from "@/hooks/useDpIntermitenteConfirmacoes";
import { adiarPresets } from "@/lib/dp/adiar-presets";
import { contarResolvidas, EVENTO_RESOLVIDAS, registrarResolvida } from "@/lib/dp/resolvidas-hoje";
import { toast } from "sonner";

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
  const { selectedCompanyId } = useCompanyContext();
  const { decidir } = useDpPendenciasDecisoes();
  const { responder } = useDpIntermitenteConfirmacoes();
  const [resolvidas, setResolvidas] = useState(0);
  useEffect(() => {
    if (!selectedCompanyId) return;
    const atualizar = () => setResolvidas(contarResolvidas(selectedCompanyId));
    atualizar();
    window.addEventListener(EVENTO_RESOLVIDAS, atualizar);
    return () => window.removeEventListener(EVENTO_RESOLVIDAS, atualizar);
  }, [selectedCompanyId]);
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loteOcupado, setLoteOcupado] = useState(false);
  const [foco, setFoco] = useState<{ ids: string[]; i: number } | null>(null);
  const alternar = (id: string) => setSel((s0) => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sairSelecao = () => { setSelecionando(false); setSel(new Set()); };

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

  const selecionadas = lista.filter((p) => sel.has(p.id));
  const intermSel = selecionadas.filter((p) => p.tipo === "Intermitente" && p.colaboradorId && p.competencia);

  const adiarLote = async (data: string) => {
    setLoteOcupado(true);
    let ok = 0;
    for (const p of selecionadas) {
      try { await decidir.mutateAsync({ pendenciaId: p.id, tipo: p.tipo, acao: "adiar", adiadaAte: data }); ok++; } catch { /* aviso já exibido */ }
    }
    setLoteOcupado(false);
    toast.success(`${ok} de ${selecionadas.length} ações adiadas.`);
    sairSelecao();
  };

  const trabalharamLote = async () => {
    setLoteOcupado(true);
    let ok = 0;
    for (const p of intermSel) {
      try {
        await responder.mutateAsync({ colaboradorId: p.colaboradorId!, competencia: p.competencia!, trabalhou: true });
        if (selectedCompanyId) registrarResolvida(selectedCompanyId, p.id);
        ok++;
      } catch { /* aviso já exibido */ }
    }
    setLoteOcupado(false);
    toast.success(`${ok} de ${intermSel.length} intermitentes confirmados.`);
    void refetch();
    sairSelecao();
  };

  const focoItem = foco ? data.find((p) => p.id === foco.ids[foco.i]) ?? null : null;
  const avancarFoco = () => setFoco((f) => (f && f.i + 1 < f.ids.length ? { ...f, i: f.i + 1 } : null));
  const iniciarFoco = () => {
    const ids = lista.filter((p) => urgenciaDe(p) !== "proxima").map((p) => p.id);
    const todos = ids.length ? ids : lista.map((p) => p.id);
    if (todos.length) setFoco({ ids: todos, i: 0 });
  };

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
          if (selecionando) alternar(p.id); else setDetalhe(p);
        }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setDetalhe(p); }}
        className="relative flex cursor-pointer gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 pl-4 transition-colors hover:bg-muted/40 active:bg-muted/60"
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", FAIXA[u])} aria-hidden="true" />
        {selecionando ? (
          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center">
            <Checkbox checked={sel.has(p.id)} onCheckedChange={() => alternar(p.id)} aria-label={`Selecionar ${p.titulo}`} className="h-5 w-5" />
          </div>
        ) : (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <p.icon className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
        )}
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
          {!selecionando && <PendenciaAcoes pendencia={p} />}
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

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", resolvidas > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {resolvidas === 1 ? "1 resolvida hoje" : `${resolvidas} resolvidas hoje`}
        </span>
        <div className="ml-auto flex gap-2">
          {lista.length > 0 && !selecionando && (
            <Button size="sm" className="h-10 gap-1.5 sm:h-8" onClick={iniciarFoco}>
              <Play className="h-4 w-4" /> Despachar agora
            </Button>
          )}
          {lista.length > 0 && (
            <Button size="sm" variant="outline" className="h-10 gap-1.5 sm:h-8" onClick={() => (selecionando ? sairSelecao() : setSelecionando(true))}>
              {selecionando ? <><X className="h-4 w-4" /> Cancelar</> : <><ListChecks className="h-4 w-4" /> Selecionar</>}
            </Button>
          )}
        </div>
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
          <p className="text-sm text-muted-foreground">
            {resolvidas > 0 ? `Você despachou ${resolvidas} ${resolvidas === 1 ? "ação" : "ações"} hoje. ` : ""}Nenhuma ação aberta na empresa. Pode seguir com o serviço.
          </p>
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
      {selecionando && (
        <div className="sticky bottom-0 z-20 -mx-3 space-y-2 border-t border-border bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:mx-0 md:rounded-2xl md:border">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{selecionadas.length} selecionada(s)</span>
            <button type="button" className="text-xs text-primary" onClick={() => setSel(new Set(lista.map((p) => p.id)))}>Selecionar todas</button>
          </div>
          {selecionadas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {intermSel.length > 0 && (
                <Button size="sm" className="h-10 sm:h-8" disabled={loteOcupado} onClick={() => void trabalharamLote()}>
                  <Check className="mr-1 h-4 w-4" /> {intermSel.length} trabalharam
                </Button>
              )}
              {adiarPresets().map((op) => (
                <Button key={op.chave} size="sm" variant="outline" className="h-10 sm:h-8" disabled={loteOcupado} onClick={() => void adiarLote(op.data)}>
                  Adiar: {op.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!foco} onOpenChange={(o) => !o && setFoco(null)}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-4 sm:max-w-md">
          {foco && (
            <>
              <DialogHeader>
                <p className="text-xs text-muted-foreground">Ação {foco.i + 1} de {foco.ids.length}</p>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${((foco.i + 1) / foco.ids.length) * 100}%` }} />
                </div>
                <DialogTitle className="break-words pt-2 text-left">{focoItem?.titulo ?? "Ação já resolvida"}</DialogTitle>
                <DialogDescription className="text-left">{focoItem?.subtitulo ?? "Siga para a próxima."}</DialogDescription>
              </DialogHeader>
              {focoItem && (
                <div className="space-y-2 overflow-y-auto text-sm">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5">{focoItem.tipo}</span>
                    {(focoItem.colaboradorNome ?? focoItem.unidadeNome) && <span>{focoItem.colaboradorNome ?? focoItem.unidadeNome}</span>}
                    {focoItem.vencimento && <span>Prazo {dataBR(focoItem.vencimento)}</span>}
                    <UrgenciaBadge atrasoDias={focoItem.atrasoDias} urgente={focoItem.urgente} />
                  </div>
                  <PendenciaAcoes key={focoItem.id} pendencia={focoItem} onNavigate={() => setFoco(null)} onResolved={avancarFoco} />
                </div>
              )}
              <Button variant="ghost" className="h-11 w-full justify-center gap-1" onClick={avancarFoco}>
                {foco.i + 1 < foco.ids.length ? <>Pular para a próxima <ChevronRight className="h-4 w-4" /></> : "Concluir"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}

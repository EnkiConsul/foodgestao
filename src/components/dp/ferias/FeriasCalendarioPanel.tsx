import { useMemo, useState } from "react";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, format, parseISO, startOfDay, startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpContentCard } from "@/components/dp/DpPage";
import { DiasEmLista } from "@/components/dp/DiasEmLista";
import { useDpFerias } from "@/hooks/useDpFerias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpFeriasRegras } from "@/hooks/useDpFeriasRegras";
import { useCompanyUnidades } from "@/hooks/useCompanyUnidades";
import { useCompanyContext } from "@/hooks/useCompanyContext";

const TONE: Record<string, string> = {
  planejado: "bg-amber-500/20 text-amber-700",
  aprovado: "bg-sky-500/20 text-sky-700",
  em_gozo: "bg-primary/20 text-primary",
  concluido: "bg-muted text-muted-foreground",
};

type Visao = "mes" | "semanas";
type Pessoa = { nome: string; status: string; retorno: string };

/** Mesmo dia/mês dentro do intervalo, considerando bloqueios recorrentes. */
function bloqueioCobre(b: { data_inicio: string; data_fim: string; recorrente_anual: boolean }, iso: string) {
  if (!b.recorrente_anual) return iso >= b.data_inicio && iso <= b.data_fim;
  const md = iso.slice(5);
  const i = b.data_inicio.slice(5);
  const f = b.data_fim.slice(5);
  return i <= f ? md >= i && md <= f : md >= i || md <= f;
}

/** Agenda da equipe: quem está de férias por dia, com limite e bloqueios da unidade. */
export function FeriasCalendarioPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const [visao, setVisao] = useState<Visao>("mes");
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [unidadeId, setUnidadeId] = useState<string>("todas");
  const { gozos, gozosLoading } = useDpFerias("todos");
  const { data: colaboradores = [] } = useDpColaboradores();
  const { regras, bloqueios } = useDpFeriasRegras();
  const { data: unidades = [] } = useCompanyUnidades(selectedCompanyId ?? undefined);

  const colabs = useMemo(
    () => new Map((colaboradores as any[]).map((c) => [c.id, { nome: c.nome as string, unidade: c.unidade_id as string | null }])),
    [colaboradores],
  );

  const dias = useMemo(() => {
    if (visao === "semanas") {
      const hoje = startOfDay(new Date());
      const inicio = addDays(hoje, -hoje.getDay());
      return eachDayOfInterval({ start: inicio, end: addDays(inicio, 41) });
    }
    return eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) });
  }, [mes, visao]);

  const primeiro = format(dias[0], "yyyy-MM-dd");
  const ultimo = format(dias[dias.length - 1], "yyyy-MM-dd");

  const porDia = useMemo(() => {
    const map = new Map<string, Pessoa[]>();
    for (const g of gozos) {
      if (g.status === "cancelado") continue;
      if (g.data_fim < primeiro || g.data_inicio > ultimo) continue;
      const c = colabs.get(g.colaborador_id);
      if (unidadeId !== "todas" && c?.unidade !== unidadeId) continue;
      const retorno = format(addDays(parseISO(g.data_fim), 1), "dd/MM");
      for (const d of eachDayOfInterval({ start: parseISO(g.data_inicio), end: parseISO(g.data_fim) })) {
        const chave = format(d, "yyyy-MM-dd");
        if (chave < primeiro || chave > ultimo) continue;
        const lista = map.get(chave) ?? [];
        lista.push({ nome: c?.nome ?? "Colaborador", status: g.status, retorno });
        map.set(chave, lista);
      }
    }
    return map;
  }, [gozos, colabs, unidadeId, primeiro, ultimo]);

  /** Limite geral (sem cargo/turno): da unidade filtrada, senão o da empresa. */
  const limite = useMemo(() => {
    const gerais = regras.filter((r) => r.ativo && !r.cargo_id && !r.turno);
    const daUnidade = unidadeId !== "todas" ? gerais.find((r) => r.unidade_id === unidadeId) : undefined;
    return (daUnidade ?? gerais.find((r) => !r.unidade_id))?.max_simultaneos ?? null;
  }, [regras, unidadeId]);

  const bloqueioDe = (iso: string) =>
    bloqueios.find(
      (b) => b.ativo && (!b.unidade_id || unidadeId === "todas" || b.unidade_id === unidadeId) && bloqueioCobre(b, iso),
    );

  const estado = (iso: string) => {
    const n = porDia.get(iso)?.length ?? 0;
    const bloq = bloqueioDe(iso);
    const acima = limite != null && n > limite;
    const noLimite = limite != null && n === limite && n > 0;
    return { n, bloq, acima, noLimite };
  };

  const alertas = dias.filter((d) => {
    const e = estado(format(d, "yyyy-MM-dd"));
    return e.acima || (e.bloq && e.n > 0);
  }).length;

  const espacos = dias.length ? dias[0].getDay() : 0;
  const titulo =
    visao === "mes"
      ? format(mes, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase())
      : `${format(dias[0], "dd/MM")} a ${format(dias[dias.length - 1], "dd/MM")}`;

  return (
    <DpContentCard contentClassName="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["mes", "semanas"] as Visao[]).map((v) => (
            <Button key={v} size="sm" variant={visao === v ? "secondary" : "ghost"} onClick={() => setVisao(v)}>
              {v === "mes" ? "Mês" : "Próximas 6 semanas"}
            </Button>
          ))}
        </div>
        <Select value={unidadeId} onValueChange={setUnidadeId}>
          <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as unidades</SelectItem>
            {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        {visao === "mes" ? (
          <Button aria-label="Mês anterior" variant="ghost" size="icon" onClick={() => setMes((m) => addMonths(m, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
        ) : <span className="size-9" />}
        <p className="font-semibold">{titulo}</p>
        {visao === "mes" ? (
          <Button aria-label="Mês seguinte" variant="ghost" size="icon" onClick={() => setMes((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        ) : <span className="size-9" />}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{limite != null ? `Limite: até ${limite} ao mesmo tempo` : "Sem limite de simultâneos cadastrado"}</span>
        <span className="inline-flex items-center gap-1"><Ban className="size-3" /> Período bloqueado</span>
        <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="size-3" /> Acima do limite</span>
        {alertas > 0 && <span className="font-semibold text-destructive">{alertas} dia(s) com atenção</span>}
      </div>

      {gozosLoading ? (
        <p className="py-10 text-center text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="md:hidden">
            <DiasEmLista
              dias={dias.map((d) => {
                const chave = format(d, "yyyy-MM-dd");
                const pessoas = porDia.get(chave) ?? [];
                const e = estado(chave);
                return {
                  iso: chave,
                  resumo: (
                    <span className={e.acima ? "text-destructive" : undefined}>
                      {e.bloq && <Ban className="mr-1 inline size-3" />}
                      {e.n === 0 ? (
                        <span className="text-muted-foreground">Ninguém de férias</span>
                      ) : (
                        <><span className="font-semibold">{e.n}</span>{limite != null ? `/${limite}` : ""} de férias</>
                      )}
                    </span>
                  ),
                  chips: pessoas.map((p, i) => (
                    <span
                      key={`${chave}-${i}`}
                      className={`max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[p.status] ?? "bg-muted"}`}
                    >
                      {p.nome} · volta {p.retorno}
                    </span>
                  )),
                };
              })}
            />
          </div>

          <div className="hidden grid-cols-7 gap-1 text-xs md:grid">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="pb-1 text-center font-bold uppercase text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: espacos }).map((_, i) => <div key={`vazio-${i}`} />)}
            {dias.map((d) => {
              const chave = format(d, "yyyy-MM-dd");
              const pessoas = porDia.get(chave) ?? [];
              const e = estado(chave);
              const borda = e.acima ? "border-destructive bg-destructive/5" : e.noLimite ? "border-amber-500" : "border-border";
              return (
                <div
                  key={chave}
                  className={`min-h-20 rounded-lg border p-1 ${borda} ${e.bloq ? "bg-muted/60" : ""}`}
                  title={e.bloq ? `Bloqueado: ${e.bloq.nome}` : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {visao === "semanas" ? format(d, "dd/MM") : format(d, "d")}
                    </span>
                    <span className="flex items-center gap-1">
                      {e.bloq && <Ban className="size-3 text-muted-foreground" />}
                      {e.n > 0 && (
                        <span className={`text-[10px] font-bold ${e.acima ? "text-destructive" : "text-muted-foreground"}`}>
                          {e.n}{limite != null ? `/${limite}` : ""}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {pessoas.slice(0, 3).map((p, i) => (
                      <div
                        key={`${chave}-${i}`}
                        className={`truncate rounded px-1 py-0.5 ${TONE[p.status] ?? "bg-muted"}`}
                        title={`${p.nome} · volta ${p.retorno}`}
                      >
                        {p.nome}
                      </div>
                    ))}
                    {pessoas.length > 3 && (
                      <div className="px-1 text-[10px] text-muted-foreground">+{pessoas.length - 3}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </DpContentCard>
  );
}

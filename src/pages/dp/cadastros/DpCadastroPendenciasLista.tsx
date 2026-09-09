import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, Settings } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDpPendencias, type Pendencia } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { addDays } from "date-fns";
import { toast } from "sonner";
import {
  agruparPorColaborador,
  filtrarAbertas,
  opcoesFiltro,
  urgenciaDe,
  type PendenciaUrgencia,
} from "@/lib/dp/pendencias";
import { AdiarPopover, UrgenciaBadge } from "@/components/dp/home/PendenciasCard";

type Filtro = {
  tipo: string;
  colaborador: string;
  unidade: string;
  urgencia: PendenciaUrgencia | "todas";
};

const URGENCIA_OP: { value: Filtro["urgencia"]; label: string }[] = [
  { value: "todas", label: "Todas as urgências" },
  { value: "atrasada", label: "Atrasadas" },
  { value: "hoje", label: "Vence hoje" },
  { value: "proxima", label: "Próximas" },
];

export default function DpCadastroPendenciasLista() {
  const { data = [], isLoading } = useDpPendencias();
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas, decisaoDe } = useDpPendenciasDecisoes();
  const [mostrarAdiadas, setMostrarAdiadas] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>({
    tipo: "todos",
    colaborador: "todos",
    unidade: "todas",
    urgencia: "todas",
  });
  const [busca, setBusca] = useState("");

  const adiamentos = useMemo(
    () => ({ ...prefs.pendencias_adiadas, ...adiadas }),
    [prefs.pendencias_adiadas, adiadas],
  );

  const base = useMemo(() => {
    const semIgnoradas = mostrarAdiadas ? data : data.filter((p) => !ignoradas.has(p.id));
    const visiveis = mostrarAdiadas ? semIgnoradas : filtrarAbertas(semIgnoradas, adiamentos);
    const termo = busca.trim().toLowerCase();
    return visiveis.filter((p) => {
      if (filtro.tipo !== "todos" && p.tipo !== filtro.tipo) return false;
      if (filtro.colaborador !== "todos" && (p.colaboradorNome ?? "") !== filtro.colaborador) return false;
      if (filtro.unidade !== "todas" && (p.unidadeNome ?? "") !== filtro.unidade) return false;
      if (filtro.urgencia !== "todas" && urgenciaDe(p) !== filtro.urgencia) return false;
      if (termo && !`${p.titulo} ${p.subtitulo}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [data, mostrarAdiadas, adiamentos, ignoradas, filtro, busca]);

  const opcoes = useMemo(() => opcoesFiltro(data), [data]);
  const grupos = useMemo(
    () => agruparPorColaborador(base, { ordenarPorAtraso: true }),
    [base],
  );

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

      {/* Filtros */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          className="h-9 text-sm col-span-2 sm:col-span-1"
        />
        <Select value={filtro.tipo} onValueChange={(v) => setFiltro((f) => ({ ...f, tipo: v }))}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {opcoes.tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtro.colaborador} onValueChange={(v) => setFiltro((f) => ({ ...f, colaborador: v }))}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Colaborador" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os colaboradores</SelectItem>
            {opcoes.colaboradores.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtro.unidade} onValueChange={(v) => setFiltro((f) => ({ ...f, unidade: v }))}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as unidades</SelectItem>
            {opcoes.unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtro.urgencia} onValueChange={(v) => setFiltro((f) => ({ ...f, urgencia: v as Filtro["urgencia"] }))}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Urgência" /></SelectTrigger>
          <SelectContent>
            {URGENCIA_OP.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
          Mostrar adiadas
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && base.length === 0 && (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Nenhuma pendência encontrada com os filtros atuais.
        </p>
      )}

      <div className="space-y-5">
        {grupos.map((sub) => (
          <div key={sub.colaborador ?? "geral"} className="space-y-2">
            {sub.colaborador && (
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{sub.colaborador}</p>
                <Badge variant="secondary" className="rounded-full h-5 px-2 text-[11px]">
                  {sub.itens.length}
                </Badge>
              </div>
            )}
            <div className="grid gap-2 lg:grid-cols-2">
              {sub.itens.map((p) => {
                const adiada = !filtrarAbertas([p], adiamentos).length;
                const decisao = decisaoDe.get(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-start gap-3 rounded-xl border border-[hsl(var(--dp-border))] bg-card p-3"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <p.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium break-words min-w-0">{p.titulo}</p>
                        <UrgenciaBadge atrasoDias={p.atrasoDias} />
                      </div>
                      <p className="text-xs text-muted-foreground break-words">{p.subtitulo}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{p.tipo}</span>
                        {p.unidadeNome && <span>Unidade: {p.unidadeNome}</span>}
                        {adiada && adiamentos[p.id] && (
                          <span className="text-amber-700 font-medium">
                            Adiada até {new Date(adiamentos[p.id]).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                        {decisao?.acao === "ignorar" && (
                          <span className="text-muted-foreground font-medium">
                            Ignorada: {decisao.justificativa}
                          </span>
                        )}
                      </div>
                      <PendenciaAcoes pendencia={p} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DpPage>
  );
}

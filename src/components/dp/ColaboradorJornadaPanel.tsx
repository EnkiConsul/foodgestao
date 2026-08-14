import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarOff, Info, AlertTriangle, Save, Trash2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpTurnos, TURNO_FORM_DEFAULT } from "@/hooks/useDpTurnos";
import { TurnoForm, type TurnoSubmitPayload } from "@/components/dp/TurnoForm";
import { CopiarConfigColaboradorDialog, type ConfigCopiada } from "@/components/dp/CopiarConfigColaboradorDialog";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  formatarFaixaTurno, intervaloAbaixoDoLegal, nomeSugeridoTurno, sugerirCategoria,
} from "@/lib/dp/turno-utils";
import {
  cargaSemanalConfig, configTemErro, diasPadrao, DOW_LABEL, normalizarDias,
  resumoConfigTexto, turnoDoDia, validarConfigTrabalho,
  type DiaConfig, type TurnoResolvido,
} from "@/lib/dp/config-trabalho";

/** Horário digitado direto em um dia da semana, antes de virar turno. */
interface HorarioDia {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
}

/** Prefixo do turno virtual usado apenas para calcular carga e validações na tela. */
const VIRTUAL_PREFIX = "novo:";

const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null);


export interface JornadaColaborador {
  id?: string | null;
  nome?: string | null;
  regime?: string | null;
  unidade_id?: string | null;
  /** Base da vigência inicial da jornada. */
  data_admissao?: string | null;
}

interface Props {
  colaborador: JornadaColaborador | null;
  /** Recarrega o formulário com a configuração vigente quando muda para true. */
  active?: boolean;
  /** Mostra o botão "Salvar configuração" dentro do painel. */
  showSaveButton?: boolean;
}

/**
 * Painel de turno e jornada do colaborador — usado tanto na aba
 * "Turno & Jornada" do cadastro unificado quanto no diálogo dedicado.
 */
export function ColaboradorJornadaPanel({ colaborador, active = true, showSaveButton = true }: Props) {
  const policy = contratoPolicy(colaborador?.regime);
  const { data: unidades = [] } = useDpUnidades();
  const { configs, vigente, isLoading, salvar, encerrar, remover, saving } =
    useDpColaboradorConfigTrabalho(colaborador?.id ?? undefined);

  const [unidadeId, setUnidadeId] = useState<string>("none");
  const [turnoPadraoId, setTurnoPadraoId] = useState<string>("none");
  const [folgaVariavel, setFolgaVariavel] = useState(false);
  const [folgaFixaDow, setFolgaFixaDow] = useState<number | null>(null);
  const [dias, setDias] = useState<DiaConfig[]>(diasPadrao());
  /** Horário próprio de um dia (sexta, sábado, domingo etc.) antes de virar turno. */
  const [overrides, setOverrides] = useState<Record<number, HorarioDia>>({});
  const [inicio, setInicio] = useState(hoje());
  /** "base" = admissão (ou vigência atual) · "nova_data" = mudança de horário. */
  const [vigenciaModo, setVigenciaModo] = useState<"base" | "nova_data">("base");
  const admissao = colaborador?.data_admissao ?? null;
  const [obs, setObs] = useState("");

  const [novoTurnoOpen, setNovoTurnoOpen] = useState(false);
  const [copiarOpen, setCopiarOpen] = useState(false);

  const { turnos: turnosUnidade, criar: criarTurno } = useDpTurnos(unidadeId === "none" ? null : unidadeId);
  const turnosAtivos = useMemo(() => turnosUnidade.filter((t) => t.ativo), [turnosUnidade]);

  const turnosResolvidos: TurnoResolvido[] = useMemo(
    () => turnosAtivos.map((t) => ({
      id: t.id,
      nome: t.nome,
      cor: t.cor,
      entrada: (t.entrada ?? "").slice(0, 5),
      saida: (t.saida ?? "").slice(0, 5),
      intervalo_minutos: t.intervalo_minutos ?? 0,
    })),
    [turnosAtivos],
  );

  // Recarrega o formulário com a configuração vigente sempre que o painel ativa.
  useEffect(() => {
    if (!active) return;
    if (vigente) {
      setUnidadeId(vigente.unidade_id ?? "none");
      setTurnoPadraoId(vigente.turno_padrao_id ?? "none");
      setFolgaVariavel(vigente.folga_variavel);
      setFolgaFixaDow(vigente.folga_fixa_dow ?? null);
      setDias(normalizarDias(vigente.dias.map((d) => ({ dow: d.dow, trabalha: d.trabalha, turno_id: d.turno_id }))));
      setObs(vigente.observacoes ?? "");
      setInicio(vigente.vigencia_inicio ?? admissao ?? hoje());
    } else {
      setUnidadeId(colaborador?.unidade_id ?? "none");
      setTurnoPadraoId("none");
      setFolgaVariavel(false);
      setFolgaFixaDow(null);
      setDias(diasPadrao());
      setObs("");
      setInicio(admissao ?? hoje());
    }
    setOverrides({});
    setVigenciaModo("base");
  }, [active, vigente, colaborador?.unidade_id, admissao]);

  /** Dias com o horário próprio apontando para um turno virtual (só na tela). */
  const diasEfetivos: DiaConfig[] = useMemo(
    () => dias.map((d) => (overrides[d.dow] ? { ...d, turno_id: `${VIRTUAL_PREFIX}${d.dow}` } : d)),
    [dias, overrides],
  );

  const turnosEfetivos: TurnoResolvido[] = useMemo(
    () => [
      ...turnosResolvidos,
      ...Object.entries(overrides).map(([dow, h]) => ({
        id: `${VIRTUAL_PREFIX}${dow}`,
        nome: `Horário de ${DOW_LABEL[Number(dow)]}`,
        cor: null,
        entrada: h.entrada,
        saida: h.saida,
        intervalo_minutos: h.intervalo_minutos,
      })),
    ],
    [turnosResolvidos, overrides],
  );

  const config = useMemo(
    () => ({
      turno_padrao_id: turnoPadraoId === "none" ? null : turnoPadraoId,
      folga_variavel: folgaVariavel,
      folga_fixa_dow: folgaFixaDow,
      dias: diasEfetivos,
    }),
    [turnoPadraoId, folgaVariavel, folgaFixaDow, diasEfetivos],
  );

  const validacoes = useMemo(
    () => validarConfigTrabalho(config, turnosEfetivos, { regime: colaborador?.regime, vigenciaInicio: inicio }),
    [config, turnosEfetivos, colaborador?.regime, inicio],
  );
  const carga = cargaSemanalConfig(config, turnosEfetivos);
  const bloqueado = configTemErro(validacoes);

  const alternarDia = (dow: number) =>
    setDias((prev) => prev.map((d) => (d.dow === dow ? { ...d, trabalha: !d.trabalha } : d)));

  const definirTurnoDia = (dow: number, turnoId: string) =>
    setDias((prev) => prev.map((d) => (d.dow === dow ? { ...d, turno_id: turnoId === "padrao" ? null : turnoId } : d)));

  /** Liga/desliga o horário próprio do dia, partindo do turno atualmente previsto. */
  const alternarHorarioProprio = (dow: number, ativar: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (!ativar) {
        delete next[dow];
        return next;
      }
      const dia = dias.find((d) => d.dow === dow);
      const base = dia ? turnoDoDia(dia, config.turno_padrao_id, turnosResolvidos) : null;
      next[dow] = {
        entrada: base?.entrada ?? "08:00",
        saida: base?.saida ?? "17:00",
        intervalo_minutos: base?.intervalo_minutos ?? 60,
      };
      return next;
    });
  };

  const definirHorarioDia = (dow: number, patch: Partial<HorarioDia>) =>
    setOverrides((prev) => (prev[dow] ? { ...prev, [dow]: { ...prev[dow], ...patch } } : prev));

  /** Define a folga semanal fixa, desmarcando o dia escolhido. */
  const definirFolgaFixa = (dow: number | null) => {
    setFolgaFixaDow(dow);
    if (dow === null) return;
    setFolgaVariavel(false);
    setDias((prev) => prev.map((d) => (d.dow === dow ? { ...d, trabalha: false } : d)));
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[dow];
      return next;
    });
  };

  /** Atalhos de escala: 6x1 usa a folga escolhida (domingo por padrão) e 5x2 folga sáb/dom. */
  const aplicarEscala = (modo: "6x1" | "5x2") => {
    if (modo === "6x1") {
      const folga = folgaFixaDow ?? 0;
      setFolgaVariavel(false);
      setFolgaFixaDow(folga);
      setDias((prev) => prev.map((d) => ({ ...d, trabalha: d.dow !== folga })));
      return;
    }
    setFolgaVariavel(false);
    setFolgaFixaDow(0);
    setDias((prev) => prev.map((d) => ({ ...d, trabalha: d.dow !== 0 && d.dow !== 6 })));
  };

  /** Cria o turno já dentro do cadastro do colaborador e o seleciona. */
  const onCriarTurno = async (payload: TurnoSubmitPayload) => {
    try {
      const criado = await criarTurno.mutateAsync(payload);
      if (criado?.id) setTurnoPadraoId(criado.id);
      setNovoTurnoOpen(false);
      toast.success("Turno criado e selecionado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o turno");
    }
  };

  const onCopiarConfig = (c: ConfigCopiada) => {
    setTurnoPadraoId(c.turno_padrao_id ?? "none");
    setFolgaVariavel(c.folga_variavel);
    setDias(normalizarDias(c.dias));
    setOverrides({});
    toast.success("Configuração copiada — revise e salve");
  };

  /**
   * Resolve os horários próprios em turnos reais: reaproveita um turno com o
   * mesmo horário na unidade ou cria um novo, mantendo escala/ponto lendo turno.
   */
  const resolverDias = async (): Promise<DiaConfig[]> => {
    const unidade = unidadeId === "none" ? null : unidadeId;
    const resolvidos: DiaConfig[] = [];
    for (const dia of dias) {
      const h = overrides[dia.dow];
      if (!dia.trabalha || !h) { resolvidos.push(dia); continue; }
      const existente = turnosAtivos.find(
        (t) => (t.entrada ?? "").slice(0, 5) === h.entrada
          && (t.saida ?? "").slice(0, 5) === h.saida
          && (t.intervalo_minutos ?? 0) === h.intervalo_minutos,
      );
      if (existente) { resolvidos.push({ ...dia, turno_id: existente.id }); continue; }
      const criado = await criarTurno.mutateAsync({
        form: {
          ...TURNO_FORM_DEFAULT,
          unidade_id: unidade,
          entrada: h.entrada,
          saida: h.saida,
          intervalo_minutos: h.intervalo_minutos,
          nome: nomeSugeridoTurno(sugerirCategoria(h.entrada), h.entrada, h.saida),
          categoria: sugerirCategoria(h.entrada),
        },
        ciencia: intervaloAbaixoDoLegal(h) ? { confirmada: true, justificativa: "Horário próprio do dia definido no cadastro do colaborador" } : null,
      });
      resolvidos.push({ ...dia, turno_id: criado.id });
    }
    return resolvidos;
  };


  const onSalvar = async () => {
    if (!colaborador?.id) {
      toast.error("Salve os dados do colaborador antes de definir a jornada.");
      return;
    }
    if (bloqueado) { toast.error("Corrija os pontos indicados antes de salvar."); return; }
    try {
      await salvar.mutateAsync({
        unidade_id: unidadeId === "none" ? null : unidadeId,
        turno_padrao_id: turnoPadraoId === "none" ? null : turnoPadraoId,
        folga_variavel: folgaVariavel,
        folga_fixa_dow: null,
        observacoes: obs.trim() || null,
        vigencia_inicio: inicio,
        dias,
      });
      toast.success("Configuração de trabalho salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a configuração");
    }
  };

  return (
    <div className="space-y-5">
      {!colaborador?.id && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Defina a jornada agora: ela será gravada automaticamente logo após o colaborador ser criado.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button" variant="outline" size="sm" className="gap-2"
          onClick={() => setCopiarOpen(true)}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          Copiar de outro colaborador
        </Button>
      </div>

      {policy.jornadaHint && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span><strong className="text-foreground">Contrato {policy.label}.</strong> {policy.jornadaHint}</span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ct-unidade">Unidade</Label>
          <Select value={unidadeId} onValueChange={setUnidadeId}>
            <SelectTrigger id="ct-unidade"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem unidade definida</SelectItem>
              {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ct-inicio">Vigência</Label>
          {vigenciaModo === "base" && (vigente || admissao) ? (
            <div className="space-y-1.5">
              <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                {vigente
                  ? <>Mantém a vigência atual: <strong className="text-foreground">{fmt(inicio)}</strong></>
                  : <>Vigente desde a admissão: <strong className="text-foreground">{fmt(inicio)}</strong></>}
              </p>
              <Button
                type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                onClick={() => { setVigenciaModo("nova_data"); setInicio(hoje()); }}
              >
                Mudança de horário a partir de outra data
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input id="ct-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              {(vigente || admissao) && (
                <Button
                  type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                  onClick={() => {
                    setVigenciaModo("base");
                    setInicio(vigente?.vigencia_inicio ?? admissao ?? hoje());
                  }}
                >
                  {vigente ? "Manter a vigência atual" : "Usar a data de admissão"}
                </Button>
              )}
              {!vigente && !admissao && (
                <p className="text-[11px] text-muted-foreground">
                  Informe a data de admissão no cadastro para que a vigência seja preenchida automaticamente.
                </p>
              )}
            </div>
          )}
        </div>


        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ct-turno">Turno padrão</Label>
          <div className="flex gap-2">
            <Select value={turnoPadraoId} onValueChange={setTurnoPadraoId}>
              <SelectTrigger id="ct-turno" className="flex-1">
                <SelectValue placeholder={turnosResolvidos.length ? "Selecione" : "Crie o primeiro turno"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Definir turno dia a dia</SelectItem>
                {turnosResolvidos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome} — {formatarFaixaTurno(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" className="shrink-0 gap-1.5" onClick={() => setNovoTurnoOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo turno
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {turnosResolvidos.length
              ? "Vale para todos os dias trabalhados. Você pode trocar o turno em dias específicos abaixo."
              : "Nenhum turno cadastrado nesta unidade ainda — crie o primeiro aqui mesmo, sem sair do cadastro."}
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Dias da semana</h3>
          <span className="text-xs tabular-nums text-muted-foreground">{formatarHoras(carga)}/semana</span>
        </div>
        <ul className="divide-y rounded-lg border">
          {dias.map((dia) => {
            const turno = turnoDoDia(dia, config.turno_padrao_id, turnosResolvidos);
            return (
              <li key={dia.dow} className="flex flex-wrap items-center gap-3 p-3">
                <Switch
                  checked={dia.trabalha}
                  onCheckedChange={() => alternarDia(dia.dow)}
                  aria-label={`Trabalha ${DOW_LABEL[dia.dow]}`}
                />
                <span className="w-24 shrink-0 text-sm font-medium">{DOW_LABEL[dia.dow]}</span>
                {dia.trabalha ? (
                  <div className="ml-auto flex min-w-[11rem] flex-1 items-center gap-2">
                    <Select
                      value={dia.turno_id ?? "padrao"}
                      onValueChange={(v) => definirTurnoDia(dia.dow, v)}
                    >
                      <SelectTrigger className="h-9 text-xs" aria-label={`Turno de ${DOW_LABEL[dia.dow]}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padrao">Turno padrão</SelectItem>
                        {turnosResolvidos.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome} — {formatarFaixaTurno(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                      aria-label="Criar novo turno" onClick={() => setNovoTurnoOpen(true)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {turno ? formatarFaixaTurno(turno) : "sem turno"}
                    </span>
                  </div>
                ) : (
                  <Badge variant="secondary" className="ml-auto">Folga</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {policy.exigeFolgaSemanal && (
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Switch checked={folgaVariavel} onCheckedChange={setFolgaVariavel} aria-label="Folga variável" />
          <span className="text-sm">
            Folga variável conforme escala
            <span className="block text-xs text-muted-foreground">
              Os dias de folga mudam a cada semana e são definidos na escala do mês.
            </span>
          </span>
        </label>
      )}

      {validacoes.length > 0 && (
        <ul className="space-y-1.5">
          {validacoes.map((v, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                v.nivel === "erro"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {v.mensagem}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ct-obs">Observações</Label>
        <Textarea id="ct-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>

      {showSaveButton && (
        <div className="flex justify-end">
          <Button className="gap-2" disabled={saving || bloqueado} onClick={() => void onSalvar()}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Salvar configuração"}
          </Button>
        </div>
      )}

      {colaborador?.id && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Histórico de vigências</h3>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : configs.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarOff className="h-4 w-4" aria-hidden="true" /> Nenhuma configuração registrada.
            </p>
          ) : (
            <ul className="divide-y">
              {configs.map((c) => {
                const ativo = !c.vigencia_fim || c.vigencia_fim >= hoje();
                return (
                  <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                    <div className="min-w-0 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {fmt(c.vigencia_inicio)} → {fmt(c.vigencia_fim) ?? "sem término"}
                        {ativo && <Badge>Vigente</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {resumoConfigTexto(
                          {
                            turno_padrao_id: c.turno_padrao_id,
                            folga_variavel: c.folga_variavel,
                            folga_fixa_dow: c.folga_fixa_dow,
                            dias: c.dias.map((d) => ({ dow: d.dow, trabalha: d.trabalha, turno_id: d.turno_id })),
                          },
                          turnosResolvidos,
                        )}
                      </p>
                      {c.observacoes && <p className="text-xs text-muted-foreground">{c.observacoes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {ativo && !c.vigencia_fim && (
                        <Button
                          size="sm" variant="outline" disabled={saving}
                          onClick={() => void encerrar.mutateAsync({ id: c.id })}
                        >
                          Encerrar hoje
                        </Button>
                      )}
                      <Button
                        size="icon" variant="ghost" aria-label="Remover configuração" disabled={saving}
                        onClick={() => void remover.mutateAsync(c.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <TurnoForm
        open={novoTurnoOpen}
        onOpenChange={setNovoTurnoOpen}
        titulo="Novo turno"
        unidades={unidades.map((u) => ({ id: u.id, nome: u.nome }))}
        initial={{
          ...TURNO_FORM_DEFAULT,
          unidade_id: unidadeId === "none" ? null : unidadeId,
        }}
        saving={criarTurno.isPending}
        onSubmit={(f) => void onCriarTurno(f)}
      />

      <CopiarConfigColaboradorDialog
        open={copiarOpen}
        onOpenChange={setCopiarOpen}
        colaboradorId={colaborador?.id ?? undefined}
        unidadeId={unidadeId === "none" ? null : unidadeId}
        turnos={turnosResolvidos}
        onCopiar={onCopiarConfig}
      />
    </div>
  );
}

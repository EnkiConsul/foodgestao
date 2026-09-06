import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useDpOperacaoPanorama } from "@/hooks/useDpOperacaoPanorama";
import {
  blocosPorFuncionamento,
  type PessoaPanorama,
} from "@/lib/dp/operacao-panorama";
import { resolverHorarioDestinatario, simularDia } from "@/lib/dp/convocacao-revisao";
import { MOTIVOS_DE_HORARIO, textoDoMotivo } from "@/lib/dp/convocacoes-motivos";
import type { PreAvaliacaoLinha } from "@/hooks/useDpConvocacaoPreAvaliacao";
import type { JornadaDia } from "@/lib/dp/convocacoes-planejamento";
import { cn } from "@/lib/utils";

export interface RevisaoDia {
  cargo_id: string;
  cargo_nome: string;
  data: string;
  entrada: string;
  saida: string;
  vira: boolean;
  vagas: number;
  minimo: number | null;
  confirmados: number;
  aguardando: number;
  faltam: number | null;
  abaixoDaAntecedencia: boolean;
}

export interface RevisaoPessoa {
  id: string;
  nome: string;
  cargo_id: string | null;
  cargo_nome: string;
}

export interface RevisaoHorario {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  vira: boolean;
}

interface Props {
  unidadeId: string | null;
  unidadeNome: string;
  competencia: string;
  titulo: string;
  observacao: string;
  dias: RevisaoDia[];
  destinatarios: RevisaoPessoa[];
  /** chave `cargoId|data|colaboradorId` → ajuste individual. */
  overrides: Record<string, RevisaoHorario>;
  horarioGeral: RevisaoHorario | null;
  jornadaDe: (colaboradorId: string, data: string) => JornadaDia | null;
  prazoRespostaDias: number | null;
  justificativa: string;
  /** Verificação prévia feita pelo banco (mesma regra da publicação). */
  preAvaliacao: PreAvaliacaoLinha[];
  preAvaliacaoCarregando: boolean;
  /** Passa a convocação a usar o horário informado para todos. */
  onUsarHorarioParaTodos: (entrada: string, saida: string, vira: boolean) => void;
  /** Encurta a necessidade do dia/cargo até o fim do horário habitual da pessoa. */
  onAjustarNecessidade: (cargoId: string, data: string, saida: string) => void;
}

const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit",
  });

const rotuloHorario = (h: { entrada: string; saida: string; termina_no_dia_seguinte: boolean }) =>
  `${h.entrada}–${h.saida}${h.termina_no_dia_seguinte ? " (+1)" : ""}`;

export function RevisaoConvocacao(props: Props) {
  const {
    unidadeId, unidadeNome, competencia, titulo, observacao, dias,
    destinatarios, overrides, horarioGeral, jornadaDe, prazoRespostaDias, justificativa,
    preAvaliacao, preAvaliacaoCarregando, onUsarHorarioParaTodos, onAjustarNecessidade,
  } = props;

  /** `cargoId|data|colaboradorId` → linha da verificação prévia. */
  const aptidaoPorChave = useMemo(() => {
    const m = new Map<string, PreAvaliacaoLinha>();
    for (const l of preAvaliacao) m.set(`${l.cargo_id ?? ""}|${l.data}|${l.colaborador_id}`, l);
    return m;
  }, [preAvaliacao]);

  const ordenados = useMemo(
    () => [...dias].sort((a, b) => a.data.localeCompare(b.data) || a.cargo_nome.localeCompare(b.cargo_nome)),
    [dias],
  );

  const [diaSimulado, setDiaSimulado] = useState<string | null>(ordenados[0]?.data ?? null);

  /** Como cada pessoa vai receber o horário em cada dia planejado. */
  const ofertas = useMemo(
    () =>
      ordenados.map((d) => {
        const alvos = destinatarios.filter((p) => !p.cargo_id || p.cargo_id === d.cargo_id);
        const linhas = alvos.map((p) => {
          const h = resolverHorarioDestinatario({
            override: overrides[`${d.cargo_id}|${d.data}|${p.id}`],
            geral: horarioGeral
              ? { ...horarioGeral, termina_no_dia_seguinte: horarioGeral.vira }
              : null,
            jornada: jornadaDe(p.id, d.data),
          });
          return { pessoa: p, horario: h };
        });
        return { dia: d, linhas, semHorario: linhas.filter((l) => !l.horario).length };
      }),
    [ordenados, destinatarios, overrides, horarioGeral, jornadaDe],
  );

  const totalOfertas = ofertas.reduce((acc, o) => acc + o.linhas.filter((l) => !!l.horario).length, 0);
  const totalSemHorario = ofertas.reduce((acc, o) => acc + o.semHorario, 0);

  // ---------------------------------------------------------- simulação da rotina
  const panorama = useDpOperacaoPanorama(competencia, unidadeId);
  const diaPanorama = diaSimulado ? panorama.diaDe(diaSimulado) : null;

  const convocadosDoDia: PessoaPanorama[] = useMemo(() => {
    if (!diaSimulado) return [];
    const out = new Map<string, PessoaPanorama>();
    for (const o of ofertas) {
      if (o.dia.data !== diaSimulado) continue;
      for (const l of o.linhas) {
        if (!l.horario || out.has(l.pessoa.id)) continue;
        out.set(l.pessoa.id, {
          colaborador_id: l.pessoa.id,
          nome: l.pessoa.nome,
          categoria: "convocado_pendente",
          turno_id: null,
          turno_nome: null,
          entrada: l.horario.entrada,
          saida: l.horario.saida,
          termina_no_dia_seguinte: l.horario.termina_no_dia_seguinte,
          carga_prevista_horas: l.horario.carga_prevista_horas,
          unidade_id: unidadeId,
          cargo_id: l.pessoa.cargo_id,
          cargo_nome: l.pessoa.cargo_nome,
          socio: false,
          origem: "convocacao",
        });
      }
    }
    return [...out.values()];
  }, [ofertas, diaSimulado, unidadeId]);

  const simulacao = useMemo(() => {
    const previstas = (diaPanorama?.pessoas ?? []).filter(
      (p) => p.categoria === "fixo" || p.categoria === "convocado_aceito" || p.categoria === "convocado_pendente",
    );
    return simularDia(previstas, convocadosDoDia);
  }, [diaPanorama, convocadosDoDia]);

  const blocos = useMemo(
    () =>
      diaSimulado
        ? blocosPorFuncionamento({
            data: diaSimulado,
            pessoas: simulacao.pessoas,
            funcionamentoPorUnidade: panorama.funcionamentoPorUnidade,
            unidades: panorama.unidades,
            unidadeId,
          })
        : [],
    [diaSimulado, simulacao.pessoas, panorama.funcionamentoPorUnidade, panorama.unidades, unidadeId],
  );

  const datasUnicas = useMemo(() => [...new Set(ordenados.map((d) => d.data))], [ordenados]);

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------- resumo */}
      <div className="rounded-xl border border-border p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          Resumo da convocação
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <div><dt className="text-muted-foreground">Unidade</dt><dd className="font-medium">{unidadeNome}</dd></div>
          <div><dt className="text-muted-foreground">Mês</dt><dd className="font-medium">{competencia}</dd></div>
          <div><dt className="text-muted-foreground">Dias</dt><dd className="font-medium">{ordenados.length}</dd></div>
          <div><dt className="text-muted-foreground">Convites</dt><dd className="font-medium">{totalOfertas}</dd></div>
        </dl>
        {titulo && <p className="mt-2 text-xs"><span className="text-muted-foreground">Título: </span>{titulo}</p>}
        {observacao && <p className="mt-1 text-xs"><span className="text-muted-foreground">Observação: </span>{observacao}</p>}
        {justificativa && (
          <p className="mt-1 text-xs"><span className="text-muted-foreground">Justificativa da exceção: </span>{justificativa}</p>
        )}
        {prazoRespostaDias != null && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Cada pessoa terá {prazoRespostaDias} dia(s) útil(eis) para responder.
          </p>
        )}
      </div>

      {totalSemHorario > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {totalSemHorario} convite(s) sem horário definido: a pessoa não tem jornada cadastrada
            no dia e não há horário padrão nem ajuste individual. Essas pessoas não receberão a oferta.
          </AlertDescription>
        </Alert>
      )}

      {/* -------------------------------------------------- como cada pessoa recebe */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          Como o colaborador vai receber
        </h3>
        {ofertas.map((o) => (
          <div key={`${o.dia.cargo_id}|${o.dia.data}`} className="rounded-lg border border-border p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium capitalize">{rotuloData(o.dia.data)} · {o.dia.cargo_nome}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {o.dia.vagas} vaga{o.dia.vagas > 1 ? "s" : ""}
                </Badge>
                {o.dia.minimo != null && (
                  <Badge variant="secondary" className="text-[10px]">
                    {o.dia.confirmados}/{o.dia.minimo} confirmados
                  </Badge>
                )}
                {o.dia.aguardando > 0 && (
                  <Badge variant="outline" className="text-[10px]">+{o.dia.aguardando} aguardando</Badge>
                )}
                {o.dia.abaixoDaAntecedencia && (
                  <Badge variant="destructive" className="text-[10px]">Abaixo da antecedência</Badge>
                )}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Janela da necessidade: {o.dia.entrada}–{o.dia.saida}{o.dia.vira ? " (+1)" : ""}
            </p>
            {(() => {
              const linhasDia = preAvaliacao.filter(
                (l) => l.data === o.dia.data && (l.cargo_id ?? "") === o.dia.cargo_id,
              );
              if (preAvaliacaoCarregando || linhasDia.length === 0) return null;
              if (linhasDia.some((l) => l.apto)) return null;
              const soHorario = linhasDia.every((l) => MOTIVOS_DE_HORARIO.has(String(l.motivo)));
              const fimHabitual = linhasDia
                .map((l) => l.jornada?.saida?.slice(0, 5) ?? null)
                .find((v): v is string => !!v) ?? null;
              // Janela que o banco realmente avaliou (pode diferir da tela).
              const fimAvaliado = linhasDia
                .map((l) => l.necessidade_saida?.slice(0, 5) ?? null)
                .find((v): v is string => !!v) ?? o.dia.saida;
              return (
                <Alert variant="destructive" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="space-y-2 text-xs">
                    <p>Ninguém deste dia está apto a receber a convocação.</p>
                    {soHorario && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                          onClick={() => onUsarHorarioParaTodos(o.dia.entrada, o.dia.saida, o.dia.vira)}
                        >
                          Usar o horário informado para todos
                        </Button>
                        {fimHabitual && fimHabitual !== o.dia.saida && (
                          <Button
                            type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                            onClick={() => onAjustarNecessidade(o.dia.cargo_id, o.dia.data, fimHabitual)}
                          >
                            Ajustar a necessidade para {o.dia.entrada}–{fimHabitual}
                          </Button>
                        )}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              );
            })()}
            <ul className="mt-2 space-y-1">
              {o.linhas.map((l) => (
                <li
                  key={l.pessoa.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded px-1.5 py-1 text-xs",
                    l.horario ? "bg-muted/40" : "bg-destructive/10",
                  )}
                >
                  <span className="flex-1 truncate">{l.pessoa.nome}</span>
                  <span className="text-[11px] text-muted-foreground">{l.pessoa.cargo_nome}</span>
                  <span className="font-medium">
                    {l.horario ? rotuloHorario(l.horario) : "sem horário"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {l.horario
                      ? l.horario.origem === "individual"
                        ? "ajuste individual"
                        : l.horario.origem === "geral"
                          ? "horário padrão"
                          : "jornada cadastrada"
                      : "não será enviada"}
                  </span>
                  {(() => {
                    const av = aptidaoPorChave.get(`${o.dia.cargo_id}|${o.dia.data}|${l.pessoa.id}`);
                    if (!av) return null;
                    return av.apto ? (
                      <Badge variant="secondary" className="text-[10px]">Apta</Badge>
                    ) : (
                      <span className="w-full text-[11px] text-destructive">
                        {textoDoMotivo(av.motivo, {
                          jornada: av.jornada?.entrada && av.jornada?.saida
                            ? `${av.jornada.entrada.slice(0, 5)}–${av.jornada.saida.slice(0, 5)}`
                            : null,
                          necessidade: `${o.dia.entrada}–${o.dia.saida}`,
                        })}
                      </span>
                    );
                  })()}
                </li>
              ))}
              {o.linhas.length === 0 && (
                <li className="text-[11px] text-muted-foreground">
                  Nenhum destinatário selecionado para este cargo.
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {/* -------------------------------------------------- simulação da rotina */}
      <div className="space-y-2 rounded-xl border border-border p-3">
        <h3 className="text-sm font-semibold">Simulação da rotina do dia</h3>
        <p className="text-[11px] text-muted-foreground">
          Como fica o quadro da unidade se todos aceitarem a convocação.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {datasUnicas.map((iso) => (
            <Button
              key={iso}
              type="button"
              size="sm"
              variant={diaSimulado === iso ? "default" : "outline"}
              onClick={() => setDiaSimulado(iso)}
            >
              {new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </Button>
          ))}
        </div>

        {panorama.isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando a rotina da unidade…</p>
        ) : !diaSimulado ? (
          <p className="text-xs text-muted-foreground">Escolha um dia para ver a simulação.</p>
        ) : (
          <>
            <p className="text-xs">
              Pessoas no dia: <span className="font-semibold">{simulacao.antes}</span> hoje →{" "}
              <span className="font-semibold text-primary">{simulacao.depois}</span> com a convocação
              {simulacao.adicionados > 0 ? ` (+${simulacao.adicionados})` : ""}
            </p>
            <div className="space-y-2">
              {blocos.map((b) => (
                <div key={b.key} className="rounded-lg border border-border p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
                    <span>{b.titulo}{b.horario ? ` · ${b.horario}` : ""}</span>
                    <Badge variant="secondary" className="text-[10px]">{b.pessoas.length} pessoa(s)</Badge>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {b.pessoas.map((p) => (
                      <li key={p.colaborador_id} className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className={cn("flex-1 truncate", p.origem === "convocacao" && "text-primary")}>
                          {p.nome}
                          {p.origem === "convocacao" && " (convocado)"}
                        </span>
                        <span className="text-muted-foreground">{p.cargo_nome ?? "—"}</span>
                        <span>{p.entrada && p.saida ? `${p.entrada}–${p.saida}` : "—"}</span>
                      </li>
                    ))}
                    {b.pessoas.length === 0 && (
                      <li className="text-[11px] text-muted-foreground">Ninguém previsto neste período.</li>
                    )}
                  </ul>
                </div>
              ))}
              {blocos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Sem horário de funcionamento cadastrado para este dia.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Desligamento — aviso prévio e acompanhamento (gestor).
 *
 * O servidor recalcula tudo com o MESMO motor da calculadora, usando dados
 * oficiais: admissão, jornada vigente, escala publicada (exceções) e
 * feriados da unidade. Nada vindo do navegador é aceito como data, empresa
 * ou papel. Não grava `dp_colaboradores.data_desligamento` nem `ativo`: o
 * vínculo segue ativo até a efetivação (worker diário no banco).
 *
 * Ações: previa | confirmar | alterar | reconsideracao | ocorrencia |
 * retomar | pos | encerrar_admin | cancelar.
 * Cobertura automática (regime CLT): dispensa sem justa causa, pedido de
 * demissão (cumprido ou dispensado pela empresa, com/sem desconto), acordo
 * mútuo (art. 484-A) e motivos sem aviso prévio. Demais regimes: "revisão
 * necessária" (sem datas inventadas).
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireUser, serviceClient } from "../_shared/authz.ts";
import { simularDesligamento, MOTIVOS_SEM_AVISO, type MotivoDesligamentoCalc } from "../_shared/desligamento-motor.ts";
import { validarTerminoNovoEmprego } from "./termino.ts";
import { prazoLegalRescisao, prazoPagamentoRescisao } from "../_shared/desligamento-datas.ts";
import { jornadaSemanalDaConfig, configVigenteEm, type DiaConfigMin, type TurnoMin } from "../_shared/desligamento-jornada.ts";
import { datasDeFeriados, type FeriadoRegra } from "../_shared/feriados.ts";

const REGRA_VERSAO = "clt-aviso@2026-11";
const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Chave = z.string().min(8).max(80);
const Motivo = z.enum([
  "dispensa_sem_justa_causa", "pedido_demissao", "acordo_mutuo", "dispensa_com_justa_causa",
  "termino_contrato", "abandono_emprego", "aposentadoria", "falecimento", "outro",
]);

const Condicoes = {
  motivo: Motivo,
  modalidade: z.enum(["trabalhado", "indenizado"]),
  reducao: z.enum(["duas_horas", "sete_dias"]).nullable().optional(),
  data_comunicacao: Data,
  // Pedido de demissão dispensado pela empresa: término acordado + opção de desconto.
  data_termino_acordada: Data.nullable().optional(),
  descontar_aviso: z.boolean().optional(),
  // Declarações obrigatórias no pedido de demissão dispensado (evidência no GED/contabilidade).
  pedido_escrito: z.boolean().optional(),
  aceite_empresa: z.boolean().optional(),
  esperado: z.object({ ultimo: z.string().nullable(), prazo: z.string(), efetiva: z.string() }).optional(),
};
const Body = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("previa"), colaborador_id: z.string().uuid(), ...Condicoes }),
  z.object({ acao: z.literal("confirmar"), colaborador_id: z.string().uuid(), comunicacao_formal: z.boolean(), idempotency_key: Chave, ...Condicoes }),
  z.object({ acao: z.literal("alterar"), processo_id: z.string().uuid(), idempotency_key: Chave, previa: z.boolean().optional(), ...Condicoes }),
  z.object({ acao: z.literal("reconsideracao"), processo_id: z.string().uuid(), idempotency_key: Chave, resultado: z.enum(["aceita", "recusada"]), nota: z.string().max(500).optional() }),
  z.object({ acao: z.literal("ocorrencia"), processo_id: z.string().uuid(), idempotency_key: Chave,
    tipo: z.enum(["dispensa_cumprimento", "novo_emprego", "afastamento", "impedimento_legal", "outro"]), data: Data, nota: z.string().max(500).optional(),
    aplicar_termino: z.literal(true).optional(),
    pedido_dispensado_pelo_empregado: z.boolean().optional(), novo_emprego_comprovado: z.boolean().optional() }),
  // Retomada exige evidência + confirmação; o banco ainda confere férias/atestados/licenças.
  z.object({ acao: z.literal("retomar"), processo_id: z.string().uuid(), idempotency_key: Chave,
    justificativa: z.string().trim().min(20).max(500), confirmado: z.literal(true), fim_impedimento: Data.optional() }),
  z.object({ acao: z.literal("pos"), processo_id: z.string().uuid(), idempotency_key: Chave,
    pagamento_previsto: Data.nullable().optional(), pagamento_status: z.enum(["pendente", "programado", "pago"]).optional(),
    pagamento_em: Data.nullable().optional(), pagamento_ref: z.string().max(120).nullable().optional(),
    valor_informado: z.number().nonnegative().max(10_000_000).nullable().optional(),
    checklist: z.record(z.string().max(40), z.boolean()).optional() }),
  z.object({ acao: z.literal("encerrar_admin"), processo_id: z.string().uuid(), idempotency_key: Chave }),
  z.object({ acao: z.literal("cancelar"), processo_id: z.string().uuid(), justificativa: z.string().min(5).max(500) }),
]);
type BodyT = z.infer<typeof Body>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const somar = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type Colab = { id: string; company_id: string; unidade_id: string | null; data_admissao: string | null; regime: string | null; ativo: boolean; data_desligamento: string | null; deleted_at: string | null };
type Cond = {
  motivo: MotivoDesligamentoCalc; modalidade: "trabalhado" | "indenizado";
  reducao?: "duas_horas" | "sete_dias" | null; data_comunicacao: string;
  data_termino_acordada?: string | null; descontar_aviso?: boolean;
  pedido_escrito?: boolean; aceite_empresa?: boolean;
};

// deno-lint-ignore no-explicit-any
async function feriadosDaUnidade(admin: any, c: Pick<Colab, "unidade_id" | "company_id">, ano: number): Promise<string[]> {
  if (!c.unidade_id) return [];
  const { data: fs } = await admin.from("dp_unidade_feriados")
    .select("id, nome, tipo, data, dia, mes, ordinal, dia_semana, ano_inicio, ativo")
    .eq("unidade_id", c.unidade_id).eq("company_id", c.company_id);
  return [...datasDeFeriados(((fs ?? []) as FeriadoRegra[]).filter((f) => f.ativo !== false), [ano, ano + 1])];
}

// deno-lint-ignore no-explicit-any
async function calcular(admin: any, c: Colab, b: Cond): Promise<{ resultado?: Record<string, unknown>; resp?: Response }> {
  const revisao = (msg: string) => ({ resp: json(422, { revisao: true, error: msg }) });
  if (b.motivo !== "dispensa_sem_justa_causa")
    return revisao("Este motivo ainda não tem regra validada no sistema. Use o registro manual abaixo na data do término, com orientação da contabilidade. Nenhuma data foi calculada.");
  if (c.regime !== "clt") return revisao("O cálculo automático cobre apenas o regime CLT. Para este vínculo, a análise é manual.");
  if (!c.data_admissao) return revisao("Cadastre a data de admissão para calcular.");
  const hoje = hojeSP();
  if (b.data_comunicacao > hoje) return { resp: json(400, { error: "A comunicação não pode ser futura: registre depois de comunicar formalmente." }) };
  if (b.data_comunicacao < somar(hoje, -30)) return { resp: json(400, { error: "Comunicação há mais de 30 dias: use o registro manual." }) };

  const { data: cfgs } = await admin.from("dp_colaborador_config_trabalho")
    .select("vigencia_inicio, vigencia_fim, turno_padrao_id, folga_fixa_dow, dias:dp_colaborador_config_dias(dow, trabalha, turno_id, entrada, saida, intervalo_minutos)")
    .eq("colaborador_id", c.id).eq("company_id", c.company_id);
  type Cfg = { vigencia_inicio: string; vigencia_fim: string | null; turno_padrao_id: string | null; folga_fixa_dow: number | null; dias: DiaConfigMin[] | null };
  const cfg = configVigenteEm((cfgs ?? []) as Cfg[], b.data_comunicacao);
  if (!cfg || !(cfg.dias ?? []).length) return revisao("Jornada do colaborador não cadastrada. Cadastre em Turno & Jornada para calcular.");
  const dias = (cfg.dias ?? []).map((d) => (cfg.folga_fixa_dow === d.dow ? { ...d, trabalha: false } : d));
  const ids = [...new Set([cfg.turno_padrao_id, ...dias.map((d) => d.turno_id)].filter(Boolean))] as string[];
  const { data: turnos } = ids.length
    ? await admin.from("dp_turnos").select("id, entrada, saida, intervalo_minutos").eq("company_id", c.company_id).in("id", ids)
    : { data: [] };
  const j = jornadaSemanalDaConfig(dias, cfg.turno_padrao_id, (turnos ?? []) as TurnoMin[]);
  if (j.incompletos.length) return revisao("Há dia de trabalho sem horário na jornada cadastrada. Corrija antes de registrar.");

  const feriados = await feriadosDaUnidade(admin, c, Number(b.data_comunicacao.slice(0, 4)));

  // Escala publicada no período: exceções reais (ex.: domingo trabalhado).
  const { data: itens } = await admin.from("dp_escala_itens")
    .select("data, tipo, carga_prevista_horas, escala:dp_escalas!inner(status)")
    .eq("colaborador_id", c.id).eq("company_id", c.company_id).eq("escala.status", "publicada")
    .gt("data", b.data_comunicacao).lte("data", somar(b.data_comunicacao, 90));
  const excecoes: { data: string; minutos: number }[] = [];
  let semCarga = false;
  for (const it of (itens ?? []) as { data: string; tipo: string; carga_prevista_horas: number | null }[]) {
    if (it.tipo === "trabalho") {
      if (!it.carga_prevista_horas || it.carga_prevista_horas <= 0) { semCarga = true; continue; }
      excecoes.push({ data: it.data, minutos: Math.round(Number(it.carga_prevista_horas) * 60) });
    } else excecoes.push({ data: it.data, minutos: 0 });
  }
  if (semCarga) return revisao("A escala publicada tem dia de trabalho sem carga horária. Corrija a escala antes de registrar.");

  const r = simularDesligamento({
    dataAdmissao: String(c.data_admissao).slice(0, 10), dataComunicacao: b.data_comunicacao,
    modalidade: b.modalidade, reducao: b.modalidade === "trabalhado" ? b.reducao ?? null : null,
    jornadaSemanal: j.semana, excecoesJornada: excecoes, feriados, folgasCompensatorias: [], saldoBancoMinutos: 0,
  });
  if ("erro" in r) return { resp: json(400, { error: r.erro }) };
  if (b.modalidade === "trabalhado" && !r.ultimoComparecimento)
    return revisao("Não há jornadas previstas no período do aviso. Revise a jornada antes de registrar.");
  const efetiva = r.fimPeriodoCumprido ?? b.data_comunicacao;
  const resultado = {
    motivo: b.motivo,
    modalidade: b.modalidade === "trabalhado" && r.diasProjetadosIndenizados > 0 ? "misto" : b.modalidade,
    reducao: b.modalidade === "trabalhado" ? b.reducao ?? null : null,
    data_comunicacao: b.data_comunicacao, inicio_aviso: r.inicioAviso,
    ultimo_comparecimento: r.ultimoComparecimento, dispensado_desde: r.dispensadoDeComparecerDesde,
    data_efetiva: efetiva, projecao_indenizada: r.terminoProjetado, base_quitacao: r.baseQuitacao,
    prazo_10_dias: r.prazoQuitacao, sugestao_pagamento: r.sugestaoPagamentoDiaUtilAnterior,
    dias_aviso: r.duracaoLegalDias, dias_indenizados: r.diasProjetadosIndenizados,
    regra_versao: REGRA_VERSAO, avisos: r.avisos, usou_escala: excecoes.length > 0,
  };
  if (efetiva < hoje) return { resp: json(409, { error: "O término calculado já passou. Use o registro manual na data do término.", resultado }) };
  return { resultado };
}

const diverge = (e: { ultimo: string | null; prazo: string; efetiva: string } | undefined, r: Record<string, unknown>) =>
  !e || e.ultimo !== r.ultimo_comparecimento || e.prazo !== r.prazo_10_dias || e.efetiva !== r.data_efetiva;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sessão inválida" });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "Dados inválidos", campos: parsed.error.flatten().fieldErrors });
  const b: BodyT = parsed.data;
  const admin = serviceClient();
  const autorizado = async (companyId: string) => {
    const { data, error } = await admin.rpc("is_company_admin_or_owner", { _user_id: user.id, _company_id: companyId });
    return !error && data === true;
  };
  // Alertas D-2/prazo/sugestão do próprio processo já na confirmação (não espera o cron).
  const alertarAgora = async (id?: string) => {
    if (!id) return 0;
    const { data } = await admin.rpc("dp_desligamento_alertas_processo", { p_processo: id, p_hoje: null });
    return typeof data === "number" ? data : 0;
  };
  const carregarColab = async (id: string) => {
    const { data } = await admin.from("dp_colaboradores")
      .select("id, company_id, unidade_id, data_admissao, regime, ativo, data_desligamento, deleted_at").eq("id", id).maybeSingle();
    return data as Colab | null;
  };

  try {
    if (b.acao === "previa" || b.acao === "confirmar") {
      const c = await carregarColab(b.colaborador_id);
      // Mesma resposta para inexistente e de outra empresa: não revela cadastro alheio.
      if (!c || !(await autorizado(c.company_id))) return json(403, { error: "Sem permissão" });
      if (!c.ativo || c.data_desligamento || c.deleted_at) return json(409, { error: "Colaborador não está ativo." });
      const { resultado, resp } = await calcular(admin, c, b);
      if (resp) return resp;
      if (b.acao === "previa") return json(200, { resultado });
      if (!b.comunicacao_formal) return json(400, { error: "Confirme que a comunicação formal foi entregue ao colaborador." });
      if (diverge(b.esperado, resultado!)) return json(409, { divergente: true, error: "As datas oficiais mudaram desde a prévia. Revise e confirme de novo.", resultado });
      const { avisos: _a, usou_escala: _u, ...gravar } = resultado!;
      const { data, error } = await admin.rpc("dp_desligamento_registrar_aviso", { p: { ...gravar, colaborador_id: c.id, idempotency_key: b.idempotency_key, ator: user.id } });
      if (error) return json(409, { error: error.message });
      const alertas = await alertarAgora((data as { id?: string })?.id);
      return json(200, { ok: true, ...(data as Record<string, unknown>), resultado, alertas });
    }

    const { data: proc } = await admin.from("dp_desligamento_processos").select("id, company_id, colaborador_id, status").eq("id", b.processo_id).maybeSingle();
    if (!proc || !(await autorizado(proc.company_id))) return json(403, { error: "Sem permissão" });

    if (b.acao === "cancelar") {
      const { error } = await admin.rpc("dp_desligamento_cancelar", { p_processo: proc.id, p_ator: user.id, p_justificativa: b.justificativa });
      if (error) return json(409, { error: error.message });
      return json(200, { ok: true });
    }

    let extra: Record<string, unknown> = {};
    if (b.acao === "alterar") {
      const c = await carregarColab(proc.colaborador_id);
      if (!c || !c.ativo || c.data_desligamento) return json(409, { error: "Colaborador não está ativo." });
      const { resultado, resp } = await calcular(admin, c, b);
      if (resp) return resp;
      if (b.previa) return json(200, { resultado });
      if (diverge(b.esperado, resultado!)) return json(409, { divergente: true, error: "As datas oficiais mudaram. Revise e confirme de novo.", resultado });
      const { avisos: _a, usou_escala: _u, motivo: _m, ...gravar } = resultado!;
      extra = gravar;
    }
    if (b.acao === "ocorrencia" && b.aplicar_termino) {
      // Súmula 276: novo emprego comprovado encerra no último dia trabalhado; prazo do 10º dia dessa data.
      const erroTermino = validarTerminoNovoEmprego(b, hojeSP());
      if (erroTermino) return json(400, { error: erroTermino });
      const c = await carregarColab(proc.colaborador_id);
      if (!c || !c.ativo || c.data_desligamento) return json(409, { error: "Colaborador não está ativo." });
      const feriados = new Set(await feriadosDaUnidade(admin, c, Number(b.data.slice(0, 4))));
      extra = { aplicar_termino: true, prazo_10_dias: prazoLegalRescisao(b.data), sugestao_pagamento: prazoPagamentoRescisao(b.data, feriados) };
    }
    const { acao, processo_id, idempotency_key, ...resto } = b as Record<string, unknown> & { acao: string; processo_id: string; idempotency_key: string };
    if (acao === "alterar") { delete resto.esperado; delete resto.previa; delete resto.motivo; }
    const { data, error } = await admin.rpc("dp_desligamento_transicao", {
      p: { ...resto, ...extra, acao, processo_id, idempotency_key, ator: user.id },
    });
    if (error) return json(409, { error: error.message });
    const alertas = await alertarAgora(proc.id);
    return json(200, { ok: true, ...(data as Record<string, unknown>), alertas });
  } catch (_e) {
    // Log sem dados pessoais.
    console.error("dp-desligamento-aviso: falha interna", (b as { acao: string }).acao);
    return json(500, { error: "Falha interna. Tente de novo." });
  }
});

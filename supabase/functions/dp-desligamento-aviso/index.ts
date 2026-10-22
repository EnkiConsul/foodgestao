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
import { simularDesligamento, modalidadePersistida, MOTIVOS_SEM_AVISO, type MotivoDesligamentoCalc } from "../_shared/desligamento-motor.ts";
import { mesclarFolgasAgendadas, type FolgaAgendada } from "../_shared/desligamento-folgas.ts";
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
  // Motivos sem aviso que exigem determinação factual/jurídica (abandono, aposentadoria, outro).
  confirmacao_sem_aviso: z.boolean().optional(),
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
  pedido_escrito?: boolean; aceite_empresa?: boolean; confirmacao_sem_aviso?: boolean;
};

/** Motivos sem aviso que não podem ser validados pela mera seleção. */
const SEM_AVISO_ASSISTIDO: ReadonlySet<string> = new Set(["abandono_emprego", "aposentadoria", "outro"]);

// deno-lint-ignore no-explicit-any
async function feriadosDaUnidade(admin: any, c: Pick<Colab, "unidade_id" | "company_id">, ano: number): Promise<string[]> {
  if (!c.unidade_id) return [];
  const { data: fs } = await admin.from("dp_unidade_feriados")
    .select("id, nome, tipo, data, dia, mes, ordinal, dia_semana, ano_inicio, ativo")
    .eq("unidade_id", c.unidade_id).eq("company_id", c.company_id);
  return [...datasDeFeriados(((fs ?? []) as FeriadoRegra[]).filter((f) => f.ativo !== false), [ano, ano + 1])];
}

// deno-lint-ignore no-explicit-any
async function calcular(admin: any, c: Colab, b: Cond, previa = false): Promise<{ resultado?: Record<string, unknown>; resp?: Response }> {
  const revisao = (msg: string) => ({ resp: json(422, { revisao: true, error: msg }) });
  if (c.regime !== "clt") return revisao("O cálculo automático cobre apenas o regime CLT. Para este vínculo, a análise é manual, com confirmação da contabilidade ou do jurídico.");
  if (!c.data_admissao) return revisao("Cadastre a data de admissão para calcular.");
  const semAviso = MOTIVOS_SEM_AVISO.has(b.motivo);
  const pedidoDispensado = b.motivo === "pedido_demissao" && b.modalidade === "indenizado";
  if (b.motivo === "pedido_demissao" && b.reducao)
    return { resp: json(400, { error: "A redução do art. 488 (2 horas ou 7 dias) não se aplica ao pedido de demissão." }) };
  // Na prévia as declarações não são exigidas: só valem para gravar.
  if (!previa && pedidoDispensado && (b.pedido_escrito !== true || b.aceite_empresa !== true))
    return { resp: json(400, { error: "Confirme as duas declarações: o pedido escrito do colaborador e o aceite da empresa. Guarde a evidência no GED ou com a contabilidade." }) };
  if (!previa && SEM_AVISO_ASSISTIDO.has(b.motivo) && b.confirmacao_sem_aviso !== true)
    return { resp: json(400, { error: "Este motivo exige determinação factual ou jurídica. Confirme que a data de término foi validada (ex.: abandono caracterizado, aposentadoria que encerra o vínculo) antes de registrar." }) };
  const hoje = hojeSP();
  if (b.data_comunicacao > hoje) return { resp: json(400, { error: "A comunicação não pode ser futura: registre depois de comunicar formalmente." }) };
  // Registro tardio é permitido: o gestor pode lançar dias ou semanas depois.

  // Jornada e escala só são exigidas quando há aviso com jornadas (trabalhado).
  const precisaJornada = !semAviso && b.modalidade === "trabalhado";
  let semana: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
  let excecoes: { data: string; minutos: number }[] = [];
  if (!semAviso) {
    const { data: cfgs, error: errCfg } = await admin.from("dp_colaborador_config_trabalho")
      .select("vigencia_inicio, vigencia_fim, turno_padrao_id, folga_fixa_dow, dias:dp_colaborador_config_dias(dow, trabalha, turno_id, entrada, saida, intervalo_minutos)")
      .eq("colaborador_id", c.id).eq("company_id", c.company_id);
    if (errCfg) return revisao("Não foi possível ler a jornada cadastrada. Tente de novo; se persistir, registre manualmente.");
    type Cfg = { vigencia_inicio: string; vigencia_fim: string | null; turno_padrao_id: string | null; folga_fixa_dow: number | null; dias: DiaConfigMin[] | null };
    const cfg = configVigenteEm((cfgs ?? []) as Cfg[], b.data_comunicacao);
    if (precisaJornada && (!cfg || !(cfg.dias ?? []).length))
      return revisao("Jornada do colaborador não cadastrada. Cadastre em Turno & Jornada para calcular.");
    if (cfg && (cfg.dias ?? []).length) {
      const dias = (cfg.dias ?? []).map((d) => (cfg.folga_fixa_dow === d.dow ? { ...d, trabalha: false } : d));
      const ids = [...new Set([cfg.turno_padrao_id, ...dias.map((d) => d.turno_id)].filter(Boolean))] as string[];
      const { data: turnos, error: errTurnos } = ids.length
        ? await admin.from("dp_turnos").select("id, entrada, saida, intervalo_minutos").eq("company_id", c.company_id).in("id", ids)
        : { data: [], error: null };
      if (errTurnos) return revisao("Não foi possível ler os turnos cadastrados. Tente de novo; se persistir, registre manualmente.");
      const j = jornadaSemanalDaConfig(dias, cfg.turno_padrao_id, (turnos ?? []) as TurnoMin[]);
      if (precisaJornada && j.incompletos.length)
        return revisao("Há dia de trabalho sem horário na jornada cadastrada. Corrija antes de registrar.");
      semana = j.semana;
    }

    // Escala publicada no período: exceções reais (ex.: domingo trabalhado).
    const { data: itens, error: errEscala } = await admin.from("dp_escala_itens")
      .select("data, tipo, carga_prevista_horas, escala:dp_escalas!inner(status)")
      .eq("colaborador_id", c.id).eq("company_id", c.company_id).eq("escala.status", "publicada")
      .gt("data", b.data_comunicacao).lte("data", somar(b.data_comunicacao, 90));
    if (errEscala) return revisao("Não foi possível ler a escala publicada. Tente de novo; se persistir, registre manualmente.");
    let semCarga = false;
    for (const it of (itens ?? []) as { data: string; tipo: string; carga_prevista_horas: number | null }[]) {
      if (it.tipo === "trabalho") {
        if (!it.carga_prevista_horas || it.carga_prevista_horas <= 0) { semCarga = true; continue; }
        excecoes.push({ data: it.data, minutos: Math.round(Number(it.carga_prevista_horas) * 60) });
      } else excecoes.push({ data: it.data, minutos: 0 });
    }
    if (semCarga) return revisao("A escala publicada tem dia de trabalho sem carga horária. Corrija a escala antes de registrar.");
  }

  const feriados = await feriadosDaUnidade(admin, c, Number(b.data_comunicacao.slice(0, 4)));

  // Folgas AGENDADAS dentro do período entram como DIA SEM TRABALHO (exceção
  // de jornada zero) — nunca como abatimento de banco de horas: o cadastro
  // não confirma origem bancária e nenhum saldo é inventado ou descontado.
  // Conflito com a escala publicada (trabalho no mesmo dia) vira revisão.
  let folgasConsideradas: string[] = [];
  if (!semAviso && b.modalidade === "trabalhado") {
    const { data: fls, error: errFolgas } = await admin.from("dp_folgas")
      .select("data, tipo, origem, direito_origem")
      .eq("colaborador_id", c.id).eq("company_id", c.company_id)
      .eq("status", "agendada")
      .gt("data", b.data_comunicacao).lte("data", somar(b.data_comunicacao, 95));
    if (errFolgas) return revisao("Não foi possível ler as folgas agendadas. Tente de novo; se persistir, registre manualmente.");
    const mescla = mesclarFolgasAgendadas(excecoes, (fls ?? []) as FolgaAgendada[]);
    if (mescla.conflitos.length)
      return revisao(`Há folga agendada em dia que a escala publicada marca como trabalho (${mescla.conflitos.join(", ")}). Resolva o conflito na agenda antes de registrar.`);
    excecoes = mescla.excecoes;
    folgasConsideradas = mescla.consideradas;
  }

  const r = simularDesligamento({
    dataAdmissao: String(c.data_admissao).slice(0, 10), dataComunicacao: b.data_comunicacao,
    motivo: b.motivo, modalidade: b.modalidade, reducao: b.modalidade === "trabalhado" ? b.reducao ?? null : null,
    dataTerminoAcordada: pedidoDispensado ? b.data_termino_acordada ?? null : null,
    descontarAviso: pedidoDispensado ? b.descontar_aviso === true : undefined,
    jornadaSemanal: semana, excecoesJornada: excecoes, feriados,
    // Saldo/folgas de banco só existem na simulação da calculadora; aqui nada é descontado.
    folgasCompensatorias: [], saldoBancoMinutos: 0,
  });
  if ("erro" in r) return { resp: json(400, { error: r.erro }) };
  if (!semAviso && b.modalidade === "trabalhado" && !r.ultimoComparecimento)
    return revisao("Não há jornadas previstas no período do aviso. Revise a jornada antes de registrar.");
  const efetiva = r.dataEfetiva;
  const avisos = [...r.avisos];
  if (folgasConsideradas.length)
    avisos.push(`${folgasConsideradas.length} folga(s) agendada(s) foram consideradas como dia sem trabalho. A origem em banco de horas não é confirmada pelo cadastro: nada foi descontado do banco.`);
  const resultado = {
    motivo: b.motivo,
    // Dispensa do cumprimento (pedido de demissão) nunca é gravada como "indenizado".
    modalidade: modalidadePersistida(b.modalidade, r),
    reducao: b.modalidade === "trabalhado" ? b.reducao ?? null : null,
    sem_aviso: r.semAviso, aviso_dispensado: r.avisoDispensado, descontar_aviso: r.descontarAviso,
    pedido_escrito_confirmado: pedidoDispensado ? true : false,
    aceite_empresa_confirmado: pedidoDispensado ? true : false,
    data_comunicacao: b.data_comunicacao, inicio_aviso: r.inicioAviso,
    ultimo_comparecimento: r.ultimoComparecimento, dispensado_desde: r.dispensadoDeComparecerDesde,
    // Pedido de demissão com dispensa do cumprimento: não há projeção
    // indenizada (a empresa dispensou, não indenizou) — grava null.
    data_efetiva: efetiva, projecao_indenizada: r.avisoDispensado ? null : r.terminoProjetado, base_quitacao: r.baseQuitacao,
    prazo_10_dias: r.prazoQuitacao, sugestao_pagamento: r.sugestaoPagamentoDiaUtilAnterior,
    dias_aviso: r.duracaoLegalDias, dias_indenizados: r.diasProjetadosIndenizados,
    regra_versao: REGRA_VERSAO, avisos, usou_escala: excecoes.length > 0,
  };
  return { resultado: { ...resultado, termino_passado: efetiva < hoje, prazo_vencido: r.prazoQuitacao < hoje } };
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
      const { resultado, resp } = await calcular(admin, c, b, b.acao === "previa");
      if (resp) return resp;
      if (b.acao === "previa") return json(200, { resultado });
      if (!b.comunicacao_formal) return json(400, { error: "Confirme que a comunicação formal foi entregue ao colaborador." });
      if (diverge(b.esperado, resultado!)) return json(409, { divergente: true, error: "As datas oficiais mudaram desde a prévia. Revise e confirme de novo.", resultado });
      const { avisos: _a, usou_escala: _u, termino_passado, prazo_vencido: _pv, ...gravar } = resultado!;
      const { data, error } = await admin.rpc("dp_desligamento_registrar_aviso", { p: { ...gravar, colaborador_id: c.id, idempotency_key: b.idempotency_key, ator: user.id } });
      if (error) return json(409, { error: error.message });
      // Registro tardio: o término já passou, então efetiva agora pelo mesmo
      // processo do robô diário (idempotente; confere férias e cadastro).
      let efetivado = false;
      if (termino_passado) {
        const { error: errProc } = await admin.rpc("dp_desligamento_processar", { p_hoje: null, p_simular: false });
        if (!errProc) {
          const { data: st } = await admin.from("dp_desligamento_processos").select("status").eq("id", (data as { id?: string })?.id ?? "").maybeSingle();
          efetivado = st?.status === "efetivado";
        }
      }
      const alertas = await alertarAgora((data as { id?: string })?.id);
      return json(200, { ok: true, ...(data as Record<string, unknown>), resultado, alertas, efetivado });
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
      const { resultado, resp } = await calcular(admin, c, b, b.previa === true);
      if (resp) return resp;
      if (b.previa) return json(200, { resultado });
      if (diverge(b.esperado, resultado!)) return json(409, { divergente: true, error: "As datas oficiais mudaram. Revise e confirme de novo.", resultado });
      const { avisos: _a, usou_escala: _u, motivo: _m, termino_passado: _tp, prazo_vencido: _pv, ...gravar } = resultado!;
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

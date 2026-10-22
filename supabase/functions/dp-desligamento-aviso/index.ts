/**
 * Registro do aviso prévio (Fase 3A).
 *
 * O servidor recalcula tudo com o MESMO motor da calculadora, usando dados
 * oficiais (admissão, jornada vigente, feriados da unidade). Nada vindo do
 * navegador é aceito como data, empresa ou papel. Não grava
 * `dp_colaboradores.data_desligamento` nem `ativo`: o vínculo segue ativo.
 *
 * Ações: "previa" (só calcula), "confirmar" (grava processo + evento em uma
 * transação, idempotente), "cancelar" (registro lançado por engano).
 * Cobertura: dispensa sem justa causa pela empresa, regime CLT. Demais
 * motivos/regimes ficam em "revisão necessária" (sem datas inventadas).
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireUser, serviceClient } from "../_shared/authz.ts";
import { simularDesligamento } from "../_shared/desligamento-motor.ts";
import { jornadaSemanalDaConfig, configVigenteEm, type DiaConfigMin, type TurnoMin } from "../_shared/desligamento-jornada.ts";
import { datasDeFeriados, type FeriadoRegra } from "../_shared/feriados.ts";

const REGRA_VERSAO = "clt-dispensa-sem-justa-causa@2026-10";

const Body = z.discriminatedUnion("acao", [
  z.object({
    acao: z.enum(["previa", "confirmar"]),
    colaborador_id: z.string().uuid(),
    motivo: z.string().min(1).max(60),
    modalidade: z.enum(["trabalhado", "indenizado"]),
    reducao: z.enum(["duas_horas", "sete_dias"]).nullable().optional(),
    data_comunicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    comunicacao_formal: z.boolean().optional(),
    idempotency_key: z.string().min(8).max(80).optional(),
    esperado: z.object({ ultimo: z.string().nullable(), prazo: z.string(), efetiva: z.string() }).optional(),
  }),
  z.object({ acao: z.literal("cancelar"), processo_id: z.string().uuid(), justificativa: z.string().min(5).max(500) }),
]);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const somar = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sessão inválida" });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "Dados inválidos", campos: parsed.error.flatten().fieldErrors });
  const b = parsed.data;
  const admin = serviceClient();

  const autorizado = async (companyId: string) => {
    const { data, error } = await admin.rpc("is_company_admin_or_owner", { _user_id: user.id, _company_id: companyId });
    return !error && data === true;
  };

  if (b.acao === "cancelar") {
    const { data: proc } = await admin.from("dp_desligamento_processos").select("id, company_id").eq("id", b.processo_id).maybeSingle();
    if (!proc || !(await autorizado(proc.company_id))) return json(403, { error: "Sem permissão" });
    const { error } = await admin.rpc("dp_desligamento_cancelar", { p_processo: proc.id, p_ator: user.id, p_justificativa: b.justificativa });
    if (error) return json(409, { error: error.message });
    return json(200, { ok: true });
  }

  const { data: c } = await admin.from("dp_colaboradores")
    .select("id, company_id, unidade_id, data_admissao, regime, ativo, data_desligamento, deleted_at")
    .eq("id", b.colaborador_id).maybeSingle();
  // Mesma resposta para inexistente e de outra empresa: não revela cadastro alheio.
  if (!c || !(await autorizado(c.company_id))) return json(403, { error: "Sem permissão" });
  if (!c.ativo || c.data_desligamento || c.deleted_at) return json(409, { error: "Colaborador não está ativo." });

  const revisao = (msg: string) => json(422, { revisao: true, error: msg });
  if (b.motivo !== "dispensa_sem_justa_causa")
    return revisao("Este motivo ainda não tem regra validada no sistema. Registre com o RH/contabilidade; nenhuma data foi calculada.");
  if (c.regime !== "clt")
    return revisao("O cálculo automático cobre apenas o regime CLT. Para este vínculo, a análise é manual.");
  if (!c.data_admissao) return revisao("Cadastre a data de admissão para calcular.");

  const hoje = hojeSP();
  if (b.data_comunicacao > hoje) return json(400, { error: "A comunicação não pode ser futura: registre depois de comunicar formalmente." });
  if (b.data_comunicacao < somar(hoje, -30)) return json(400, { error: "Comunicação há mais de 30 dias: registre pela análise manual." });

  // Jornada oficial vigente na comunicação.
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

  let feriados: string[] = [];
  if (c.unidade_id) {
    const { data: fs } = await admin.from("dp_unidade_feriados")
      .select("id, nome, tipo, data, dia, mes, ordinal, dia_semana, ano_inicio, ativo")
      .eq("unidade_id", c.unidade_id).eq("company_id", c.company_id);
    const ano = Number(b.data_comunicacao.slice(0, 4));
    feriados = [...datasDeFeriados(((fs ?? []) as FeriadoRegra[]).filter((f) => f.ativo !== false), [ano, ano + 1])];
  }

  const r = simularDesligamento({
    dataAdmissao: String(c.data_admissao).slice(0, 10), dataComunicacao: b.data_comunicacao,
    modalidade: b.modalidade, reducao: b.modalidade === "trabalhado" ? b.reducao ?? null : null,
    jornadaSemanal: j.semana, feriados, folgasCompensatorias: [], saldoBancoMinutos: 0,
  });
  if ("erro" in r) return json(400, { error: r.erro });

  const efetiva = r.fimPeriodoCumprido ?? b.data_comunicacao;
  const resultado = {
    motivo: b.motivo,
    modalidade: b.modalidade === "trabalhado" && r.diasProjetadosIndenizados > 0 ? "misto" : b.modalidade,
    reducao: b.modalidade === "trabalhado" ? b.reducao ?? null : null,
    data_comunicacao: b.data_comunicacao, inicio_aviso: r.inicioAviso,
    ultimo_comparecimento: r.ultimoComparecimento, dispensado_desde: r.dispensadoDeComparecerDesde,
    data_efetiva: efetiva, projecao_indenizada: r.terminoProjetado, base_quitacao: r.baseQuitacao,
    prazo_10_dias: r.prazoQuitacao, sugestao_pagamento: r.sugestaoPagamentoDiaUtilAnterior,
    dias_aviso: r.duracaoLegalDias, dias_indenizados: r.modalidade === undefined ? 0 : r.diasProjetadosIndenizados,
    regra_versao: REGRA_VERSAO, avisos: r.avisos,
  };
  if (b.modalidade === "trabalhado" && !r.ultimoComparecimento)
    return revisao("Não há jornadas previstas no período do aviso. Revise a jornada antes de registrar.");
  if (efetiva < hoje)
    return json(409, { error: "O término calculado já passou. Use o registro de desligamento na data do término.", resultado });

  if (b.acao === "previa") return json(200, { resultado });

  if (!b.comunicacao_formal) return json(400, { error: "Confirme que a comunicação formal foi entregue ao colaborador." });
  if (!b.idempotency_key) return json(400, { error: "Chave de confirmação ausente." });
  if (!b.esperado || b.esperado.ultimo !== resultado.ultimo_comparecimento || b.esperado.prazo !== resultado.prazo_10_dias || b.esperado.efetiva !== efetiva)
    return json(409, { divergente: true, error: "As datas oficiais mudaram desde a prévia. Revise e confirme de novo.", resultado });

  const { avisos: _a, ...gravar } = resultado;
  const { data, error } = await admin.rpc("dp_desligamento_registrar_aviso", {
    p: { ...gravar, colaborador_id: c.id, idempotency_key: b.idempotency_key, ator: user.id },
  });
  if (error) return json(409, { error: error.message });
  return json(200, { ok: true, ...(data as Record<string, unknown>), resultado });
});

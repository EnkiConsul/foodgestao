// ------------------------------------------------------------------
// Analytics — Pessoas 360° · leitura da operação em janela longa
//
// O Analytics precisa contar vários meses de uma vez, então lê a operação em
// uma única janela e monta as mesmas entradas que a Rotina usa em `contarDia`.
// Metodologia idêntica à da Rotina: mesma fonte, mesmo motor, mesma tolerância.
// ------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { normalizarDias, type ConfigTrabalho, type DiaConfig, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import { isSocio } from "@/lib/dp/contrato-policy";
import type {
  AusenciaPanorama,
  ColaboradorPanorama,
  ConvocacaoPanorama,
  FolgaPanorama,
  ItemEscalaPanorama,
  PessoaAvulsaPanorama,
  PessoaAvulsaTipo,
} from "@/lib/dp/operacao-panorama";

export interface SetorPanorama {
  id: string;
  nome: string;
  ativo: boolean | null;
  unidade_id: string | null;
}

export interface DadosPanorama {
  colaboradores: ColaboradorPanorama[];
  turnos: TurnoResolvido[];
  folgas: FolgaPanorama[];
  convocacoes: ConvocacaoPanorama[];
  ausencias: AusenciaPanorama[];
  itens: ItemEscalaPanorama[];
  avulsos: PessoaAvulsaPanorama[];
  setores: SetorPanorama[];
  cargos: { id: string; nome: string }[];
  unidades: { id: string; nome: string }[];
}

/** Lê e monta a operação entre duas datas (inclusive), pronta para `contarDia`. */
export async function carregarPanorama(
  companyId: string,
  inicio: string,
  fim: string,
): Promise<DadosPanorama> {
  const [
    colabs,
    turnosRes,
    configs,
    ferias,
    folgasRes,
    convocacoesRes,
    atestados,
    folgasAprovadas,
    escalas,
    unidades,
    cargos,
    setoresRes,
    avulsasRes,
  ] = await Promise.all([
    supabase
      .from("dp_colaboradores")
      .select(
        "id, nome, regime, vinculo_label, unidade_id, cargo_id, setor_id, ativo, data_admissao, data_desligamento",
      )
      .eq("company_id", companyId)
      .order("nome"),
    supabase
      .from("dp_turnos")
      .select("id, nome, cor, entrada, saida, intervalo_minutos, unidade_id, ativo")
      .eq("company_id", companyId),
    supabase
      .from("dp_colaborador_config_trabalho")
      .select("*, dias:dp_colaborador_config_dias(dow, trabalha, turno_id, setor_id)")
      .eq("company_id", companyId)
      .lte("vigencia_inicio", fim)
      .order("vigencia_inicio", { ascending: false }),
    supabase
      .from("dp_ferias_gozos")
      .select("colaborador_id, data_inicio, data_fim, status")
      .eq("company_id", companyId)
      .lte("data_inicio", fim)
      .gte("data_fim", inicio),
    supabase
      .from("dp_folgas")
      .select("colaborador_id, data, tipo, extra, status")
      .eq("company_id", companyId)
      .neq("status", "cancelada")
      .gte("data", inicio)
      .lte("data", fim),
    supabase
      .from("dp_convocacoes")
      .select("colaborador_id, data, status, turno_id, entrada, saida, intervalo_minutos, unidade_id")
      .eq("company_id", companyId)
      .in("status", ["pendente", "aceita"])
      .gte("data", inicio)
      .lte("data", fim),
    supabase
      .from("dp_solicitacoes")
      .select("colaborador_id, tipo, status, data_alvo, data_fim")
      .eq("company_id", companyId)
      .eq("tipo", "atestado")
      .eq("status", "aprovada"),
    supabase
      .from("dp_solicitacoes")
      .select("colaborador_id, data_alvo")
      .eq("company_id", companyId)
      .eq("tipo", "folga")
      .eq("status", "aprovada")
      .gte("data_alvo", inicio)
      .lte("data_alvo", fim),
    supabase
      .from("dp_escalas")
      .select("id, unidade_id, competencia, status")
      .eq("company_id", companyId)
      .eq("status", "publicada")
      .gte("competencia", inicio.slice(0, 7))
      .lte("competencia", fim.slice(0, 7)),
    supabase.from("dp_unidades").select("id, nome").eq("company_id", companyId).order("nome"),
    supabase.from("dp_cargos").select("id, nome").eq("company_id", companyId),
    supabase
      .from("dp_setores")
      .select("id, nome, ativo, unidade_id")
      .eq("company_id", companyId)
      .order("nome"),
    supabase
      .from("dp_pessoas_avulsas")
      .select(
        "id, nome, tipo, colaborador_id, unidade_id, cargo_id, cobre_colaborador_id, data_inicio, data_fim, entrada, saida, termina_no_dia_seguinte, observacao",
      )
      .eq("company_id", companyId)
      .lte("data_inicio", fim)
      .gte("data_fim", inicio),
  ]);

  const respostas = [
    colabs,
    turnosRes,
    configs,
    ferias,
    folgasRes,
    convocacoesRes,
    atestados,
    folgasAprovadas,
    escalas,
    unidades,
    cargos,
    setoresRes,
    avulsasRes,
  ];
  const err = respostas.find((r) => r.error);
  if (err?.error) throw err.error;

  const escalaIds = (escalas.data ?? []).map((e) => e.id);
  let itens: ItemEscalaPanorama[] = [];
  if (escalaIds.length) {
    const { data, error } = await supabase
      .from("dp_escala_itens")
      .select("colaborador_id, data, tipo, turno_id, entrada, saida, intervalo_minutos, setor_id")
      .in("escala_id", escalaIds)
      .gte("data", inicio)
      .lte("data", fim);
    if (error) throw error;
    itens = (data ?? []).map((i) => ({
      colaborador_id: i.colaborador_id,
      data: i.data,
      tipo: i.tipo,
      turno_id: i.turno_id,
      entrada: i.entrada,
      saida: i.saida,
      intervalo_minutos: i.intervalo_minutos,
      setor_id: i.setor_id ?? null,
    }));
  }

  const listaCargos = (cargos.data ?? []) as { id: string; nome: string }[];
  const nomeCargo = new Map(listaCargos.map((c) => [c.id, c.nome]));
  const nomeColab = new Map((colabs.data ?? []).map((c) => [c.id, c.nome]));

  const colaboradores: ColaboradorPanorama[] = (colabs.data ?? []).map((c) => {
    const vigente = (configs.data ?? []).find(
      (cfg) =>
        cfg.colaborador_id === c.id &&
        cfg.vigencia_inicio <= fim &&
        (!cfg.vigencia_fim || cfg.vigencia_fim >= inicio),
    );
    const config: ConfigTrabalho | null = vigente
      ? {
          turno_padrao_id: vigente.turno_padrao_id,
          folga_variavel: vigente.folga_variavel,
          folga_fixa_dow: vigente.folga_fixa_dow,
          dias: normalizarDias(
            ((vigente as unknown as { dias?: DiaConfig[] }).dias ?? []).map((x) => ({
              dow: x.dow,
              trabalha: x.trabalha,
              turno_id: x.turno_id ?? null,
              setor_id: x.setor_id ?? null,
            })),
            vigente.folga_variavel ? null : vigente.folga_fixa_dow,
          ),
        }
      : null;
    return {
      id: c.id,
      nome: c.nome,
      regime: c.regime,
      unidade_id: c.unidade_id,
      intermitente: c.regime === "intermitente" || c.regime === "freelancer",
      config,
      cargo_id: c.cargo_id,
      cargo_nome: c.cargo_id ? nomeCargo.get(c.cargo_id) ?? null : null,
      setor_id: (c as { setor_id?: string | null }).setor_id ?? null,
      socio: isSocio((c as { vinculo_label?: string | null }).vinculo_label),
      ativo: c.ativo !== false,
      data_admissao: c.data_admissao,
      data_desligamento: c.data_desligamento,
    };
  });

  const efetivadas: FolgaPanorama[] = (folgasRes.data ?? []).map((f) => ({
    colaborador_id: f.colaborador_id,
    data: f.data,
    tipo: f.tipo,
    extra: f.extra,
  }));
  const jaTem = new Set(efetivadas.map((f) => `${f.colaborador_id}|${f.data}`));
  const folgas: FolgaPanorama[] = [
    ...efetivadas,
    ...(folgasAprovadas.data ?? [])
      .filter((s) => !!s.data_alvo && !jaTem.has(`${s.colaborador_id}|${s.data_alvo}`))
      .map((s) => ({ colaborador_id: s.colaborador_id, data: s.data_alvo!, tipo: "normal", extra: false })),
  ];

  const ausencias: AusenciaPanorama[] = [
    ...(ferias.data ?? [])
      .filter((f) => f.status !== "cancelado")
      .map((f) => ({
        colaborador_id: f.colaborador_id,
        inicio: f.data_inicio,
        fim: f.data_fim,
        tipo: "ferias" as const,
      })),
    ...(atestados.data ?? [])
      .filter((a) => !!a.data_alvo)
      .map((a) => ({
        colaborador_id: a.colaborador_id,
        inicio: a.data_alvo!,
        fim: a.data_fim ?? a.data_alvo!,
        tipo: "atestado" as const,
      })),
  ];

  return {
    colaboradores,
    turnos: (turnosRes.data ?? []).map((t) => ({
      id: t.id,
      nome: t.nome,
      cor: t.cor,
      entrada: (t.entrada ?? "").slice(0, 5),
      saida: (t.saida ?? "").slice(0, 5),
      intervalo_minutos: t.intervalo_minutos ?? 0,
    })),
    folgas,
    convocacoes: (convocacoesRes.data ?? []).map((c) => ({
      colaborador_id: c.colaborador_id,
      data: c.data,
      status: c.status as "pendente" | "aceita",
      turno_id: c.turno_id,
      entrada: c.entrada,
      saida: c.saida,
      intervalo_minutos: c.intervalo_minutos,
    })),
    ausencias,
    itens,
    avulsos: (avulsasRes.data ?? []).map((a) => ({
      id: a.id,
      nome: a.nome,
      tipo: a.tipo as PessoaAvulsaTipo,
      colaborador_id: a.colaborador_id ?? null,
      unidade_id: a.unidade_id,
      cargo_id: a.cargo_id,
      cargo_nome: nomeCargo.get(a.cargo_id) ?? null,
      cobre_nome: a.cobre_colaborador_id ? nomeColab.get(a.cobre_colaborador_id) ?? null : null,
      data_inicio: a.data_inicio,
      data_fim: a.data_fim,
      entrada: a.entrada ? a.entrada.slice(0, 5) : null,
      saida: a.saida ? a.saida.slice(0, 5) : null,
      termina_no_dia_seguinte: !!a.termina_no_dia_seguinte,
      observacao: a.observacao,
    })),
    setores: (setoresRes.data ?? []) as SetorPanorama[],
    cargos: listaCargos,
    unidades: (unidades.data ?? []) as { id: string; nome: string }[],
  };
}

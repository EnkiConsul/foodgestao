import { supabase } from "@/integrations/supabase/client";

/**
 * Campos confidenciais do cadastro de colaboradores. O banco não libera a
 * leitura direta dessas colunas: elas chegam pela consulta segura
 * dp_colaboradores_confidencial, completas ou mascaradas conforme "Ver salários".
 */
export const COLUNAS_CONFIDENCIAIS = [
  "salario_base", "base_salarial", "cpf", "rg_numero", "rg_orgao", "rg_uf", "rg_emissao",
  "pis_nit", "banco_codigo", "banco_nome", "agencia", "conta", "conta_digito", "conta_tipo",
  "pix_tipo", "pix_chave",
] as const;

/** Todas as colunas de dp_colaboradores que podem ser lidas diretamente. */
export const COLUNAS_COLABORADOR_PUBLICAS = "id, company_id, user_id, nome, matricula, cargo, regime, data_admissao, data_desligamento, email, telefone, ativo, observacoes, created_at, updated_at, unidade_id, cargo_id, sindicato_id, dp_permissions, email_portal, data_nascimento, whatsapp, folga_fixa_semana, perfil_acesso, possui_folha_ponto, optante_adiantamento, endereco, email_contato, aprovacao_status, motivo_desligamento, desligado_por, desligado_em, acesso_portal_ate, aprendiz, sexo, fundamental_concluido, forma_pagamento, valor_hora, dependentes_irrf, adicional_percentual, vale_transporte, vale_transporte_valor_dia, vinculo_label, base_horas_mes, base_dias_mes, valor_hora_manual, premio_assiduidade, premio_assiduidade_valor, assiduidade_criterio, assiduidade_tolerancia_min, assiduidade_max_atrasos, premio_assiduidade_tipo, vale_alimentacao, vale_alimentacao_valor, vale_alimentacao_periodicidade, vale_alimentacao_dias_base, vale_alimentacao_desconto_tipo, vale_alimentacao_desconto_valor, vale_alimentacao_dias_origem, assiduidade_considera_atestado, assiduidade_max_atestados, adicional_tempo_servico_manual, adicional_tempo_servico_override, veiculo_proprio, cnh_categoria, cnh_validade, estado_civil, insalubridade_percentual, periculosidade_percentual, vale_alimentacao_dia_pagamento, vale_alimentacao_dias_corte, vale_alimentacao_desconta_falta, vale_alimentacao_desconta_folga_extra, vale_alimentacao_desconta_atestado, vale_alimentacao_desconta_ferias, vale_transporte_dia_pagamento, vale_transporte_dias_corte, vale_transporte_desconta_falta, vale_transporte_desconta_folga_extra, vale_transporte_desconta_atestado, vale_transporte_desconta_ferias, deleted_at, deleted_by, delete_reason, domingos_folga_mes, socio_remuneracao, valor_diaria, setor_id, ctps_numero, ctps_serie, ctps_uf, ctps_expedicao, titulo_eleitor, titulo_zona, titulo_secao, reservista, reservista_categoria, nome_pai, nome_mae, nacionalidade, naturalidade, raca_cor, grau_instrucao, deficiencia, origem_cadastro, ficha_importacao_item_id, ferias_controle_inicio, data_base_contagem, nome_social, titular_proprio, titular_nome, titular_cpf, recebe_em_especie";

export type Confidencial = Record<(typeof COLUNAS_CONFIDENCIAIS)[number], unknown> & {
  id: string;
  liberado: boolean;
};

/** Busca os campos confidenciais (mascarados quando o usuário não pode ver). */
export async function buscarConfidencial(companyId: string, ids?: string[] | null): Promise<Map<string, Confidencial>> {
  const { data, error } = await (supabase as any).rpc("dp_colaboradores_confidencial", {
    _company_id: companyId,
    _ids: ids && ids.length ? ids : null,
  });
  if (error) throw error;
  return new Map(((data ?? []) as Confidencial[]).map((r) => [r.id, r]));
}

/** Junta os campos confidenciais nas linhas já carregadas (sem vínculo, ficam vazios). */
export async function mesclarConfidencial<T extends { id: string }>(companyId: string, rows: T[], ids?: string[] | null): Promise<T[]> {
  if (!rows.length) return rows;
  const mapa = await buscarConfidencial(companyId, ids);
  return rows.map((r) => {
    const c = mapa.get(r.id);
    const extra: Record<string, unknown> = {};
    for (const k of COLUNAS_CONFIDENCIAIS) extra[k] = c ? c[k] : null;
    return { ...r, ...extra, confidencial_liberado: c?.liberado ?? false } as T;
  });
}

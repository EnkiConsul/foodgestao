CREATE TABLE public.dp_recibos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  beneficiario_nome text NOT NULL,
  beneficiario_cpf text,
  beneficiario_whatsapp text,
  natureza text NOT NULL,
  descricao text,
  competencia date NOT NULL,
  pago_em date NOT NULL,
  valor_cents bigint NOT NULL,
  modalidade text NOT NULL,
  valor_bancario_cents bigint,
  valor_especie_cents bigint,
  canal_assinatura text NOT NULL,
  file_path text,
  documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  link_token_hash text UNIQUE,
  link_expira_em timestamptz,
  link_enviado_em timestamptz,
  assinado_em timestamptz,
  assinado_ip text,
  assinado_user_agent text,
  assinado_hash text,
  assinado_confirmacao jsonb,
  cancelado_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_recibos_natureza_chk CHECK (natureza IN ('acerto_mensal','adiantamento','diaria','teste_operacional','outros')),
  CONSTRAINT dp_recibos_modalidade_chk CHECK (modalidade IN ('bancario','especie','misto')),
  CONSTRAINT dp_recibos_canal_chk CHECK (canal_assinatura IN ('portal','whatsapp','fisico')),
  CONSTRAINT dp_recibos_valor_chk CHECK (valor_cents > 0),
  CONSTRAINT dp_recibos_beneficiario_chk CHECK (colaborador_id IS NOT NULL OR beneficiario_cpf IS NOT NULL),
  CONSTRAINT dp_recibos_portal_chk CHECK (canal_assinatura <> 'portal' OR colaborador_id IS NOT NULL)
);

GRANT SELECT ON public.dp_recibos TO authenticated;
GRANT ALL ON public.dp_recibos TO service_role;
ALTER TABLE public.dp_recibos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_recibos_select ON public.dp_recibos FOR SELECT TO authenticated
  USING (public.tem_permissao(company_id, 'dp.documentos', 'consulta') AND public.unidade_liberada(company_id, unidade_id));

CREATE INDEX dp_recibos_company_idx ON public.dp_recibos (company_id, created_at DESC);
CREATE INDEX dp_recibos_colab_idx ON public.dp_recibos (colaborador_id, competencia);

CREATE TRIGGER dp_recibos_updated_at BEFORE UPDATE ON public.dp_recibos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pendências: freelancer mensalista entra em recibo mensal (contracheque) e adiantamento.
CREATE OR REPLACE FUNCTION public.dp_refresh_document_pending(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  DELETE FROM public.dp_pendencias_materializadas p
   WHERE p.doc_tipo IS NOT NULL
     AND (p_company_id IS NULL OR p.company_id = p_company_id);

  WITH empresas AS (
    SELECT c.id AS company_id,
           COALESCE(cfg.alerta_contracheque_dia_mes, 10) AS dia_contracheque,
           COALESCE(cfg.alerta_adiantamento_offset, 5) AS offset_adiantamento,
           COALESCE(cfg.alerta_folha_ponto_dia_mes, 10) AS dia_ponto,
           COALESCE(cfg.exigir_contracheque_mes_desligamento, false) AS cobra_contracheque_desligamento
      FROM public.companies c
      LEFT JOIN public.dp_pendencias_config cfg ON cfg.company_id = c.id
     WHERE p_company_id IS NULL OR c.id = p_company_id
  ), unidades AS (
    SELECT u.*, e.dia_contracheque, e.offset_adiantamento, e.dia_ponto,
           e.cobra_contracheque_desligamento,
           to_char((date_trunc('month', u.created_at AT TIME ZONE 'America/Sao_Paulo') - interval '1 month')::date, 'YYYY-MM') AS primeira_comp
      FROM public.dp_unidades u
      JOIN empresas e ON e.company_id = u.company_id
     WHERE u.ativo = true
  ), competencias AS (
    SELECT u.company_id, u.id AS unidade_id, u.nome AS unidade_nome,
           u.possui_relogio_ponto, u.tem_adiantamento, u.dia_adiantamento,
           u.dia_contracheque, u.offset_adiantamento, u.dia_ponto,
           u.cobra_contracheque_desligamento,
           to_char(gs, 'YYYY-MM') AS competencia,
           gs::date AS inicio_mes,
           (gs + interval '1 month - 1 day')::date AS fim_mes
      FROM unidades u
      CROSS JOIN LATERAL generate_series(
        GREATEST(date_trunc('month', v_today) - interval '23 months', to_date(u.primeira_comp || '-01', 'YYYY-MM-DD')),
        date_trunc('month', v_today), interval '1 month'
      ) gs
  ), candidatos AS (
    SELECT cp.*, c.id AS colaborador_id, c.nome AS colaborador_nome,
           lower(COALESCE(c.regime::text, '')) AS regime,
           lower(COALESCE(c.forma_pagamento::text, '')) AS forma,
           lower(COALESCE(c.vinculo_label, '')) AS vinculo,
           c.possui_folha_ponto, c.optante_adiantamento,
           c.data_admissao::date AS admissao, c.data_desligamento::date AS desligamento,
           EXISTS (
             SELECT 1 FROM public.dp_documentos doc_ponto
              WHERE doc_ponto.company_id = cp.company_id
                AND doc_ponto.colaborador_id = c.id
                AND doc_ponto.tipo::text = 'ponto'
                AND doc_ponto.referencia_data BETWEEN cp.inicio_mes AND cp.fim_mes
           ) AS tem_folha_ponto_importada,
           EXISTS (
             SELECT 1 FROM public.dp_solicitacoes s
              WHERE s.company_id = cp.company_id
                AND s.colaborador_id = c.id
                AND s.status::text = 'aprovada'
                AND s.tipo::text IN ('atestado','licenca_maternidade','licenca_paternidade')
                AND s.data_alvo IS NOT NULL
                AND s.data_alvo::date <= GREATEST(cp.inicio_mes, COALESCE(c.data_admissao::date, cp.inicio_mes))
                AND COALESCE(s.data_fim::date, s.data_alvo::date) >= LEAST(cp.fim_mes, COALESCE(c.data_desligamento::date, cp.fim_mes))
           ) AS afastado_mes_inteiro,
           (SELECT ic.trabalhou FROM public.dp_intermitente_competencia_confirmacoes ic
             WHERE ic.company_id = cp.company_id AND ic.colaborador_id = c.id
               AND ic.competencia = cp.competencia LIMIT 1) AS intermitente_trabalhou,
           COALESCE(
             (SELECT s.tipo = 'ativar' FROM public.dp_adiantamento_solicitacoes s
               WHERE s.company_id = cp.company_id AND s.colaborador_id = c.id
                 AND s.competencia_efeito <= cp.competencia
               ORDER BY s.competencia_efeito DESC, s.data_solicitacao DESC, s.created_at DESC LIMIT 1),
             c.optante_adiantamento, false
           ) AS optante_comp
      FROM competencias cp
      JOIN public.dp_colaboradores c ON c.company_id = cp.company_id AND c.unidade_id = cp.unidade_id
       AND c.data_admissao::date <= cp.fim_mes
       AND (c.data_desligamento IS NULL OR c.data_desligamento::date >= cp.inicio_mes)
  ), elegiveis AS (
    SELECT c.*, d.doc_tipo,
      (c.regime = 'freelancer') AS freela,
      CASE d.doc_tipo
        WHEN 'contracheque' THEN (date_trunc('month', c.inicio_mes) + interval '1 month' + (LEAST(c.dia_contracheque, 28) - 1) * interval '1 day')::date
        WHEN 'ponto' THEN (date_trunc('month', c.inicio_mes) + interval '1 month' + (LEAST(c.dia_ponto, 28) - 1) * interval '1 day')::date
        WHEN 'adiantamento' THEN (date_trunc('month', c.inicio_mes) + (LEAST(COALESCE(c.dia_adiantamento, 1) + c.offset_adiantamento, 28) - 1) * interval '1 day')::date
        WHEN 'rescisao' THEN c.desligamento + 10
      END AS vencimento
    FROM candidatos c
    CROSS JOIN (VALUES ('contracheque'), ('adiantamento'), ('ponto'), ('rescisao')) d(doc_tipo)
    WHERE
      (
        c.regime IN ('clt','intermitente','temporario','aprendiz')
        OR (c.regime = 'freelancer' AND c.forma = 'mensalista' AND d.doc_tipo IN ('contracheque','adiantamento'))
      )
      AND c.vinculo NOT LIKE '%sóci%'
      AND (
        (d.doc_tipo = 'contracheque'
          AND c.competencia < to_char(v_today, 'YYYY-MM')
          AND (c.regime <> 'intermitente' OR c.tem_folha_ponto_importada OR c.intermitente_trabalhou = true)
          AND (c.desligamento IS NULL OR to_char(c.desligamento, 'YYYY-MM') <> c.competencia OR c.cobra_contracheque_desligamento))
        OR (d.doc_tipo = 'ponto'
          AND c.competencia < to_char(v_today, 'YYYY-MM')
          AND c.possui_relogio_ponto = true AND c.possui_folha_ponto IS DISTINCT FROM false
          AND NOT c.afastado_mes_inteiro
          AND (c.regime <> 'intermitente' OR c.tem_folha_ponto_importada OR c.intermitente_trabalhou = true))
        OR (d.doc_tipo = 'adiantamento'
          AND c.competencia <= to_char(v_today, 'YYYY-MM')
          AND c.tem_adiantamento = true AND c.dia_adiantamento IS NOT NULL AND c.optante_comp
          AND NOT (to_char(c.admissao, 'YYYY-MM') = c.competencia AND extract(day FROM c.admissao) > c.dia_adiantamento)
          AND NOT (c.desligamento IS NOT NULL AND to_char(c.desligamento, 'YYYY-MM') = c.competencia AND extract(day FROM c.desligamento) < c.dia_adiantamento))
        OR (d.doc_tipo = 'rescisao'
          AND c.desligamento IS NOT NULL AND to_char(c.desligamento, 'YYYY-MM') = c.competencia)
      )
  ), faltantes AS (
    SELECT e.*,
           count(*) OVER (PARTITION BY e.company_id, e.unidade_id, e.competencia, e.doc_tipo) AS total_elegiveis
      FROM elegiveis e
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_documentos doc
        WHERE doc.company_id = e.company_id AND doc.colaborador_id = e.colaborador_id
          AND to_char(doc.referencia_data, 'YYYY-MM') = e.competencia
          AND (
            (e.doc_tipo <> 'rescisao' AND doc.tipo::text = e.doc_tipo)
            OR (e.doc_tipo = 'rescisao' AND doc.tipo::text IN ('trct','demonstrativo_rescisorio'))
          )
     )
  ), contagens AS (
    SELECT f.*, count(*) OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo) AS total_faltantes
      FROM faltantes f
  ), marcadas AS (
    SELECT f.*,
           (f.doc_tipo <> 'rescisao' AND f.total_elegiveis > 1 AND f.total_faltantes = f.total_elegiveis) AS lote
      FROM contagens f
  ), linhas AS (
    SELECT f.company_id,
      CASE WHEN f.lote
        THEN f.doc_tipo || '-' || f.unidade_id || '-' || replace(f.competencia, '-0', '-')
        ELSE f.doc_tipo || '-' || f.colaborador_id || '-' || replace(f.competencia, '-0', '-') END AS pendencia_id,
      CASE
        WHEN NOT f.lote AND f.freela AND f.doc_tipo = 'contracheque' THEN 'Recibo mensal não emitido'
        WHEN NOT f.lote AND f.freela AND f.doc_tipo = 'adiantamento' THEN 'Recibo de adiantamento não emitido'
        WHEN f.doc_tipo = 'contracheque' THEN 'Contracheque não importado'
        WHEN f.doc_tipo = 'adiantamento' THEN 'Adiantamento não importado'
        WHEN f.doc_tipo = 'ponto' THEN 'Folha de ponto não importada'
        ELSE 'Rescisão não importada' END AS titulo,
      CASE WHEN f.lote
        THEN f.unidade_nome || ' — ' || f.competencia
        ELSE f.colaborador_nome || ' · ' || f.unidade_nome || ' — ' || f.competencia END AS subtitulo,
      CASE f.doc_tipo WHEN 'contracheque' THEN 'Contracheque' WHEN 'adiantamento' THEN 'Adiantamento' WHEN 'ponto' THEN 'Folha de Ponto' ELSE 'Rescisão' END AS tipo,
      f.vencimento, (v_today - f.vencimento)::integer AS atraso_dias,
      CASE WHEN NOT f.lote AND f.freela
        THEN '/dp/documentos/recibos?colaborador=' || f.colaborador_id || '&competencia=' || f.competencia
             || '&natureza=' || CASE WHEN f.doc_tipo = 'adiantamento' THEN 'adiantamento' ELSE 'acerto_mensal' END
        ELSE '/dp/documentos?tipo=' || CASE WHEN f.doc_tipo = 'rescisao' THEN 'trct' ELSE f.doc_tipo END || '&competencia=' || f.competencia || '&unidade=' || f.unidade_id
      END AS url,
      CASE WHEN f.lote THEN NULL ELSE f.colaborador_nome END AS colaborador_nome,
      f.unidade_nome,
      CASE WHEN f.lote THEN NULL ELSE f.colaborador_id END AS colaborador_id,
      f.competencia, f.doc_tipo, f.unidade_id,
      CASE WHEN f.lote THEN 'unidade' ELSE 'pessoa' END AS escopo,
      CASE WHEN f.lote
        THEN jsonb_agg(jsonb_build_object('nome', f.colaborador_nome, 'desligamento', f.desligamento))
             OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo)
        ELSE jsonb_build_array(jsonb_build_object('nome', f.colaborador_nome, 'desligamento', f.desligamento)) END AS pessoas,
      CASE WHEN f.lote THEN f.total_faltantes::integer ELSE 1 END AS total_elegiveis,
      row_number() OVER (PARTITION BY f.company_id, f.unidade_id, f.competencia, f.doc_tipo,
        CASE WHEN f.lote THEN NULL ELSE f.colaborador_id END
        ORDER BY f.colaborador_nome) AS rn
    FROM marcadas f
  )
  INSERT INTO public.dp_pendencias_materializadas (
    company_id, pendencia_id, titulo, subtitulo, tipo, vencimento, atraso_dias, url,
    colaborador_nome, unidade_nome, colaborador_id, competencia, doc_tipo, unidade_id,
    escopo, pessoas, total_elegiveis, apurado_em
  )
  SELECT company_id, pendencia_id, titulo, subtitulo, tipo, vencimento, atraso_dias, url,
         colaborador_nome, unidade_nome, colaborador_id, competencia, doc_tipo, unidade_id,
         escopo, pessoas, total_elegiveis, v_now
    FROM linhas WHERE rn = 1;

  INSERT INTO public.dp_pendencias_apuracoes (company_id, apurado_em, sujo_desde, updated_at)
  SELECT c.id, v_now, v_now, v_now
    FROM public.companies c
   WHERE p_company_id IS NULL OR c.id = p_company_id
  ON CONFLICT (company_id) DO UPDATE
    SET apurado_em = EXCLUDED.apurado_em,
        sujo_desde = EXCLUDED.sujo_desde,
        updated_at = EXCLUDED.updated_at;
END;
$function$;
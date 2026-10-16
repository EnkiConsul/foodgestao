-- Adiantamento salarial: gestão exclusiva do gestor autorizado.
-- Antes, um colaborador podia ativar/cancelar o próprio adiantamento por
-- chamada direta (v_origem = 'portal'). A partir desta migration, apenas
-- admin/dono da empresa registra; o histórico existente é preservado.
CREATE OR REPLACE FUNCTION public.dp_adiantamento_registrar(
  p_colaborador uuid,
  p_tipo text,
  p_data date,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_admin boolean := false;
  v_origem text;
  v_id uuid;
  v_competencia text;
  v_dia int;
  v_pagamento date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_tipo IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o colaborador, o tipo e a data.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo NOT IN ('ativar', 'cancelar') THEN
    RAISE EXCEPTION 'INVALID_INPUT: tipo inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = p_colaborador;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE = '22023';
  END IF;

  v_admin := private.is_company_admin_or_owner(v_uid, v_company);

  -- Gestão exclusiva do gestor: o colaborador não ativa nem cancela pelo portal.
  IF NOT v_admin THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas o gestor pode registrar adiantamento salarial.' USING ERRCODE = '42501';
  END IF;
  v_origem := 'gestor';

  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador::text || p_tipo || p_data::text, 0));

  SELECT s.id, s.competencia_efeito INTO v_id, v_competencia
    FROM public.dp_adiantamento_solicitacoes s
   WHERE s.colaborador_id = p_colaborador
     AND s.tipo = p_tipo
     AND s.data_solicitacao = p_data
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id,
                              'competencia_efeito', v_competencia,
                              'origem', v_origem, 'duplicada', true);
  END IF;

  -- Competência do gestor: dia do pagamento da unidade, sem carência.
  SELECT u.dia_adiantamento INTO v_dia
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
   WHERE c.id = p_colaborador;
  v_pagamento := LEAST(
    date_trunc('month', p_data)::date + (COALESCE(v_dia, 15) - 1),
    (date_trunc('month', p_data) + INTERVAL '1 month - 1 day')::date
  );
  v_competencia := CASE
    WHEN p_data >= v_pagamento THEN to_char(p_data + INTERVAL '1 month', 'YYYY-MM')
    ELSE to_char(p_data, 'YYYY-MM')
  END;

  INSERT INTO public.dp_adiantamento_solicitacoes
    (company_id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, criado_por)
  VALUES
    (v_company, p_colaborador, p_tipo, p_data, v_competencia, v_origem,
     NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
  RETURNING id, competencia_efeito INTO v_id, v_competencia;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id,
                            'competencia_efeito', v_competencia,
                            'origem', v_origem, 'duplicada', false);
END;
$function$;

-- Solicitações genéricas do portal: os tipos "adiantamento" e "outros" deixam
-- de ser criáveis pela rotina do colaborador. Folga, férias, atestado e demais
-- tipos seguem intactos; registros antigos são preservados.
CREATE OR REPLACE FUNCTION public.dp_solicitacao_criar(
  p_tipo public.dp_solicitacao_tipo,
  p_data_alvo date,
  p_data_fim date DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_arquivo_path text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_setor uuid;
  v_janela jsonb;
  v_lim jsonb;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_tipo IS NULL OR p_data_alvo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe tipo e data.' USING ERRCODE = '22023';
  END IF;
  -- Tipos removidos do portal: adiantamento é gestão exclusiva do gestor e
  -- "outros" deixou de existir como solicitação genérica.
  IF p_tipo IN ('adiantamento'::public.dp_solicitacao_tipo, 'outros'::public.dp_solicitacao_tipo) THEN
    RAISE EXCEPTION 'TIPO_INDISPONIVEL: este tipo de solicitação não está disponível no portal.' USING ERRCODE = '22023';
  END IF;
  IF p_data_fim IS NOT NULL AND p_data_fim < p_data_alvo THEN
    RAISE EXCEPTION 'INVALID_INPUT: a data fim não pode ser anterior à data inicial.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo <> 'folga'::public.dp_solicitacao_tipo AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: motivo obrigatório para este tipo de solicitação.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_tipo = 'folga'::public.dp_solicitacao_tipo THEN
    IF p_data_alvo < CURRENT_DATE THEN
      RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.'
        USING ERRCODE = '22023';
    END IF;

    v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);
    IF COALESCE((v_janela->>'ativa')::boolean, false)
       AND ((v_janela->>'estado') <> 'aberta'
            OR date_trunc('month', p_data_alvo) <> date_trunc('month', (v_janela->>'competencia')::date)) THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: fora do período de escolha das folgas.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data_alvo::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|solic_' || p_tipo::text || '|' || p_data_alvo::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = v_colab AND s.tipo = p_tipo
       AND s.data_alvo = p_data_alvo AND s.status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para este dia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'folga'::public.dp_solicitacao_tipo THEN
    v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data_alvo, NULL, v_setor);
    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status, arquivo_path)
  VALUES (v_company, v_colab, v_uid, p_tipo, p_data_alvo, p_data_fim, v_motivo, 'pendente',
          NULLIF(btrim(COALESCE(p_arquivo_path, '')), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'limite', v_lim);
END;
$function$;
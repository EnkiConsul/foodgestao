CREATE OR REPLACE FUNCTION public.dp_preadmissao_ativar_rotina(
  p_preadmissao_id uuid,
  p_data_inicio date,
  p_jornada jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa record;
  v_a jsonb;
  v_d jsonb;
  v_cpf text;
  v_regime text;
  v_forma text;
  v_cargo uuid;
  v_unidade uuid;
  v_colab uuid;
  v_config uuid;
  v_dia jsonb;
  v_trabalhados int := 0;
  v_folgas int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id AND removido_em IS NULL FOR UPDATE;
  IF pa.id IS NULL THEN
    RAISE EXCEPTION 'Pré-admissão não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), pa.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ativar esta pré-admissão na rotina.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF pa.status IN ('concluido','cancelado','expirado') THEN
    RAISE EXCEPTION 'Esta pré-admissão já foi encerrada.' USING ERRCODE = 'check_violation';
  END IF;
  v_a := COALESCE(pa.admin_dados, '{}'::jsonb);
  IF NULLIF(v_a->'rotina'->>'colaborador_id','') IS NOT NULL THEN
    RETURN jsonb_build_object('colaborador_id', (v_a->'rotina'->>'colaborador_id')::uuid, 'ja_aplicado', true);
  END IF;
  v_regime := COALESCE(NULLIF(v_a->>'regime_trabalho',''), pa.regime_previsto::text, 'clt');
  IF v_regime NOT IN ('clt','intermitente') THEN
    RAISE EXCEPTION 'Ativação na rotina vale para admissões CLT ou intermitentes.' USING ERRCODE = 'check_violation';
  END IF;
  v_forma := CASE WHEN v_regime = 'intermitente' THEN 'diarista' ELSE 'mensalista' END;

  v_cargo := COALESCE(NULLIF(v_a->>'cargo_id','')::uuid, pa.cargo_previsto_id);
  v_unidade := COALESCE(NULLIF(v_a->>'unidade_id','')::uuid, pa.unidade_prevista_id);
  IF v_cargo IS NULL OR v_unidade IS NULL THEN
    RAISE EXCEPTION 'Confirme cargo e unidade na ficha antes de ativar na rotina.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_jornada IS NULL OR jsonb_typeof(p_jornada) <> 'object' OR jsonb_typeof(p_jornada->'dias') <> 'array' THEN
    RAISE EXCEPTION 'Defina o horário de trabalho antes de ativar na rotina.' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_jornada->'dias') LOOP
    IF COALESCE((v_dia->>'trabalha')::boolean, false) THEN
      v_trabalhados := v_trabalhados + 1;
      IF NULLIF(v_dia->>'entrada','') IS NULL OR NULLIF(v_dia->>'saida','') IS NULL THEN
        RAISE EXCEPTION 'Todo dia trabalhado precisa de entrada e saída.' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      v_folgas := v_folgas + 1;
    END IF;
  END LOOP;
  IF v_trabalhados = 0 OR v_folgas = 0 THEN
    RAISE EXCEPTION 'A semana precisa de pelo menos 1 dia de trabalho e 1 folga.' USING ERRCODE = 'check_violation';
  END IF;

  v_d := COALESCE(pa.dados, '{}'::jsonb);
  v_cpf := regexp_replace(COALESCE(pa.cpf, v_d->>'cpf', ''), '\D', '', 'g');
  IF length(v_cpf) = 11 AND EXISTS (
    SELECT 1 FROM public.dp_colaboradores
    WHERE company_id = pa.company_id AND deleted_at IS NULL
      AND regexp_replace(COALESCE(cpf,''), '\D','','g') = v_cpf
  ) THEN
    RAISE EXCEPTION 'Já existe cadastro com este CPF nesta empresa.' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.dp_colaboradores (
    company_id, nome, cpf, whatsapp, telefone, email_contato, data_nascimento,
    cargo_id, unidade_id, regime, forma_pagamento, data_admissao, ativo, origem_cadastro
  ) VALUES (
    pa.company_id,
    upper(COALESCE(NULLIF(v_d->>'nome',''), pa.candidato_nome)),
    NULLIF(v_cpf,''),
    pa.whatsapp,
    NULLIF(v_d->>'telefone',''),
    COALESCE(NULLIF(lower(v_d->>'email'),''), pa.email),
    COALESCE(pa.data_nascimento, NULLIF(v_d->>'data_nascimento','')::date),
    v_cargo, v_unidade, 'freelancer'::dp_regime_trabalho, v_forma::dp_forma_pagamento,
    p_data_inicio, true, 'preadmissao_rotina'
  ) RETURNING id INTO v_colab;

  INSERT INTO public.dp_colaborador_config_trabalho (
    company_id, colaborador_id, unidade_id, folga_variavel, vigencia_inicio, observacoes
  ) VALUES (
    pa.company_id, v_colab, v_unidade,
    COALESCE((p_jornada->>'folga_variavel')::boolean, false),
    p_data_inicio,
    'Ativação operacional na rotina (pré-admissão aguardando registro).'
  ) RETURNING id INTO v_config;

  INSERT INTO public.dp_colaborador_config_dias (company_id, config_id, dow, trabalha, turno_id, entrada, saida, intervalo_minutos, setor_id)
  SELECT pa.company_id, v_config,
         (d->>'dow')::int,
         COALESCE((d->>'trabalha')::boolean, false),
         NULLIF(d->>'turno_id','')::uuid,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'entrada','')::time ELSE NULL END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'saida','')::time ELSE NULL END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN COALESCE((d->>'intervalo_minutos')::int, 0) ELSE NULL END,
         NULLIF(d->>'setor_id','')::uuid
    FROM jsonb_array_elements(p_jornada->'dias') AS d;

  UPDATE public.dp_preadmissoes
     SET admin_dados = v_a || jsonb_build_object(
           'jornada', p_jornada,
           'rotina', jsonb_build_object(
             'colaborador_id', v_colab,
             'iniciou_em', p_data_inicio,
             'ativado_por', auth.uid(),
             'ativado_em', now(),
             'regime_provisorio', 'freelancer',
             'forma_provisoria', v_forma)),
         updated_at = now()
   WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'rotina_ativada',
          jsonb_build_object('colaborador_id', v_colab, 'iniciou_em', p_data_inicio,
                             'regime_previsto', v_regime, 'forma_provisoria', v_forma), auth.uid());

  RETURN jsonb_build_object('colaborador_id', v_colab, 'ja_aplicado', false, 'forma_provisoria', v_forma);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_ativar_rotina(uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_ativar_rotina(uuid, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_ativar_rotina(uuid, date, jsonb) TO service_role;
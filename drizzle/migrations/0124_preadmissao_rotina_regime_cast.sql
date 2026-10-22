-- Corrige a leitura do regime previsto (enum) nas rotinas de pré-admissão.
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
  -- CLT previsto -> freelancer mensalista; intermitente -> freelancer diarista.
  v_forma := CASE WHEN v_regime = 'intermitente' THEN 'diarista' ELSE 'mensalista' END;

  v_cargo := COALESCE(NULLIF(v_a->>'cargo_id','')::uuid, pa.cargo_previsto_id);
  v_unidade := COALESCE(NULLIF(v_a->>'unidade_id','')::uuid, pa.unidade_prevista_id);
  IF v_cargo IS NULL OR v_unidade IS NULL THEN
    RAISE EXCEPTION 'Confirme cargo e unidade na ficha antes de ativar na rotina.' USING ERRCODE = 'check_violation';
  END IF;

  -- Jornada obrigatória e coerente: pelo menos 1 folga e horário em todo dia trabalhado.
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
     SET admin_dados = v_a || jsonb_build_object('rotina', jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar_direto(
  p_preadmissao_id uuid,
  p_data_admissao date DEFAULT NULL,
  p_confirmo_sem_ficha boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa record;
  v_d jsonb;
  v_a jsonb;
  v_cpf text;
  v_regime text;
  v_forma text;
  v_cargo uuid;
  v_unidade uuid;
  v_setor uuid;
  v_colab uuid;
  v_rotina_colab uuid;
  v_admissao date;
  v_res jsonb;
  v_clt boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id AND removido_em IS NULL FOR UPDATE;
  IF pa.id IS NULL THEN
    RAISE EXCEPTION 'Pré-admissão não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), pa.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para efetivar esta pré-admissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('colaborador_id', pa.colaborador_id, 'ja_aplicado', true);
  END IF;
  IF pa.status NOT IN ('pronto_contabilidade','enviado_contabilidade','aguardando_retorno_contabilidade','registro_recebido') THEN
    RAISE EXCEPTION 'Aprove a ficha de admissão antes de efetivar o colaborador.' USING ERRCODE = 'check_violation';
  END IF;

  v_d := COALESCE(pa.dados, '{}'::jsonb);
  v_a := COALESCE(pa.admin_dados, '{}'::jsonb);
  v_regime := COALESCE(NULLIF(v_a->>'regime_trabalho',''), pa.regime_previsto::text, 'clt');
  v_clt := v_regime IN ('clt','intermitente');
  IF v_clt AND pa.ficha_oficial_conferida_em IS NULL AND NOT p_confirmo_sem_ficha THEN
    RAISE EXCEPTION 'Vínculo CLT sem ficha de registro: confirme a efetivação com os dados da pré-admissão.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_rotina_colab := NULLIF(v_a->'rotina'->>'colaborador_id','')::uuid;

  v_cpf := regexp_replace(COALESCE(pa.cpf, v_d->>'cpf', ''), '\D', '', 'g');
  IF length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'A pré-admissão não tem CPF válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_colaboradores
              WHERE company_id = pa.company_id AND deleted_at IS NULL
                AND id IS DISTINCT FROM v_rotina_colab
                AND regexp_replace(COALESCE(cpf,''), '\D','','g') = v_cpf) THEN
    RAISE EXCEPTION 'Já existe cadastro com este CPF nesta empresa. Use a recontratação pela ficha do colaborador.'
      USING ERRCODE = 'unique_violation';
  END IF;

  v_cargo := COALESCE(NULLIF(v_a->>'cargo_id','')::uuid, pa.cargo_previsto_id);
  v_unidade := COALESCE(NULLIF(v_a->>'unidade_id','')::uuid, pa.unidade_prevista_id);
  v_setor := NULLIF(v_a->>'setor_id','')::uuid;
  IF v_cargo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_cargos WHERE id = v_cargo AND company_id = pa.company_id) THEN
    RAISE EXCEPTION 'O cargo escolhido não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_unidade IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_unidades WHERE id = v_unidade AND company_id = pa.company_id) THEN
    RAISE EXCEPTION 'A unidade escolhida não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_setor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_setores WHERE id = v_setor AND company_id = pa.company_id) THEN
    v_setor := NULL;
  END IF;
  v_forma := NULLIF(v_a->>'forma_pagamento','');
  IF v_forma IS NULL OR v_forma NOT IN (SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'dp_forma_pagamento') THEN
    v_forma := 'mensalista';
  END IF;
  v_admissao := COALESCE(p_data_admissao, NULLIF(v_a->>'data_admissao','')::date, CURRENT_DATE);

  IF v_rotina_colab IS NOT NULL THEN
    -- Converte o cadastro provisório (freelancer da rotina) no vínculo oficial.
    UPDATE public.dp_colaboradores SET
      nome = upper(COALESCE(NULLIF(v_d->>'nome',''), pa.candidato_nome)),
      nome_social = NULLIF(upper(v_d->>'nome_social'),''),
      data_nascimento = COALESCE(pa.data_nascimento, NULLIF(v_d->>'data_nascimento','')::date),
      sexo = NULLIF(v_d->>'sexo',''),
      estado_civil = COALESCE(NULLIF(v_d->>'estado_civil',''), pa.estado_civil),
      telefone = NULLIF(v_d->>'telefone',''),
      whatsapp = pa.whatsapp,
      email_contato = COALESCE(NULLIF(lower(v_d->>'email'),''), pa.email),
      rg_numero = NULLIF(v_d->>'rg_numero',''), rg_orgao = NULLIF(upper(v_d->>'rg_orgao'),''),
      rg_uf = NULLIF(v_d->>'rg_uf',''), rg_emissao = NULLIF(v_d->>'rg_emissao','')::date,
      ctps_numero = NULLIF(v_d->>'ctps_numero',''), ctps_serie = NULLIF(v_d->>'ctps_serie',''),
      ctps_uf = NULLIF(v_d->>'ctps_uf',''), ctps_expedicao = NULLIF(v_d->>'ctps_expedicao','')::date,
      pis_nit = NULLIF(v_d->>'pis',''),
      titulo_eleitor = NULLIF(v_d->>'titulo_eleitor',''), titulo_zona = NULLIF(v_d->>'titulo_zona',''),
      titulo_secao = NULLIF(v_d->>'titulo_secao',''),
      reservista = NULLIF(v_d->>'reservista',''), reservista_categoria = NULLIF(upper(v_d->>'reservista_categoria'),''),
      nome_mae = NULLIF(upper(v_d->>'nome_mae'),''), nome_pai = NULLIF(upper(v_d->>'nome_pai'),''),
      nacionalidade = NULLIF(upper(v_d->>'nacionalidade'),''),
      naturalidade = NULLIF(upper(concat_ws(' - ', NULLIF(v_d->>'naturalidade',''), NULLIF(v_d->>'naturalidade_uf',''))),''),
      raca_cor = NULLIF(v_d->>'raca_cor',''), grau_instrucao = NULLIF(v_d->>'grau_instrucao',''),
      deficiencia = NULLIF(v_d->>'deficiencia',''),
      endereco = jsonb_strip_nulls(jsonb_build_object(
        'logradouro', NULLIF(upper(v_d->>'endereco'),''), 'numero', NULLIF(v_d->>'numero',''),
        'complemento', NULLIF(upper(v_d->>'complemento'),''), 'bairro', NULLIF(upper(v_d->>'bairro'),''),
        'cidade', NULLIF(upper(v_d->>'cidade'),''), 'uf', NULLIF(v_d->>'uf',''), 'cep', NULLIF(v_d->>'cep',''))),
      banco_nome = NULLIF(upper(v_d->>'banco_nome'),''), agencia = NULLIF(v_d->>'agencia',''),
      conta = NULLIF(concat_ws('-', NULLIF(v_d->>'conta',''), NULLIF(v_d->>'conta_digito','')),''),
      pix_chave = NULLIF(v_d->>'pix_chave',''),
      cargo_id = v_cargo, unidade_id = v_unidade, setor_id = v_setor,
      regime = v_regime::dp_regime_trabalho, forma_pagamento = v_forma::dp_forma_pagamento,
      salario_base = NULLIF(v_a->>'salario','')::numeric,
      data_admissao = v_admissao,
      origem_cadastro = 'preadmissao'
     WHERE id = v_rotina_colab AND company_id = pa.company_id AND deleted_at IS NULL
       AND origem_cadastro = 'preadmissao_rotina';
    IF FOUND THEN
      v_colab := v_rotina_colab;
    END IF;
  END IF;

  IF v_colab IS NULL THEN
    INSERT INTO public.dp_colaboradores (
      company_id, nome, nome_social, cpf, data_nascimento, sexo, estado_civil, telefone, whatsapp, email_contato,
      rg_numero, rg_orgao, rg_uf, rg_emissao, ctps_numero, ctps_serie, ctps_uf, ctps_expedicao,
      pis_nit, titulo_eleitor, titulo_zona, titulo_secao, reservista, reservista_categoria,
      nome_mae, nome_pai, nacionalidade, naturalidade, raca_cor, grau_instrucao, deficiencia,
      endereco, banco_nome, agencia, conta, pix_chave,
      cargo_id, unidade_id, setor_id, regime, forma_pagamento, salario_base, data_admissao,
      contatos_emergencia, contatos_confirmados_em, contatos_confirmados_por, origem_cadastro
    ) VALUES (
      pa.company_id,
      upper(COALESCE(NULLIF(v_d->>'nome',''), pa.candidato_nome)),
      NULLIF(upper(v_d->>'nome_social'),''),
      v_cpf,
      COALESCE(pa.data_nascimento, NULLIF(v_d->>'data_nascimento','')::date),
      NULLIF(v_d->>'sexo',''),
      COALESCE(NULLIF(v_d->>'estado_civil',''), pa.estado_civil),
      NULLIF(v_d->>'telefone',''),
      pa.whatsapp,
      COALESCE(NULLIF(lower(v_d->>'email'),''), pa.email),
      NULLIF(v_d->>'rg_numero',''), NULLIF(upper(v_d->>'rg_orgao'),''), NULLIF(v_d->>'rg_uf',''),
      NULLIF(v_d->>'rg_emissao','')::date,
      NULLIF(v_d->>'ctps_numero',''), NULLIF(v_d->>'ctps_serie',''), NULLIF(v_d->>'ctps_uf',''),
      NULLIF(v_d->>'ctps_expedicao','')::date,
      NULLIF(v_d->>'pis',''), NULLIF(v_d->>'titulo_eleitor',''), NULLIF(v_d->>'titulo_zona',''),
      NULLIF(v_d->>'titulo_secao',''), NULLIF(v_d->>'reservista',''), NULLIF(upper(v_d->>'reservista_categoria'),''),
      NULLIF(upper(v_d->>'nome_mae'),''), NULLIF(upper(v_d->>'nome_pai'),''),
      NULLIF(upper(v_d->>'nacionalidade'),''),
      NULLIF(upper(concat_ws(' - ', NULLIF(v_d->>'naturalidade',''), NULLIF(v_d->>'naturalidade_uf',''))),''),
      NULLIF(v_d->>'raca_cor',''), NULLIF(v_d->>'grau_instrucao',''), NULLIF(v_d->>'deficiencia',''),
      jsonb_strip_nulls(jsonb_build_object(
        'logradouro', NULLIF(upper(v_d->>'endereco'),''), 'numero', NULLIF(v_d->>'numero',''),
        'complemento', NULLIF(upper(v_d->>'complemento'),''), 'bairro', NULLIF(upper(v_d->>'bairro'),''),
        'cidade', NULLIF(upper(v_d->>'cidade'),''), 'uf', NULLIF(v_d->>'uf',''), 'cep', NULLIF(v_d->>'cep',''))),
      NULLIF(upper(v_d->>'banco_nome'),''), NULLIF(v_d->>'agencia',''),
      NULLIF(concat_ws('-', NULLIF(v_d->>'conta',''), NULLIF(v_d->>'conta_digito','')),''),
      NULLIF(v_d->>'pix_chave',''),
      v_cargo, v_unidade, v_setor, v_regime::dp_regime_trabalho, v_forma::dp_forma_pagamento,
      NULLIF(v_a->>'salario','')::numeric, v_admissao,
      '[]'::jsonb, NULL, NULL, 'preadmissao'
    ) RETURNING id INTO v_colab;
  END IF;

  -- Status e conferência exigidos pela rotina de conclusão (que copia documentos e dependentes).
  UPDATE public.dp_preadmissoes
     SET status = 'registro_recebido',
         ficha_oficial_conferida_em = COALESCE(ficha_oficial_conferida_em, now()),
         ficha_oficial_conferida_por = COALESCE(ficha_oficial_conferida_por, auth.uid())
   WHERE id = pa.id;

  v_res := public._dp_preadmissao_concluir(pa.id, v_colab, v_admissao);

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'efetivada_direto',
          jsonb_build_object('regime', v_regime, 'clt_sem_ficha', v_clt AND pa.ficha_oficial_conferida_em IS NULL,
                             'confirmado', p_confirmo_sem_ficha,
                             'converteu_rotina', v_rotina_colab IS NOT NULL AND v_colab = v_rotina_colab), auth.uid());

  RETURN v_res || jsonb_build_object('modo', 'direto');
END;
$function$;
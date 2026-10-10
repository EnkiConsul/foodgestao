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
  v_regime := COALESCE(NULLIF(v_a->>'regime_trabalho',''), pa.regime_previsto, 'clt');
  v_clt := v_regime IN ('clt','intermitente');
  IF v_clt AND pa.ficha_oficial_conferida_em IS NULL AND NOT p_confirmo_sem_ficha THEN
    RAISE EXCEPTION 'Vínculo CLT sem ficha de registro: confirme a efetivação com os dados da pré-admissão.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_cpf := regexp_replace(COALESCE(pa.cpf, v_d->>'cpf', ''), '\D', '', 'g');
  IF length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'A pré-admissão não tem CPF válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_colaboradores
              WHERE company_id = pa.company_id AND deleted_at IS NULL
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
                             'confirmado', p_confirmo_sem_ficha), auth.uid());

  RETURN v_res || jsonb_build_object('modo', 'direto');
END;
$function$;

-- Conclusão compartilhada sem exigir anexo da ficha oficial (usada só pela efetivação direta).
CREATE OR REPLACE FUNCTION public._dp_preadmissao_concluir(p_preadmissao_id uuid, p_colaborador_id uuid, p_admissao date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa record; p record; d record;
  v_docs int := 0; v_deps int := 0; v_titular text; v_finalidade text;
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id;
  FOR p IN SELECT * FROM public.dp_preadmissao_pessoas
            WHERE preadmissao_id = pa.id AND finalidade_dependente AND removido_em IS NULL LOOP
    INSERT INTO public.dp_dependentes (company_id, colaborador_id, nome, data_nascimento, parentesco, cpf)
    VALUES (pa.company_id, p_colaborador_id, upper(p.nome), p.data_nascimento, p.parentesco, p.cpf);
    v_deps := v_deps + 1;
  END LOOP;
  FOR d IN
    SELECT dd.*, pp.nome AS pessoa_nome, pp.parentesco AS pessoa_parentesco, pp.finalidade_dependente, pp.finalidade_sesc
      FROM public.dp_preadmissao_documentos dd
      LEFT JOIN public.dp_preadmissao_pessoas pp ON pp.id = dd.pessoa_id
     WHERE dd.preadmissao_id = pa.id AND dd.substituido_em IS NULL AND dd.status <> 'recusado'
       AND (dd.pessoa_id IS NULL OR pp.removido_em IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.dp_documentos x WHERE x.file_path = dd.file_path)
  LOOP
    IF d.pessoa_id IS NULL THEN
      v_titular := upper(COALESCE(pa.dados->>'nome', pa.candidato_nome)); v_finalidade := 'TITULAR';
    ELSE
      v_titular := upper(d.pessoa_nome);
      v_finalidade := CASE WHEN d.finalidade_dependente AND d.finalidade_sesc THEN 'DEPENDENTE E SESC'
        WHEN d.finalidade_dependente THEN 'DEPENDENTE' ELSE 'SESC' END || COALESCE(' - ' || upper(d.pessoa_parentesco), '');
    END IF;
    INSERT INTO public.dp_documentos (company_id, colaborador_id, unidade_id, tipo, titulo, descricao,
      file_path, file_name, file_size, mime_type, uploaded_by, aprovacao_status, submetido_por_colaborador)
    VALUES (pa.company_id, p_colaborador_id, pa.unidade_prevista_id, 'outros_admissao'::dp_documento_tipo,
      upper(d.requisito_codigo),
      'Origem: Pré-Admissão pelo Candidato. Titular: ' || v_titular || '. Finalidade: ' || v_finalidade || '.',
      d.file_path, d.file_name, d.file_size, d.mime_type, auth.uid(),
      CASE WHEN d.status = 'aprovado' THEN 'aprovado'::dp_documento_aprovacao_status ELSE 'pendente'::dp_documento_aprovacao_status END,
      true);
    v_docs := v_docs + 1;
  END LOOP;
  -- colaborador_id gravado aqui dispara a cópia dos contatos de emergência.
  UPDATE public.dp_preadmissoes
     SET colaborador_id = p_colaborador_id, status = 'concluido', vinculo_admissao_em = p_admissao, updated_at = now()
   WHERE id = pa.id;
  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'concluida',
          jsonb_build_object('documentos', v_docs, 'dependentes', v_deps, 'admissao', p_admissao), auth.uid());
  RETURN jsonb_build_object('colaborador_id', p_colaborador_id, 'ja_aplicado', false,
                            'documentos', v_docs, 'dependentes', v_deps, 'admissao', p_admissao);
END;
$function$;

REVOKE ALL ON FUNCTION public._dp_preadmissao_concluir(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._dp_preadmissao_concluir(uuid, uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar_direto(uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar_direto(uuid, date, boolean) TO authenticated, service_role;
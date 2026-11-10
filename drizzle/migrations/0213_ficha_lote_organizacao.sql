ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ficha_lote_pronto';

ALTER TABLE public.dp_ficha_importacoes
  ADD COLUMN IF NOT EXISTS organizacao jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Organiza o lote: cria/vincula cargos e setores e grava a escolha por grupo de cargo
-- (ou por ficha, quando o cargo lido é um rótulo genérico). Nada é cadastrado como colaborador.
CREATE OR REPLACE FUNCTION public.dp_ficha_lote_organizar(
  p_importacao_id uuid,
  p_unidade_id uuid,
  p_grupos jsonb,
  p_sindicato_laboral_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_org jsonb;
  v_grupos jsonb := '{}'::jsonb;
  v_itens jsonb := '{}'::jsonb;
  g jsonb;
  v_cargo uuid;
  v_setor uuid;
  v_nome text;
  v_cbo text;
  v_setor_nome text;
  v_item text;
  v_cargos_criados int := 0;
  v_setores_criados int := 0;
  v_sind_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'SEM_SESSAO' USING ERRCODE = '42501'; END IF;

  SELECT company_id, organizacao INTO v_company, v_org
    FROM public.dp_ficha_importacoes WHERE id = p_importacao_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'LOTE_NAO_ENCONTRADO'; END IF;

  IF NOT (public.is_company_admin_or_owner(v_uid, v_company) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: apenas dono ou administrador organiza o lote.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dp_unidades WHERE id = p_unidade_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'UNIDADE_INVALIDA: a unidade não pertence a esta empresa.';
  END IF;

  IF p_sindicato_laboral_id IS NOT NULL THEN
    SELECT true INTO v_sind_ok FROM public.dp_sindicatos
     WHERE id = p_sindicato_laboral_id AND company_id = v_company AND tipo = 'laboral';
    IF NOT coalesce(v_sind_ok, false) THEN
      RAISE EXCEPTION 'SINDICATO_INVALIDO: escolha um sindicato laboral desta empresa.';
    END IF;
  END IF;

  IF jsonb_typeof(p_grupos) <> 'array' THEN RAISE EXCEPTION 'GRUPOS_INVALIDOS'; END IF;

  FOR g IN SELECT * FROM jsonb_array_elements(p_grupos) LOOP
    v_cargo := nullif(g->>'cargo_id', '')::uuid;
    v_setor := nullif(g->>'setor_id', '')::uuid;
    v_nome := upper(btrim(coalesce(g->>'cargo_nome', '')));
    v_cbo := nullif(regexp_replace(coalesce(g->>'cbo', ''), '\D', '', 'g'), '');
    v_setor_nome := upper(btrim(coalesce(g->>'setor_nome', '')));

    -- Cargo
    IF v_cargo IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.dp_cargos WHERE id = v_cargo AND company_id = v_company AND removido_em IS NULL) THEN
        RAISE EXCEPTION 'CARGO_INVALIDO: cargo não pertence a esta empresa.';
      END IF;
    ELSIF v_nome <> '' THEN
      IF v_nome ~* '(IMPORTA[CÇ][AÃ]O|ESOCIAL|A DEFINIR|SEM CARGO|NAO INFORMADO|NÃO INFORMADO)' THEN
        RAISE EXCEPTION 'CARGO_GENERICO: escolha o cargo real em vez de "%".', v_nome;
      END IF;
      SELECT id INTO v_cargo FROM public.dp_cargos
       WHERE company_id = v_company AND removido_em IS NULL
         AND public.dp_nome_normalizado(nome) = public.dp_nome_normalizado(v_nome)
       ORDER BY ativo DESC, created_at LIMIT 1;
      IF v_cargo IS NULL THEN
        INSERT INTO public.dp_cargos (company_id, nome, cbo, ativo)
        VALUES (v_company, v_nome, v_cbo, true) RETURNING id INTO v_cargo;
        v_cargos_criados := v_cargos_criados + 1;
      END IF;
    END IF;

    -- Setor
    IF v_setor IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.dp_setores WHERE id = v_setor AND company_id = v_company AND unidade_id = p_unidade_id) THEN
        RAISE EXCEPTION 'SETOR_INVALIDO: setor não pertence à unidade escolhida.';
      END IF;
    ELSIF v_setor_nome <> '' THEN
      SELECT id INTO v_setor FROM public.dp_setores
       WHERE unidade_id = p_unidade_id AND public.dp_nome_normalizado(nome) = public.dp_nome_normalizado(v_setor_nome)
       LIMIT 1;
      IF v_setor IS NULL THEN
        INSERT INTO public.dp_setores (company_id, unidade_id, nome, ativo, created_by, updated_by)
        VALUES (v_company, p_unidade_id, v_setor_nome, true, v_uid, v_uid) RETURNING id INTO v_setor;
        v_setores_criados := v_setores_criados + 1;
      ELSE
        UPDATE public.dp_setores SET ativo = true WHERE id = v_setor AND ativo = false;
      END IF;
    END IF;

    IF v_cargo IS NOT NULL AND p_sindicato_laboral_id IS NOT NULL THEN
      INSERT INTO public.dp_sindicato_cargos (sindicato_id, cargo_id)
      VALUES (p_sindicato_laboral_id, v_cargo) ON CONFLICT DO NOTHING;
    END IF;

    IF jsonb_typeof(g->'item_ids') = 'array' AND jsonb_array_length(g->'item_ids') > 0 THEN
      FOR v_item IN SELECT jsonb_array_elements_text(g->'item_ids') LOOP
        IF NOT EXISTS (SELECT 1 FROM public.dp_ficha_importacao_itens WHERE id = v_item::uuid AND importacao_id = p_importacao_id) THEN
          RAISE EXCEPTION 'FICHA_INVALIDA: ficha fora deste lote.';
        END IF;
        v_itens := v_itens || jsonb_build_object(v_item, jsonb_build_object('cargo_id', v_cargo, 'setor_id', v_setor));
      END LOOP;
    ELSIF coalesce(g->>'chave', '') <> '' THEN
      v_grupos := v_grupos || jsonb_build_object(g->>'chave', jsonb_build_object('cargo_id', v_cargo, 'setor_id', v_setor));
    END IF;
  END LOOP;

  v_org := coalesce(v_org, '{}'::jsonb)
    || jsonb_build_object(
      'versao', 1,
      'unidade_id', p_unidade_id,
      'sindicato_laboral_id', p_sindicato_laboral_id,
      'grupos', coalesce(v_org->'grupos', '{}'::jsonb) || v_grupos,
      'itens', coalesce(v_org->'itens', '{}'::jsonb) || v_itens,
      'organizado_em', now(),
      'organizado_por', v_uid
    );

  UPDATE public.dp_ficha_importacoes SET organizacao = v_org WHERE id = p_importacao_id;

  RETURN jsonb_build_object('cargos_criados', v_cargos_criados, 'setores_criados', v_setores_criados, 'organizacao', v_org);
END $$;

REVOKE ALL ON FUNCTION public.dp_ficha_lote_organizar(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_lote_organizar(uuid, uuid, jsonb, uuid) TO authenticated, service_role;

-- Responsáveis que podem receber o lote (somente equipe Aveto).
CREATE OR REPLACE FUNCTION public.dp_ficha_lote_responsaveis(p_importacao_id uuid)
RETURNS TABLE(user_id uuid, nome text, email text, perfil text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: exclusivo da equipe Aveto.' USING ERRCODE = '42501';
  END IF;
  SELECT company_id INTO v_company FROM public.dp_ficha_importacoes WHERE id = p_importacao_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'LOTE_NAO_ENCONTRADO'; END IF;
  RETURN QUERY
    SELECT m.user_id, coalesce(nullif(btrim(p.full_name), ''), u.email::text), u.email::text, m.role::text
      FROM public.company_members m
      JOIN auth.users u ON u.id = m.user_id
      LEFT JOIN public.profiles p ON p.user_id = m.user_id
     WHERE m.company_id = v_company
       AND m.situacao = 'ativo'
       AND m.role::text IN ('owner', 'admin')
       AND NOT public.is_super_admin(m.user_id)
     ORDER BY (m.role::text = 'owner') DESC, 2;
END $$;

REVOKE ALL ON FUNCTION public.dp_ficha_lote_responsaveis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_lote_responsaveis(uuid) TO authenticated, service_role;

-- Passa o lote ao responsável da empresa, em nome da Aveto (somente equipe Aveto).
CREATE OR REPLACE FUNCTION public.dp_ficha_lote_notificar(p_importacao_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_empresa text;
  v_pend int;
  v_notif uuid;
BEGIN
  IF NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: exclusivo da equipe Aveto.' USING ERRCODE = '42501';
  END IF;
  SELECT i.company_id, coalesce(nullif(btrim(c.trade_name), ''), c.name)
    INTO v_company, v_empresa
    FROM public.dp_ficha_importacoes i JOIN public.companies c ON c.id = i.company_id
   WHERE i.id = p_importacao_id FOR UPDATE OF i;
  IF v_company IS NULL THEN RAISE EXCEPTION 'LOTE_NAO_ENCONTRADO'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
     WHERE company_id = v_company AND user_id = p_user_id AND situacao = 'ativo' AND role::text IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'RESPONSAVEL_INVALIDO: escolha um dono ou administrador ativo da empresa.';
  END IF;

  SELECT count(*) INTO v_pend FROM public.dp_ficha_importacao_itens
   WHERE importacao_id = p_importacao_id AND status IN ('pendente', 'revisar', 'duplicado');
  IF v_pend = 0 THEN RAISE EXCEPTION 'LOTE_SEM_PENDENCIAS: todas as fichas já foram concluídas.'; END IF;

  INSERT INTO public.dp_notificacoes (company_id, user_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (
    v_company, p_user_id, 'ficha_lote_pronto',
    'Fichas de registro prontas para conferência',
    'A equipe da Aveto 360 parametrizou ' || v_pend || CASE WHEN v_pend = 1 THEN ' ficha de registro' ELSE ' fichas de registro' END
      || ' de ' || v_empresa || '. Toque para conferir e concluir o cadastro da sua equipe.',
    'dp_ficha_importacoes', p_importacao_id, false
  ) RETURNING id INTO v_notif;

  UPDATE public.dp_ficha_importacoes
     SET organizacao = coalesce(organizacao, '{}'::jsonb) || jsonb_build_object(
       'notificacao', jsonb_build_object('user_id', p_user_id, 'em', now(), 'por', v_uid, 'fichas', v_pend))
   WHERE id = p_importacao_id;

  RETURN jsonb_build_object('notificacao_id', v_notif, 'fichas', v_pend);
END $$;

REVOKE ALL ON FUNCTION public.dp_ficha_lote_notificar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_lote_notificar(uuid, uuid) TO authenticated, service_role;
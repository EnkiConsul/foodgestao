-- =====================================================================
-- Medidas disciplinares: exclusão com histórico
-- =====================================================================
ALTER TABLE public.dp_registros_disciplinares
  ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid,
  ADD COLUMN IF NOT EXISTS removido_motivo text;

CREATE INDEX IF NOT EXISTS idx_dp_disc_ativos
  ON public.dp_registros_disciplinares (company_id, colaborador_id, data)
  WHERE removido_em IS NULL;

-- =====================================================================
-- Conferência de folga (uso interno)
-- =====================================================================
CREATE OR REPLACE FUNCTION private.dp_folga_conferir(
  _company_id uuid,
  _colaborador_id uuid,
  _data date
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _data IS NULL THEN RAISE EXCEPTION 'FOLGA_DATA_OBRIGATORIA'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
     WHERE c.id = _colaborador_id
       AND c.company_id = _company_id
       AND c.deleted_at IS NULL
       AND c.ativo IS TRUE
  ) THEN RAISE EXCEPTION 'FOLGA_COLABORADOR_INVALIDO'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = _colaborador_id
       AND f.data = _data
       AND f.status <> 'cancelada'
  ) THEN RAISE EXCEPTION 'FOLGA_DUPLICADA'; END IF;
END $$;

REVOKE ALL ON FUNCTION private.dp_folga_conferir(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_conferir(uuid, uuid, date) TO service_role;

-- =====================================================================
-- Folga lançada pelo DP
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dp_folga_admin_criar(
  p_colaborador_id uuid,
  p_data date,
  p_tipo text DEFAULT 'normal',
  p_origem text DEFAULT 'admin_manual',
  p_observacao text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT company_id INTO v_company FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_folga:' || p_colaborador_id::text || ':' || p_data::text, 0));

  -- Idempotência: mesmo dia já agendado devolve a folga existente.
  SELECT id INTO v_id FROM public.dp_folgas
   WHERE colaborador_id = p_colaborador_id AND data = p_data AND status <> 'cancelada'
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  PERFORM private.dp_folga_conferir(v_company, p_colaborador_id, p_data);

  INSERT INTO public.dp_folgas (
    company_id, colaborador_id, data, tipo, origem, status, observacao, criado_por
  ) VALUES (
    v_company, p_colaborador_id, p_data,
    COALESCE(NULLIF(p_tipo, ''), 'normal')::public.dp_folga_tipo,
    COALESCE(NULLIF(p_origem, ''), 'admin_manual')::public.dp_folga_origem,
    'agendada', NULLIF(btrim(COALESCE(p_observacao, '')), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_folga_admin_criar(uuid, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_admin_criar(uuid, date, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_folgas_admin_criar_lote(p_itens jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_total integer := 0;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'FOLGA_LOTE_VAZIO';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_itens) LOOP
    PERFORM public.dp_folga_admin_criar(
      (v_item->>'colaborador_id')::uuid,
      (v_item->>'data')::date,
      COALESCE(v_item->>'tipo', 'normal'),
      COALESCE(v_item->>'origem', 'admin_manual'),
      v_item->>'observacao'
    );
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION public.dp_folgas_admin_criar_lote(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folgas_admin_criar_lote(jsonb) TO authenticated, service_role;

-- =====================================================================
-- Medidas disciplinares: rotinas oficiais
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_registrar(
  p_colaborador_id uuid,
  p_tipo text,
  p_data date,
  p_motivo text,
  p_descricao text DEFAULT NULL,
  p_suspensao_dias integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT company_id INTO v_company FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF p_data IS NULL THEN RAISE EXCEPTION 'DISC_DATA_OBRIGATORIA'; END IF;
  IF p_data > CURRENT_DATE + 1 THEN RAISE EXCEPTION 'DISC_DATA_FUTURA'; END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'DISC_MOTIVO_OBRIGATORIO'; END IF;
  IF p_tipo = 'suspensao' AND COALESCE(p_suspensao_dias, 0) <= 0 THEN
    RAISE EXCEPTION 'DISC_SUSPENSAO_DIAS';
  END IF;

  INSERT INTO public.dp_registros_disciplinares (
    company_id, colaborador_id, tipo, data, motivo, descricao, suspensao_dias, aplicado_por
  ) VALUES (
    v_company, p_colaborador_id, p_tipo::public.dp_disciplinar_tipo, p_data,
    btrim(p_motivo), NULLIF(btrim(COALESCE(p_descricao, '')), ''),
    CASE WHEN COALESCE(p_suspensao_dias, 0) > 0 THEN p_suspensao_dias END,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_registrar(uuid, text, date, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_registrar(uuid, text, date, text, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_anexar(
  p_registro_id uuid,
  p_pdf_storage_path text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT company_id INTO v_company FROM public.dp_registros_disciplinares WHERE id = p_registro_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF COALESCE(btrim(p_pdf_storage_path), '') = '' THEN RAISE EXCEPTION 'DISC_ARQUIVO_INVALIDO'; END IF;
  IF left(p_pdf_storage_path, length(v_company::text)) <> v_company::text THEN
    RAISE EXCEPTION 'DISC_ARQUIVO_INVALIDO';
  END IF;

  UPDATE public.dp_registros_disciplinares
     SET pdf_storage_path = p_pdf_storage_path, updated_at = now()
   WHERE id = p_registro_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_anexar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_anexar(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_corrigir(
  p_registro_id uuid,
  p_colaborador_id uuid DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_data date DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_suspensao_dias integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg public.dp_registros_disciplinares;
  v_colab uuid;
  v_tipo public.dp_disciplinar_tipo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_reg FROM public.dp_registros_disciplinares WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_reg.removido_em IS NOT NULL THEN RAISE EXCEPTION 'DISC_REGISTRO_EXCLUIDO'; END IF;
  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_reg.company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_reg.company_id AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  v_colab := COALESCE(p_colaborador_id, v_reg.colaborador_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
     WHERE c.id = v_colab AND c.company_id = v_reg.company_id AND c.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'FOLGA_COLABORADOR_INVALIDO'; END IF;

  v_tipo := COALESCE(NULLIF(p_tipo, '')::public.dp_disciplinar_tipo, v_reg.tipo);
  IF v_tipo = 'suspensao' AND COALESCE(p_suspensao_dias, v_reg.suspensao_dias, 0) <= 0 THEN
    RAISE EXCEPTION 'DISC_SUSPENSAO_DIAS';
  END IF;
  IF COALESCE(p_data, v_reg.data) > CURRENT_DATE + 1 THEN RAISE EXCEPTION 'DISC_DATA_FUTURA'; END IF;

  UPDATE public.dp_registros_disciplinares
     SET colaborador_id = v_colab,
         tipo = v_tipo,
         data = COALESCE(p_data, data),
         motivo = COALESCE(NULLIF(btrim(COALESCE(p_motivo, '')), ''), motivo),
         descricao = CASE WHEN p_descricao IS NULL THEN descricao
                          ELSE NULLIF(btrim(p_descricao), '') END,
         suspensao_dias = CASE WHEN COALESCE(p_suspensao_dias, 0) > 0 THEN p_suspensao_dias
                               WHEN p_suspensao_dias IS NOT NULL THEN NULL
                               ELSE suspensao_dias END,
         updated_at = now()
   WHERE id = p_registro_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_corrigir(uuid, uuid, text, date, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_corrigir(uuid, uuid, text, date, text, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_excluir(
  p_registro_id uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_reg public.dp_registros_disciplinares;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'DISC_MOTIVO_EXCLUSAO'; END IF;

  SELECT * INTO v_reg FROM public.dp_registros_disciplinares WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_reg.company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_reg.company_id AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF v_reg.removido_em IS NOT NULL THEN RETURN; END IF;

  UPDATE public.dp_registros_disciplinares
     SET removido_em = now(), removido_por = auth.uid(), removido_motivo = btrim(p_motivo), updated_at = now()
   WHERE id = p_registro_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_excluir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_excluir(uuid, text) TO authenticated, service_role;

-- =====================================================================
-- Aceite de documento anexado (checklist de admissão)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dp_documento_anexo_aceitar(
  p_vinculo_id uuid,
  p_user_agent text DEFAULT NULL,
  p_ip text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_vinc public.dp_colaborador_documentos;
  v_doc public.dp_documentos;
  v_modelo text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN RAISE EXCEPTION 'sem_acesso_portal'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_documento_anexo:' || p_vinculo_id::text, 0));

  SELECT * INTO v_vinc FROM public.dp_colaborador_documentos WHERE id = p_vinculo_id;
  IF v_vinc.id IS NULL OR v_vinc.colaborador_id IS DISTINCT FROM v_colab THEN
    RAISE EXCEPTION 'documento_indisponivel';
  END IF;
  IF v_vinc.documento_id IS NULL THEN RAISE EXCEPTION 'documento_sem_arquivo'; END IF;
  IF v_vinc.aceite_solicitado_em IS NULL THEN RAISE EXCEPTION 'aceite_nao_solicitado'; END IF;

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = v_vinc.documento_id;
  IF v_doc.id IS NULL OR v_doc.company_id IS DISTINCT FROM v_vinc.company_id THEN
    RAISE EXCEPTION 'documento_indisponivel';
  END IF;

  SELECT r.tipo_documento::text INTO v_modelo
    FROM public.dp_documento_requisitos r WHERE r.id = v_vinc.requisito_id;

  SELECT id INTO v_id FROM public.dp_documento_aceites
   WHERE documento_id = v_vinc.documento_id AND aceito_por = v_uid LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_documento_aceites (
      company_id, colaborador_id, requisito_id, documento_id, modelo, modelo_versao,
      conteudo_hash, aceito_por, ip, user_agent, documento_versao, hash_origem
    ) VALUES (
      v_vinc.company_id, v_colab, v_vinc.requisito_id, v_vinc.documento_id,
      COALESCE(v_modelo, v_doc.tipo::text), 'anexo',
      COALESCE(v_doc.arquivo_sha256, v_vinc.conteudo_hash, ''),
      v_uid, NULLIF(btrim(COALESCE(p_ip, '')), ''),
      NULLIF(left(COALESCE(p_user_agent, ''), 500), ''),
      COALESCE(v_doc.versao, 1),
      CASE WHEN v_doc.arquivo_sha256 IS NOT NULL THEN 'sha256_conteudo' ELSE 'anexo_legado' END
    )
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.dp_colaborador_documentos
     SET aceito_em = COALESCE(aceito_em, now()), updated_at = now()
   WHERE id = p_vinculo_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_documento_anexo_aceitar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_documento_anexo_aceitar(uuid, text, text) TO authenticated, service_role;
-- Modo de assinatura do colaborador (celular x papel) com vigência e histórico imutável.
CREATE TABLE public.dp_colaborador_modo_assinatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  modo text NOT NULL CHECK (modo IN ('digital', 'fisica')),
  vigente_desde date NOT NULL,
  motivo text CHECK (motivo IS NULL OR length(motivo) <= 500),
  origem text NOT NULL DEFAULT 'cadastro' CHECK (origem IN ('cadastro', 'importacao_ficha')),
  documentos_convertidos integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dp_colab_modo_assinatura_colab_idx
  ON public.dp_colaborador_modo_assinatura (colaborador_id, vigente_desde DESC, created_at DESC);
CREATE INDEX dp_colab_modo_assinatura_company_idx
  ON public.dp_colaborador_modo_assinatura (company_id);

GRANT SELECT ON public.dp_colaborador_modo_assinatura TO authenticated;
GRANT ALL ON public.dp_colaborador_modo_assinatura TO service_role;

ALTER TABLE public.dp_colaborador_modo_assinatura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consulta modo de assinatura"
  ON public.dp_colaborador_modo_assinatura
  FOR SELECT TO authenticated
  USING (public.tem_permissao(company_id, 'dp.colaboradores', 'consulta'));

COMMENT ON TABLE public.dp_colaborador_modo_assinatura IS
  'Histórico imutável do modo de assinatura de documentos (digital no portal x física em papel). Vale o registro mais recente com vigente_desde <= data. Gravação só por dp_colaborador_modo_assinatura_definir.';

-- Modo vigente numa data (sem registro = digital).
CREATE OR REPLACE FUNCTION public.dp_colaborador_modo_assinatura_em(p_colaborador_id uuid, p_data date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((
    SELECT m.modo FROM public.dp_colaborador_modo_assinatura m
     WHERE m.colaborador_id = p_colaborador_id
       AND m.vigente_desde <= p_data
     ORDER BY m.vigente_desde DESC, m.created_at DESC
     LIMIT 1
  ), 'digital')
$$;

REVOKE ALL ON FUNCTION public.dp_colaborador_modo_assinatura_em(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_modo_assinatura_em(uuid, date) TO service_role;

-- Documentos ainda aguardando assinatura no celular que podem passar para o papel.
CREATE OR REPLACE FUNCTION private.dp_modo_assinatura_docs_pendentes(p_colaborador_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.id FROM public.dp_documentos d
   WHERE d.colaborador_id = p_colaborador_id
     AND d.exige_aceite = true
     AND coalesce(d.submetido_por_colaborador, false) = false
     AND d.tipo::text <> 'atestado'
     AND d.arquivado_em IS NULL
     AND coalesce(d.ciclo_status, 'ativo') = 'ativo'
     AND d.assinatura_dispensada_em IS NULL
     AND d.superseded_at IS NULL
     AND coalesce(d.aprovacao_status::text, '') <> 'recusado'
     AND NOT EXISTS (SELECT 1 FROM public.dp_documento_aceites a WHERE a.documento_id = d.id)
     AND NOT EXISTS (SELECT 1 FROM public.dp_recibos r WHERE r.documento_id = d.id)
$$;

REVOKE ALL ON FUNCTION private.dp_modo_assinatura_docs_pendentes(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dp_colaborador_modo_assinatura_pendentes(p_colaborador_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.tem_permissao(v_company, 'dp.colaboradores', 'consulta') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT count(*)::int FROM private.dp_modo_assinatura_docs_pendentes(p_colaborador_id));
END $$;

REVOKE ALL ON FUNCTION public.dp_colaborador_modo_assinatura_pendentes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_modo_assinatura_pendentes(uuid) TO authenticated, service_role;

-- Única porta de gravação do modo: confere permissão, data e registra auditoria.
CREATE OR REPLACE FUNCTION public.dp_colaborador_modo_assinatura_definir(
  p_colaborador_id uuid,
  p_modo text,
  p_vigente_desde date,
  p_motivo text DEFAULT NULL,
  p_converter_pendentes boolean DEFAULT false,
  p_origem text DEFAULT 'cadastro'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_colab record;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_motivo text := NULLIF(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_modo IS NULL OR p_modo NOT IN ('digital', 'fisica') THEN RAISE EXCEPTION 'MODO_ASSINATURA_INVALIDO'; END IF;
  IF p_vigente_desde IS NULL THEN RAISE EXCEPTION 'MODO_ASSINATURA_DATA_OBRIGATORIA'; END IF;
  IF coalesce(p_origem, '') NOT IN ('cadastro', 'importacao_ficha') THEN RAISE EXCEPTION 'MODO_ASSINATURA_ORIGEM_INVALIDA'; END IF;
  IF v_motivo IS NOT NULL AND length(v_motivo) > 500 THEN RAISE EXCEPTION 'MODO_ASSINATURA_MOTIVO_LONGO'; END IF;

  SELECT id, company_id, data_admissao INTO v_colab
    FROM public.dp_colaboradores WHERE id = p_colaborador_id FOR UPDATE;
  IF v_colab.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.tem_permissao(v_colab.company_id, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_colab.data_admissao IS NOT NULL AND p_vigente_desde < v_colab.data_admissao THEN
    RAISE EXCEPTION 'MODO_ASSINATURA_ANTES_ADMISSAO';
  END IF;
  IF p_vigente_desde > v_hoje + 366 THEN RAISE EXCEPTION 'MODO_ASSINATURA_DATA_DISTANTE'; END IF;

  -- Nada muda: mesmo modo já vigente na data e nenhuma troca agendada depois.
  IF public.dp_colaborador_modo_assinatura_em(p_colaborador_id, p_vigente_desde) = p_modo
     AND NOT EXISTS (
       SELECT 1 FROM public.dp_colaborador_modo_assinatura
        WHERE colaborador_id = p_colaborador_id AND vigente_desde > p_vigente_desde
     ) THEN
    RETURN jsonb_build_object('id', NULL, 'sem_mudanca', true, 'convertidos', 0);
  END IF;

  -- Papel valendo desde hoje (ou antes): documentos que esperam o celular passam para a via impressa.
  IF p_modo = 'fisica' AND coalesce(p_converter_pendentes, false) AND p_vigente_desde <= v_hoje THEN
    SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_ids
      FROM private.dp_modo_assinatura_docs_pendentes(p_colaborador_id) x;
    IF array_length(v_ids, 1) > 0 THEN
      UPDATE public.dp_documentos
         SET exige_aceite = false, assinatura_fisica = true
       WHERE id = ANY (v_ids);
      DELETE FROM public.dp_notificacoes
       WHERE ref_table = 'dp_documentos' AND ref_id = ANY (v_ids)
         AND lida_em IS NULL AND tipo::text = 'documento_novo';
    END IF;
  END IF;

  INSERT INTO public.dp_colaborador_modo_assinatura (
    company_id, colaborador_id, modo, vigente_desde, motivo, origem, documentos_convertidos, created_by
  ) VALUES (
    v_colab.company_id, p_colaborador_id, p_modo, p_vigente_desde, v_motivo, p_origem,
    coalesce(array_length(v_ids, 1), 0), auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details, company_id, actor_kind)
  VALUES (
    auth.uid(),
    (SELECT full_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
    'dp_modo_assinatura_definido',
    'dp_colaboradores',
    p_colaborador_id::text,
    jsonb_build_object('modo', p_modo, 'vigente_desde', p_vigente_desde, 'motivo', v_motivo,
                       'origem', p_origem, 'documentos_convertidos', coalesce(array_length(v_ids, 1), 0)),
    v_colab.company_id,
    'user'
  );

  RETURN jsonb_build_object('id', v_id, 'sem_mudanca', false, 'convertidos', coalesce(array_length(v_ids, 1), 0));
END $$;

REVOKE ALL ON FUNCTION public.dp_colaborador_modo_assinatura_definir(uuid, text, date, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_modo_assinatura_definir(uuid, text, date, text, boolean, text) TO authenticated, service_role;

-- Documento novo de quem assina em papel nasce para via impressa (sem cobrança no portal).
CREATE OR REPLACE FUNCTION private.dp_documento_modo_assinatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NEW.colaborador_id IS NULL
     OR NOT coalesce(NEW.exige_aceite, false)
     OR coalesce(NEW.submetido_por_colaborador, false)
     OR NEW.tipo::text = 'atestado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(OLD.exige_aceite, false) THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.dp_documento_aceites a WHERE a.documento_id = NEW.id) THEN RETURN NEW; END IF;
  END IF;
  IF public.dp_colaborador_modo_assinatura_em(NEW.colaborador_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date) <> 'fisica' THEN
    RETURN NEW;
  END IF;
  -- O próprio colaborador agindo no portal assina ali mesmo.
  SELECT user_id INTO v_user FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF auth.uid() IS NOT NULL AND v_user IS NOT NULL AND auth.uid() = v_user THEN
    RETURN NEW;
  END IF;
  NEW.exige_aceite := false;
  NEW.assinatura_fisica := true;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.dp_documento_modo_assinatura() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_dp_documento_modo_assinatura
  BEFORE INSERT OR UPDATE OF exige_aceite ON public.dp_documentos
  FOR EACH ROW EXECUTE FUNCTION private.dp_documento_modo_assinatura();

-- Aviso de documento novo: via em papel ainda sem assinatura não aparece no portal, então não avisa.
CREATE OR REPLACE FUNCTION public.dp_documento_notificar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_label text;
  v_comp text;
  v_detalhe text;
BEGIN
  -- Fora do portal: disciplinar, envio do próprio colaborador, recusado ou não ativo.
  IF NEW.colaborador_id IS NULL
     OR NEW.tipo::text = 'disciplinar'
     OR COALESCE(NEW.submetido_por_colaborador, false)
     OR COALESCE(NEW.ciclo_status, 'ativo') <> 'ativo'
     OR COALESCE(NEW.aprovacao_status::text, '') = 'recusado' THEN
    RETURN NEW;
  END IF;

  SELECT c.user_id INTO v_user
  FROM public.dp_colaboradores c
  WHERE c.id = NEW.colaborador_id;
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  v_label := CASE NEW.tipo::text
    WHEN 'contracheque' THEN 'Contracheque'
    WHEN 'contracheque_13' THEN 'Contracheque do 13º'
    WHEN 'contracheque_ferias' THEN 'Contracheque de Férias'
    WHEN 'recibo_ferias' THEN 'Recibo de Férias'
    WHEN 'aviso_ferias' THEN 'Aviso de Férias'
    WHEN 'ferias' THEN 'Férias'
    WHEN 'adiantamento' THEN 'Adiantamento Salarial'
    WHEN 'trct' THEN 'Termo de Rescisão'
    WHEN 'demonstrativo_rescisorio' THEN 'Demonstrativo Rescisório'
    WHEN 'plr' THEN 'Participação nos Resultados'
    WHEN 'pro_labore' THEN 'Recibo de Pró-labore'
    WHEN 'outros_pagamentos' THEN 'Recibo de Pagamento'
    WHEN 'ponto' THEN 'Espelho de Ponto'
    WHEN 'contrato' THEN 'Contrato de Trabalho'
    WHEN 'admissao' THEN 'Documento de Admissão'
    ELSE COALESCE(NULLIF(btrim(NEW.titulo), ''), 'Documento')
  END;

  v_comp := CASE
    WHEN NEW.referencia_data IS NOT NULL THEN ' · Competência ' || to_char(NEW.referencia_data, 'MM/YYYY')
    ELSE ''
  END;

  IF TG_OP = 'INSERT'
     AND NOT (COALESCE(NEW.assinatura_fisica, false) AND NEW.via_assinada_path IS NULL) THEN
    v_detalhe := v_label || v_comp || '. Toque para visualizar.'
      || CASE WHEN COALESCE(NEW.exige_aceite, false)
              THEN ' Precisa da sua confirmação de recebimento.' ELSE '' END;
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      NEW.company_id, v_user, NEW.colaborador_id, 'documento_novo',
      'Novo documento disponível', v_detalhe, 'dp_documentos', NEW.id,
      'documento_novo:' || NEW.id::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;

  IF NEW.comprovante_file_path IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.comprovante_file_path IS DISTINCT FROM OLD.comprovante_file_path) THEN
    v_detalhe := v_label || v_comp
      || CASE WHEN NEW.comprovante_pago_em IS NOT NULL
              THEN ' · pago em ' || to_char(NEW.comprovante_pago_em, 'DD/MM/YYYY') ELSE '' END
      || '. Toque para visualizar o comprovante.';
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      NEW.company_id, v_user, NEW.colaborador_id, 'comprovante_pagamento',
      CASE WHEN TG_OP = 'UPDATE' AND OLD.comprovante_file_path IS NOT NULL
           THEN 'Comprovante de pagamento atualizado'
           ELSE 'Comprovante de pagamento disponível' END,
      v_detalhe, 'dp_documentos', NEW.id,
      'comprovante_pagamento:' || NEW.id::text || ':' || NEW.comprovante_file_path
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Anexo da via assinada: o registro de auditoria usava colunas inexistentes e derrubava o anexo.
CREATE OR REPLACE FUNCTION public.dp_documento_anexar_via_assinada(_documento_id uuid, _file_path text, _file_name text, _mime_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  anterior text;
BEGIN
  SELECT id, company_id, colaborador_id, exige_aceite, assinatura_fisica, via_assinada_path INTO d
  FROM public.dp_documentos WHERE id = _documento_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento não encontrado'; END IF;
  IF NOT public.tem_permissao(d.company_id, 'dp.documentos', 'inclusao') THEN
    RAISE EXCEPTION 'Sem permissão para anexar a via assinada';
  END IF;
  IF d.exige_aceite OR NOT d.assinatura_fisica THEN
    RAISE EXCEPTION 'Este documento não usa assinatura física';
  END IF;
  IF _file_path IS NULL
     OR split_part(_file_path, '/', 1) <> d.company_id::text
     OR split_part(_file_path, '/', 2) <> COALESCE(d.colaborador_id::text, 'geral')
     OR split_part(_file_path, '/', 3) <> 'vias-assinadas' THEN
    RAISE EXCEPTION 'Arquivo fora da pasta do documento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'dp-documentos' AND o.name = _file_path) THEN
    RAISE EXCEPTION 'Arquivo da via assinada não encontrado';
  END IF;
  anterior := d.via_assinada_path;
  UPDATE public.dp_documentos SET
    via_assinada_path = _file_path, via_assinada_nome = _file_name, via_assinada_mime = _mime_type,
    via_assinada_em = now(), via_assinada_por = auth.uid()
  WHERE id = _documento_id;
  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details, company_id, actor_kind)
  VALUES (
    auth.uid(),
    (SELECT full_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
    CASE WHEN anterior IS NULL THEN 'dp_via_assinada_anexada' ELSE 'dp_via_assinada_substituida' END,
    'dp_documentos', _documento_id::text,
    jsonb_build_object('anterior', anterior, 'novo', _file_path),
    d.company_id,
    'user'
  );
  RETURN anterior;
END $function$;

-- Importação de fichas: escolha "assina em papel" por ficha ou em grupo.
CREATE OR REPLACE FUNCTION private.dp_ficha_lote_escolhas(p jsonb, p_company uuid, p_com_dados boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  v_id uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'AJUSTE_INVALIDO'; END IF;

  IF p ? 'regime' THEN
    IF jsonb_typeof(p->'regime') = 'null' THEN v := v || jsonb_build_object('regime', null);
    ELSIF p->>'regime' = ANY (ARRAY['clt','intermitente','estagio','temporario','pj','mei','freelancer']) THEN
      v := v || jsonb_build_object('regime', p->>'regime');
    ELSE RAISE EXCEPTION 'AJUSTE_INVALIDO: vínculo desconhecido.'; END IF;
  END IF;

  IF p ? 'forma_pagamento' THEN
    IF jsonb_typeof(p->'forma_pagamento') = 'null' THEN v := v || jsonb_build_object('forma_pagamento', null);
    ELSIF p->>'forma_pagamento' = ANY (ARRAY['mensalista','horista','diarista','semanal','por_turno','servico_acordo']) THEN
      v := v || jsonb_build_object('forma_pagamento', p->>'forma_pagamento');
    ELSE RAISE EXCEPTION 'AJUSTE_INVALIDO: forma de pagamento desconhecida.'; END IF;
  END IF;

  IF p ? 'adiantamento' THEN
    IF jsonb_typeof(p->'adiantamento') NOT IN ('null', 'boolean') THEN RAISE EXCEPTION 'AJUSTE_INVALIDO: adiantamento.'; END IF;
    v := v || jsonb_build_object('adiantamento', p->'adiantamento');
  END IF;

  IF p ? 'folha_ponto' THEN
    IF jsonb_typeof(p->'folha_ponto') NOT IN ('null', 'boolean') THEN RAISE EXCEPTION 'AJUSTE_INVALIDO: folha de ponto.'; END IF;
    v := v || jsonb_build_object('folha_ponto', p->'folha_ponto');
  END IF;

  IF p ? 'folha_ponto_justificativa' THEN
    IF jsonb_typeof(p->'folha_ponto_justificativa') = 'null' THEN
      v := v || jsonb_build_object('folha_ponto_justificativa', null);
    ELSIF jsonb_typeof(p->'folha_ponto_justificativa') = 'string' AND length(p->>'folha_ponto_justificativa') <= 500 THEN
      v := v || jsonb_build_object('folha_ponto_justificativa', NULLIF(btrim(p->>'folha_ponto_justificativa'), ''));
    ELSE RAISE EXCEPTION 'AJUSTE_INVALIDO: motivo da dispensa de ponto.'; END IF;
  END IF;

  IF p ? 'assinatura_papel' THEN
    IF jsonb_typeof(p->'assinatura_papel') NOT IN ('null', 'boolean') THEN RAISE EXCEPTION 'AJUSTE_INVALIDO: assinatura em papel.'; END IF;
    v := v || jsonb_build_object('assinatura_papel', p->'assinatura_papel');
  END IF;

  IF p ? 'turno_id' THEN
    IF jsonb_typeof(p->'turno_id') = 'null' THEN v := v || jsonb_build_object('turno_id', null);
    ELSE
      v_id := (p->>'turno_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.dp_turnos WHERE id = v_id AND company_id = p_company) THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: turno de outra empresa.';
      END IF;
      v := v || jsonb_build_object('turno_id', v_id);
    END IF;
  END IF;

  IF p_com_dados THEN
    IF p ? 'cargo_id' THEN
      IF jsonb_typeof(p->'cargo_id') = 'null' THEN v := v || jsonb_build_object('cargo_id', null);
      ELSE
        v_id := (p->>'cargo_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.dp_cargos WHERE id = v_id AND company_id = p_company) THEN
          RAISE EXCEPTION 'AJUSTE_INVALIDO: cargo de outra empresa.';
        END IF;
        v := v || jsonb_build_object('cargo_id', v_id);
      END IF;
    END IF;
    IF p ? 'setor_id' THEN
      IF jsonb_typeof(p->'setor_id') = 'null' THEN v := v || jsonb_build_object('setor_id', null);
      ELSE
        v_id := (p->>'setor_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.dp_setores WHERE id = v_id AND company_id = p_company) THEN
          RAISE EXCEPTION 'AJUSTE_INVALIDO: setor de outra empresa.';
        END IF;
        v := v || jsonb_build_object('setor_id', v_id);
      END IF;
    END IF;
    IF p ? 'dados' THEN
      IF jsonb_typeof(p->'dados') <> 'object' OR octet_length((p->'dados')::text) > 20000 THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: dados da ficha.';
      END IF;
      v := v || jsonb_build_object('dados', p->'dados');
    END IF;
  END IF;

  RETURN v;
END $function$;
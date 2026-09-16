-- ============ Pré-Admissão pelo Candidato ============

CREATE TABLE public.dp_preadmissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidato_nome text NOT NULL,
  whatsapp text NOT NULL,
  cargo_previsto_id uuid REFERENCES public.dp_cargos(id) ON DELETE SET NULL,
  unidade_prevista_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  trabalho_apos_22h boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aguardando_preenchimento',
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  cpf text,
  email text,
  data_nascimento date,
  estado_civil text,
  correcao_motivo text,
  enviado_em timestamptz,
  revisado_em timestamptz,
  revisado_por uuid,
  contabilidade_enviado_em timestamptz,
  contabilidade_retorno_em timestamptz,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_preadm_status_chk CHECK (status = ANY (ARRAY[
    'aguardando_preenchimento','em_preenchimento','aguardando_revisao','correcao_solicitada',
    'aguardando_nova_versao','pronto_contabilidade','enviado_contabilidade',
    'aguardando_retorno_contabilidade','registro_recebido','concluido','expirado','cancelado'])),
  CONSTRAINT dp_preadm_concluido_chk CHECK (status <> 'concluido' OR colaborador_id IS NOT NULL)
);
CREATE UNIQUE INDEX dp_preadm_colaborador_uk ON public.dp_preadmissoes (colaborador_id) WHERE colaborador_id IS NOT NULL;
CREATE INDEX dp_preadm_company_idx ON public.dp_preadmissoes (company_id, status);

CREATE TABLE public.dp_preadmissao_convites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preadmissao_id uuid NOT NULL REFERENCES public.dp_preadmissoes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_preadm_conv_pre_idx ON public.dp_preadmissao_convites (preadmissao_id);

CREATE TABLE public.dp_preadmissao_pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preadmissao_id uuid NOT NULL REFERENCES public.dp_preadmissoes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_nascimento date,
  parentesco text,
  cpf text,
  rg text,
  finalidade_dependente boolean NOT NULL DEFAULT false,
  finalidade_sesc boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_preadm_pessoa_finalidade_chk CHECK (finalidade_dependente OR finalidade_sesc)
);
CREATE INDEX dp_preadm_pessoa_pre_idx ON public.dp_preadmissao_pessoas (preadmissao_id);

CREATE TABLE public.dp_preadmissao_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preadmissao_id uuid NOT NULL REFERENCES public.dp_preadmissoes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pessoa_id uuid REFERENCES public.dp_preadmissao_pessoas(id) ON DELETE CASCADE,
  requisito_codigo text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size integer,
  status text NOT NULL DEFAULT 'enviado',
  motivo_recusa text,
  versao integer NOT NULL DEFAULT 1,
  substituido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_preadm_doc_status_chk CHECK (status = ANY (ARRAY['enviado','aprovado','recusado'])),
  CONSTRAINT dp_preadm_doc_size_chk CHECK (file_size IS NULL OR file_size <= 20971520)
);
CREATE INDEX dp_preadm_doc_pre_idx ON public.dp_preadmissao_documentos (preadmissao_id, requisito_codigo);
CREATE UNIQUE INDEX dp_preadm_doc_vigente_uk ON public.dp_preadmissao_documentos (preadmissao_id, requisito_codigo, COALESCE(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE substituido_em IS NULL;

CREATE TABLE public.dp_preadmissao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preadmissao_id uuid NOT NULL REFERENCES public.dp_preadmissoes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  evento text NOT NULL,
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_preadm_evt_pre_idx ON public.dp_preadmissao_eventos (preadmissao_id, created_at DESC);

-- Requisito documental ligado a Cargo e a Unidade (checklist por cargo/unidade)
CREATE TABLE public.dp_requisito_cargos (
  requisito_id uuid NOT NULL REFERENCES public.dp_documento_requisitos(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requisito_id, cargo_id)
);
CREATE TABLE public.dp_requisito_unidades (
  requisito_id uuid NOT NULL REFERENCES public.dp_documento_requisitos(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requisito_id, unidade_id)
);

-- Novas condições de aplicação (faixas usadas somente na pré-admissão)
ALTER TABLE public.dp_documento_requisitos DROP CONSTRAINT dp_doc_req_aplica_chk;
ALTER TABLE public.dp_documento_requisitos ADD CONSTRAINT dp_doc_req_aplica_chk CHECK (aplica_a = ANY (ARRAY[
  'todos','cargo_dirige','veiculo_proprio','veiculo_empresa','menor','regime_pj','regime_clt',
  'estado_civil_casado','exige_epi','dependente','dependente_ate_7','dependente_acima_7','dependente_invalido',
  'cargo','unidade','estado_civil_solteiro','dependente_ate_5','dependente_6_14','dependente_ate_14','sesc']));

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_preadmissoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_preadmissao_convites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_preadmissao_pessoas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_preadmissao_documentos TO authenticated;
GRANT SELECT ON public.dp_preadmissao_eventos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_requisito_cargos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_requisito_unidades TO authenticated;
GRANT ALL ON public.dp_preadmissoes TO service_role;
GRANT ALL ON public.dp_preadmissao_convites TO service_role;
GRANT ALL ON public.dp_preadmissao_pessoas TO service_role;
GRANT ALL ON public.dp_preadmissao_documentos TO service_role;
GRANT ALL ON public.dp_preadmissao_eventos TO service_role;
GRANT ALL ON public.dp_requisito_cargos TO service_role;
GRANT ALL ON public.dp_requisito_unidades TO service_role;

-- ============ RLS ============
ALTER TABLE public.dp_preadmissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_preadmissao_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_preadmissao_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_preadmissao_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_preadmissao_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_requisito_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_requisito_unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_preadm_admin_all ON public.dp_preadmissoes FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_preadm_conv_admin_all ON public.dp_preadmissao_convites FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_preadm_pessoa_admin_all ON public.dp_preadmissao_pessoas FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_preadm_doc_admin_all ON public.dp_preadmissao_documentos FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_preadm_evt_admin_read ON public.dp_preadmissao_eventos FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY dp_req_cargo_admin_all ON public.dp_requisito_cargos FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_req_unidade_admin_all ON public.dp_requisito_unidades FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

-- ============ Integridade multiempresa e updated_at ============
CREATE OR REPLACE FUNCTION public.dp_preadmissao_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cargo_previsto_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos c WHERE c.id = NEW.cargo_previsto_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Cargo previsto não pertence à empresa da pré-admissão.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.unidade_prevista_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u WHERE u.id = NEW.unidade_prevista_id AND u.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Unidade prevista não pertence à empresa da pré-admissão.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.colaborador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c WHERE c.id = NEW.colaborador_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Colaborador de outra empresa não pode ser vinculado.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_dp_preadmissao_guard BEFORE INSERT OR UPDATE ON public.dp_preadmissoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_preadmissao_guard();

CREATE TRIGGER trg_dp_preadm_conv_updated BEFORE UPDATE ON public.dp_preadmissao_convites
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
CREATE TRIGGER trg_dp_preadm_pessoa_updated BEFORE UPDATE ON public.dp_preadmissao_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
CREATE TRIGGER trg_dp_preadm_doc_updated BEFORE UPDATE ON public.dp_preadmissao_documentos
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- ============ Efetivação: só depois da ficha oficial, atômica e idempotente ============
CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar(p_preadmissao_id uuid, p_colaborador_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pa record;
  v_idade int;
  v_docs int := 0;
  p record;
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RAISE EXCEPTION 'Pré-admissão não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), pa.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta pré-admissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotência: segunda chamada devolve o mesmo resultado, sem duplicar.
  IF pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('colaborador_id', pa.colaborador_id, 'ja_aplicado', true, 'documentos', 0);
  END IF;

  IF pa.status NOT IN ('registro_recebido') THEN
    RAISE EXCEPTION 'A pré-admissão só é concluída depois de receber e conferir a ficha oficial da contabilidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = p_colaborador_id AND c.company_id = pa.company_id) THEN
    RAISE EXCEPTION 'Colaborador informado não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  -- Bloqueio trabalhista revalidado no servidor, sem exceção.
  IF pa.trabalho_apos_22h THEN
    IF pa.data_nascimento IS NULL THEN
      RAISE EXCEPTION 'Validação de idade pendente: informe a data de nascimento antes de concluir.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_idade := EXTRACT(YEAR FROM age(CURRENT_DATE, pa.data_nascimento))::int;
    IF v_idade < 18 THEN
      RAISE EXCEPTION 'Trabalho após as 22h não é permitido para menor de 18 anos (Art. 404 CLT / Art. 67 ECA).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Dependentes: uma pessoa por finalidade, sem duplicar quem já existe.
  FOR p IN SELECT * FROM public.dp_preadmissao_pessoas WHERE preadmissao_id = pa.id AND finalidade_dependente LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.dp_dependentes d
      WHERE d.colaborador_id = p_colaborador_id
        AND (d.cpf IS NOT NULL AND d.cpf = p.cpf OR (p.cpf IS NULL AND upper(d.nome) = upper(p.nome)))
    ) THEN
      INSERT INTO public.dp_dependentes (company_id, colaborador_id, nome, data_nascimento, parentesco, cpf)
      VALUES (pa.company_id, p_colaborador_id, upper(p.nome), p.data_nascimento, p.parentesco, p.cpf);
    END IF;
  END LOOP;

  -- Documentos: o arquivo NÃO é copiado; o registro passa a apontar para o colaborador.
  INSERT INTO public.dp_documentos (company_id, colaborador_id, tipo, titulo, descricao, file_path, file_name, file_size, mime_type, uploaded_by, aprovacao_status)
  SELECT pa.company_id, p_colaborador_id, 'outros_admissao'::dp_documento_tipo,
         upper(d.requisito_codigo), 'Documento enviado na pré-admissão.', d.file_path, d.file_name, d.file_size, d.mime_type, auth.uid(), 'aprovado'
  FROM public.dp_preadmissao_documentos d
  WHERE d.preadmissao_id = pa.id AND d.substituido_em IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.dp_documentos x WHERE x.file_path = d.file_path);
  GET DIAGNOSTICS v_docs = ROW_COUNT;

  UPDATE public.dp_preadmissoes
     SET colaborador_id = p_colaborador_id, status = 'concluido', updated_at = now()
   WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'concluida', jsonb_build_object('documentos', v_docs), auth.uid());

  RETURN jsonb_build_object('colaborador_id', p_colaborador_id, 'ja_aplicado', false, 'documentos', v_docs);
END;
$$;
REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid) TO authenticated;

-- ROLLBACK (revisável, não destrutivo de arquivos no Storage):
-- DROP FUNCTION IF EXISTS public.dp_preadmissao_efetivar(uuid, uuid);
-- DROP TRIGGER IF EXISTS trg_dp_preadmissao_guard ON public.dp_preadmissoes;
-- DROP FUNCTION IF EXISTS public.dp_preadmissao_guard();
-- DROP TABLE IF EXISTS public.dp_preadmissao_eventos, public.dp_preadmissao_documentos,
--   public.dp_preadmissao_pessoas, public.dp_preadmissao_convites, public.dp_preadmissoes;
-- DROP TABLE IF EXISTS public.dp_requisito_cargos, public.dp_requisito_unidades;
-- (restaurar dp_doc_req_aplica_chk com a lista anterior)
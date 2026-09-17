-- =====================================================================
-- Pré-Admissão — integridade composta, anti-cascata e bloqueio de DELETE
-- ROLLBACK (não destrutivo, apenas remove as travas adicionadas aqui;
-- nenhuma linha é apagada e nenhuma coluna é removida):
--   DROP TRIGGER IF EXISTS trg_dp_preadm_no_delete ON public.dp_preadmissoes;
--   DROP TRIGGER IF EXISTS trg_dp_preadm_pessoa_no_delete ON public.dp_preadmissao_pessoas;
--   DROP TRIGGER IF EXISTS trg_dp_preadm_doc_no_delete ON public.dp_preadmissao_documentos;
--   DROP TRIGGER IF EXISTS trg_dp_preadm_evt_no_delete ON public.dp_preadmissao_eventos;
--   ALTER TABLE public.dp_preadmissao_pessoas DROP CONSTRAINT dp_preadm_pessoa_pre_fk;
--   ALTER TABLE public.dp_preadmissao_documentos DROP CONSTRAINT dp_preadm_doc_pre_fk;
--   ALTER TABLE public.dp_preadmissao_documentos DROP CONSTRAINT dp_preadm_doc_pessoa_fk;
--   ALTER TABLE public.dp_preadmissao_eventos DROP CONSTRAINT dp_preadm_evt_pre_fk;
--   ALTER TABLE public.dp_preadmissao_convites DROP CONSTRAINT dp_preadm_conv_pre_fk;
--   ALTER TABLE public.dp_requisito_cargos DROP CONSTRAINT dp_req_cargo_req_fk, DROP CONSTRAINT dp_req_cargo_cargo_fk;
--   ALTER TABLE public.dp_requisito_unidades DROP CONSTRAINT dp_req_unid_req_fk, DROP CONSTRAINT dp_req_unid_unid_fk;
--   (as UNIQUE auxiliares uq_* podem permanecer sem efeito colateral)
-- =====================================================================

-- 1) Chaves auxiliares para permitir FK composta
ALTER TABLE public.dp_preadmissoes
  ADD CONSTRAINT uq_dp_preadmissoes_id_company UNIQUE (id, company_id);

ALTER TABLE public.dp_preadmissao_pessoas
  ADD CONSTRAINT uq_dp_preadm_pessoa_id_pre_company UNIQUE (id, preadmissao_id, company_id);

ALTER TABLE public.dp_documento_requisitos
  ADD CONSTRAINT uq_dp_doc_requisitos_id_company UNIQUE (id, company_id);

-- 2) Filhas: vínculo composto (ficha + empresa) e sem cascata de metadados
ALTER TABLE public.dp_preadmissao_pessoas
  DROP CONSTRAINT IF EXISTS dp_preadmissao_pessoas_preadmissao_id_fkey,
  ADD CONSTRAINT dp_preadm_pessoa_pre_fk
    FOREIGN KEY (preadmissao_id, company_id)
    REFERENCES public.dp_preadmissoes (id, company_id) ON DELETE RESTRICT;

ALTER TABLE public.dp_preadmissao_documentos
  DROP CONSTRAINT IF EXISTS dp_preadmissao_documentos_preadmissao_id_fkey,
  DROP CONSTRAINT IF EXISTS dp_preadmissao_documentos_pessoa_id_fkey,
  ADD CONSTRAINT dp_preadm_doc_pre_fk
    FOREIGN KEY (preadmissao_id, company_id)
    REFERENCES public.dp_preadmissoes (id, company_id) ON DELETE RESTRICT,
  ADD CONSTRAINT dp_preadm_doc_pessoa_fk
    FOREIGN KEY (pessoa_id, preadmissao_id, company_id)
    REFERENCES public.dp_preadmissao_pessoas (id, preadmissao_id, company_id) ON DELETE RESTRICT;

ALTER TABLE public.dp_preadmissao_eventos
  DROP CONSTRAINT IF EXISTS dp_preadmissao_eventos_preadmissao_id_fkey,
  ADD CONSTRAINT dp_preadm_evt_pre_fk
    FOREIGN KEY (preadmissao_id, company_id)
    REFERENCES public.dp_preadmissoes (id, company_id) ON DELETE RESTRICT;

ALTER TABLE public.dp_preadmissao_convites
  DROP CONSTRAINT IF EXISTS dp_preadmissao_convites_preadmissao_id_fkey,
  ADD CONSTRAINT dp_preadm_conv_pre_fk
    FOREIGN KEY (preadmissao_id, company_id)
    REFERENCES public.dp_preadmissoes (id, company_id) ON DELETE RESTRICT;

-- 3) Requisitos por Cargo/Unidade: integridade composta com a empresa
ALTER TABLE public.dp_requisito_cargos
  DROP CONSTRAINT IF EXISTS dp_requisito_cargos_requisito_id_fkey,
  DROP CONSTRAINT IF EXISTS dp_requisito_cargos_cargo_id_fkey,
  ADD CONSTRAINT dp_req_cargo_req_fk
    FOREIGN KEY (requisito_id, company_id)
    REFERENCES public.dp_documento_requisitos (id, company_id) ON DELETE CASCADE,
  ADD CONSTRAINT dp_req_cargo_cargo_fk
    FOREIGN KEY (cargo_id, company_id)
    REFERENCES public.dp_cargos (id, company_id) ON DELETE CASCADE;

ALTER TABLE public.dp_requisito_unidades
  DROP CONSTRAINT IF EXISTS dp_requisito_unidades_requisito_id_fkey,
  DROP CONSTRAINT IF EXISTS dp_requisito_unidades_unidade_id_fkey,
  ADD CONSTRAINT dp_req_unid_req_fk
    FOREIGN KEY (requisito_id, company_id)
    REFERENCES public.dp_documento_requisitos (id, company_id) ON DELETE CASCADE,
  ADD CONSTRAINT dp_req_unid_unid_fk
    FOREIGN KEY (unidade_id, company_id)
    REFERENCES public.dp_unidades (id, company_id) ON DELETE CASCADE;

-- 4) Bloqueio de exclusão acidental (soft-delete é o caminho canônico)
CREATE OR REPLACE FUNCTION public.dp_preadmissao_bloquear_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('dp.permitir_exclusao_preadmissao', true), 'off') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Registros de pré-admissão não podem ser apagados. Use remoção lógica (removido_em/substituido_em) ou cancele a pré-admissão.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_preadm_no_delete ON public.dp_preadmissoes;
CREATE TRIGGER trg_dp_preadm_no_delete BEFORE DELETE ON public.dp_preadmissoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_preadmissao_bloquear_delete();

DROP TRIGGER IF EXISTS trg_dp_preadm_pessoa_no_delete ON public.dp_preadmissao_pessoas;
CREATE TRIGGER trg_dp_preadm_pessoa_no_delete BEFORE DELETE ON public.dp_preadmissao_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.dp_preadmissao_bloquear_delete();

DROP TRIGGER IF EXISTS trg_dp_preadm_doc_no_delete ON public.dp_preadmissao_documentos;
CREATE TRIGGER trg_dp_preadm_doc_no_delete BEFORE DELETE ON public.dp_preadmissao_documentos
  FOR EACH ROW EXECUTE FUNCTION public.dp_preadmissao_bloquear_delete();

DROP TRIGGER IF EXISTS trg_dp_preadm_evt_no_delete ON public.dp_preadmissao_eventos;
CREATE TRIGGER trg_dp_preadm_evt_no_delete BEFORE DELETE ON public.dp_preadmissao_eventos
  FOR EACH ROW EXECUTE FUNCTION public.dp_preadmissao_bloquear_delete();

REVOKE ALL ON FUNCTION public.dp_preadmissao_bloquear_delete() FROM anon, authenticated;
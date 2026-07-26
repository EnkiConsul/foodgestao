-- ENUMS
CREATE TYPE public.dp_exame_tipo AS ENUM ('admissional','periodico','retorno_trabalho','mudanca_funcao','demissional');
CREATE TYPE public.dp_exame_resultado AS ENUM ('apto','apto_com_restricoes','inapto','pendente');
CREATE TYPE public.dp_treinamento_status AS ENUM ('planejado','em_andamento','concluido','cancelado');

-- 1. EXAMES ASO
CREATE TABLE public.dp_exames_aso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo public.dp_exame_tipo NOT NULL,
  data_realizado date,
  data_vencimento date,
  resultado public.dp_exame_resultado NOT NULL DEFAULT 'pendente',
  clinica text,
  medico text,
  restricoes text,
  observacao text,
  arquivo_path text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_exames_aso_company_idx ON public.dp_exames_aso (company_id, colaborador_id);
CREATE INDEX dp_exames_aso_venc_idx ON public.dp_exames_aso (company_id, data_vencimento);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_exames_aso TO authenticated;
GRANT ALL ON public.dp_exames_aso TO service_role;
ALTER TABLE public.dp_exames_aso ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_exames_aso_admin_write ON public.dp_exames_aso FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY dp_exames_aso_self_read ON public.dp_exames_aso FOR SELECT TO authenticated
  USING (dp_colaborador_of(auth.uid()) IS NOT NULL AND colaborador_id = dp_colaborador_of(auth.uid()));
CREATE TRIGGER trg_dp_exames_aso_updated BEFORE UPDATE ON public.dp_exames_aso
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- 2. CATÁLOGO DE EPIs
CREATE TABLE public.dp_epis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ca text,
  validade_dias smallint,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_epis_company_idx ON public.dp_epis (company_id, ativo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_epis TO authenticated;
GRANT ALL ON public.dp_epis TO service_role;
ALTER TABLE public.dp_epis ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_epis_admin_write ON public.dp_epis FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER trg_dp_epis_updated BEFORE UPDATE ON public.dp_epis
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- 3. ENTREGAS DE EPI
CREATE TABLE public.dp_epis_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  epi_id uuid NOT NULL REFERENCES public.dp_epis(id) ON DELETE RESTRICT,
  quantidade smallint NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  data_entrega date NOT NULL DEFAULT CURRENT_DATE,
  data_troca_prevista date,
  data_devolucao date,
  recebido_em timestamptz,
  observacao text,
  arquivo_path text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_epis_entregas_company_idx ON public.dp_epis_entregas (company_id, colaborador_id);
CREATE INDEX dp_epis_entregas_troca_idx ON public.dp_epis_entregas (company_id, data_troca_prevista);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_epis_entregas TO authenticated;
GRANT ALL ON public.dp_epis_entregas TO service_role;
ALTER TABLE public.dp_epis_entregas ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_epis_entregas_admin_write ON public.dp_epis_entregas FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY dp_epis_entregas_self_read ON public.dp_epis_entregas FOR SELECT TO authenticated
  USING (dp_colaborador_of(auth.uid()) IS NOT NULL AND colaborador_id = dp_colaborador_of(auth.uid()));
CREATE TRIGGER trg_dp_epis_entregas_updated BEFORE UPDATE ON public.dp_epis_entregas
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- 4. CATÁLOGO DE TREINAMENTOS
CREATE TABLE public.dp_treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  carga_horaria numeric(6,2),
  validade_meses smallint,
  obrigatorio boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_treinamentos_company_idx ON public.dp_treinamentos (company_id, ativo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_treinamentos TO authenticated;
GRANT ALL ON public.dp_treinamentos TO service_role;
ALTER TABLE public.dp_treinamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_treinamentos_admin_write ON public.dp_treinamentos FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER trg_dp_treinamentos_updated BEFORE UPDATE ON public.dp_treinamentos
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- 5. PARTICIPAÇÕES EM TREINAMENTO
CREATE TABLE public.dp_treinamentos_participacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  treinamento_id uuid NOT NULL REFERENCES public.dp_treinamentos(id) ON DELETE CASCADE,
  status public.dp_treinamento_status NOT NULL DEFAULT 'planejado',
  data_conclusao date,
  data_vencimento date,
  nota numeric(5,2),
  certificado_path text,
  observacao text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_treinamentos_part_company_idx ON public.dp_treinamentos_participacoes (company_id, colaborador_id);
CREATE INDEX dp_treinamentos_part_venc_idx ON public.dp_treinamentos_participacoes (company_id, data_vencimento);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_treinamentos_participacoes TO authenticated;
GRANT ALL ON public.dp_treinamentos_participacoes TO service_role;
ALTER TABLE public.dp_treinamentos_participacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_treinamentos_part_admin_write ON public.dp_treinamentos_participacoes FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY dp_treinamentos_part_self_read ON public.dp_treinamentos_participacoes FOR SELECT TO authenticated
  USING (dp_colaborador_of(auth.uid()) IS NOT NULL AND colaborador_id = dp_colaborador_of(auth.uid()));
CREATE TRIGGER trg_dp_treinamentos_part_updated BEFORE UPDATE ON public.dp_treinamentos_participacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- 6. Preenchimento automático de vencimentos
CREATE OR REPLACE FUNCTION public.dp_conformidade_autofill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_dias smallint;
  v_meses smallint;
BEGIN
  IF TG_TABLE_NAME = 'dp_epis_entregas' THEN
    IF NEW.data_troca_prevista IS NULL AND NEW.data_entrega IS NOT NULL THEN
      SELECT validade_dias INTO v_dias FROM public.dp_epis WHERE id = NEW.epi_id;
      IF v_dias IS NOT NULL AND v_dias > 0 THEN
        NEW.data_troca_prevista := NEW.data_entrega + (v_dias || ' days')::interval;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_treinamentos_participacoes' THEN
    IF NEW.data_vencimento IS NULL AND NEW.data_conclusao IS NOT NULL THEN
      SELECT validade_meses INTO v_meses FROM public.dp_treinamentos WHERE id = NEW.treinamento_id;
      IF v_meses IS NOT NULL AND v_meses > 0 THEN
        NEW.data_vencimento := NEW.data_conclusao + (v_meses || ' months')::interval;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_epis_entregas_autofill BEFORE INSERT OR UPDATE ON public.dp_epis_entregas
  FOR EACH ROW EXECUTE FUNCTION public.dp_conformidade_autofill();
CREATE TRIGGER trg_dp_treinamentos_part_autofill BEFORE INSERT OR UPDATE ON public.dp_treinamentos_participacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_conformidade_autofill();

-- 7. Prazos de alerta configuráveis
ALTER TABLE public.dp_pendencias_config
  ADD COLUMN IF NOT EXISTS alerta_aso_dias smallint NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS alerta_epi_dias smallint NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS alerta_treinamento_dias smallint NOT NULL DEFAULT 30;
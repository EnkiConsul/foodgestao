CREATE TABLE public.dp_intermitente_competencia_confirmacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  trabalhou BOOLEAN NOT NULL,
  respondido_por UUID,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (company_id, colaborador_id, competencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_intermitente_competencia_confirmacoes TO authenticated;
GRANT ALL ON public.dp_intermitente_competencia_confirmacoes TO service_role;
ALTER TABLE public.dp_intermitente_competencia_confirmacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_icc_admin_all" ON public.dp_intermitente_competencia_confirmacoes
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE TABLE public.dp_adiantamento_solicitacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ativar','cancelar')),
  data_solicitacao DATE NOT NULL,
  competencia_efeito TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'gestor' CHECK (origem IN ('gestor','portal')),
  observacao TEXT,
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_dp_ads_colab ON public.dp_adiantamento_solicitacoes (colaborador_id, competencia_efeito);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_adiantamento_solicitacoes TO authenticated;
GRANT ALL ON public.dp_adiantamento_solicitacoes TO service_role;
ALTER TABLE public.dp_adiantamento_solicitacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_ads_admin_all" ON public.dp_adiantamento_solicitacoes
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
CREATE POLICY "dp_ads_read_self" ON public.dp_adiantamento_solicitacoes
  FOR SELECT TO authenticated
  USING ((public.dp_colaborador_ativo_of((SELECT auth.uid())) IS NOT NULL)
     AND (colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))));
CREATE POLICY "dp_ads_insert_self" ON public.dp_adiantamento_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (origem = 'portal'
     AND (public.dp_colaborador_ativo_of((SELECT auth.uid())) IS NOT NULL)
     AND (colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))));

CREATE OR REPLACE FUNCTION public.dp_adiantamento_solicitacao_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_pagamento INT;
  v_ref DATE;
BEGIN
  IF NEW.origem = 'portal' THEN
    IF NEW.data_solicitacao < CURRENT_DATE THEN
      RAISE EXCEPTION 'No portal, a data da solicitacao nao pode ser retroativa.';
    END IF;
    SELECT u.dia_adiantamento INTO v_dia_pagamento
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
    WHERE c.id = NEW.colaborador_id;
    v_ref := date_trunc('month', NEW.data_solicitacao)::date + (COALESCE(v_dia_pagamento, 15) - 1);
    IF NEW.data_solicitacao >= v_ref - 4 AND NEW.data_solicitacao <= v_ref THEN
      RAISE EXCEPTION 'No portal, a solicitacao precisa de pelo menos 5 dias de antecedencia ao pagamento.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_adiantamento_solicitacao_guard
  BEFORE INSERT OR UPDATE ON public.dp_adiantamento_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_adiantamento_solicitacao_guard();

CREATE OR REPLACE FUNCTION public.dp_adiantamento_sync_optante()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colaborador UUID;
  v_ultima TEXT;
BEGIN
  v_colaborador := COALESCE(NEW.colaborador_id, OLD.colaborador_id);
  SELECT s.tipo INTO v_ultima
  FROM public.dp_adiantamento_solicitacoes s
  WHERE s.colaborador_id = v_colaborador
  ORDER BY s.competencia_efeito DESC, s.created_at DESC
  LIMIT 1;
  UPDATE public.dp_colaboradores
  SET optante_adiantamento = (v_ultima = 'ativar')
  WHERE id = v_colaborador;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_dp_adiantamento_sync_optante
  AFTER INSERT OR UPDATE OR DELETE ON public.dp_adiantamento_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_adiantamento_sync_optante();

INSERT INTO public.dp_adiantamento_solicitacoes (company_id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao)
SELECT c.company_id, c.id, 'ativar', COALESCE(c.data_admissao, CURRENT_DATE), to_char(COALESCE(c.data_admissao, CURRENT_DATE), 'YYYY-MM'), 'gestor', 'Migrado do cadastro (optante ja marcado)'
FROM public.dp_colaboradores c
WHERE c.optante_adiantamento = true;

CREATE TABLE public.dp_pendencias_decisoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pendencia_id TEXT NOT NULL,
  tipo TEXT,
  colaborador_id UUID,
  competencia TEXT,
  acao TEXT NOT NULL CHECK (acao IN ('ignorar','adiar')),
  justificativa TEXT,
  adiada_ate TIMESTAMP WITH TIME ZONE,
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (company_id, pendencia_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_pendencias_decisoes TO authenticated;
GRANT ALL ON public.dp_pendencias_decisoes TO service_role;
ALTER TABLE public.dp_pendencias_decisoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_pd_admin_all" ON public.dp_pendencias_decisoes
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE TRIGGER trg_dp_icc_updated_at BEFORE UPDATE ON public.dp_intermitente_competencia_confirmacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dp_ads_updated_at BEFORE UPDATE ON public.dp_adiantamento_solicitacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dp_pd_updated_at BEFORE UPDATE ON public.dp_pendencias_decisoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
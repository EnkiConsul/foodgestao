-- M6 (Convocações 3A.1) — Indisponibilidades, descumprimentos e eventos.
-- Rollback: DROP TABLE public.dp_convocacao_eventos, public.dp_convocacao_descumprimentos, public.dp_indisponibilidades;
--           DROP FUNCTION public.dp_indisp_deriva_company(), public.dp_conv_descump_deriva(), public.dp_conv_evento_deriva();

-- ============ 7. dp_indisponibilidades ============
CREATE TABLE public.dp_indisponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  colaborador_id uuid NOT NULL,
  data date NOT NULL,
  motivo text NULL,
  origem text NOT NULL DEFAULT 'colaborador' CHECK (origem IN ('colaborador','gestor','sistema')),
  criado_por uuid NULL,
  cancelada_em timestamptz NULL,
  cancelada_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dp_indisponibilidades_id_company UNIQUE (id, company_id),
  CONSTRAINT fk_dp_indisp_colaborador_company
    FOREIGN KEY (colaborador_id, company_id)
    REFERENCES public.dp_colaboradores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT dp_indisp_cancelamento_coerente_check
    CHECK (cancelada_por IS NULL OR cancelada_em IS NOT NULL)
);

CREATE UNIQUE INDEX uq_dp_indisponibilidades_ativa
  ON public.dp_indisponibilidades (colaborador_id, data) WHERE cancelada_em IS NULL;
CREATE INDEX idx_dp_indisponibilidades_company_data
  ON public.dp_indisponibilidades (company_id, data);

-- company_id derivado do vínculo real (valor divergente é sobrescrito, não aceito)
CREATE OR REPLACE FUNCTION public.dp_indisp_deriva_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'COLABORADOR_INEXISTENTE';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_indisp_deriva_company() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_dp_indisp_deriva_company
  BEFORE INSERT OR UPDATE ON public.dp_indisponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.dp_indisp_deriva_company();

CREATE TRIGGER trg_dp_indisponibilidades_updated_at
  BEFORE UPDATE ON public.dp_indisponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dp_indisponibilidades ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dp_indisponibilidades TO authenticated;
GRANT ALL ON public.dp_indisponibilidades TO service_role;

CREATE POLICY dp_indisp_select_admin ON public.dp_indisponibilidades
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_indisp_select_propria ON public.dp_indisponibilidades
  FOR SELECT TO authenticated
  USING (colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid())));

-- ============ 8. dp_convocacao_descumprimentos ============
CREATE TABLE public.dp_convocacao_descumprimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  convocacao_id uuid NOT NULL,
  ocorrencia_id uuid NULL REFERENCES public.dp_convocacao_ocorrencias(id) ON DELETE RESTRICT,
  colaborador_id uuid NOT NULL,
  regime_snapshot public.dp_regime_trabalho NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('desistencia_apos_aceite','ausencia_no_dia','cancelamento_empregador_apos_aceite')),
  parte_responsavel text NOT NULL CHECK (parte_responsavel IN ('colaborador','empregador')),
  motivo_informado text NULL,
  analise text NOT NULL DEFAULT 'pendente' CHECK (analise IN ('pendente','justificado','sem_justo_motivo')),
  analisado_por uuid NULL,
  analisado_em timestamptz NULL,
  observacao_analise text NULL,
  base_remuneracao numeric NULL,
  percentual_referencia numeric NULL,
  valor_referencia numeric NULL,
  prazo_limite date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dp_conv_descump_convocacao_tipo UNIQUE (convocacao_id, tipo),
  CONSTRAINT uq_dp_conv_descump_id_company UNIQUE (id, company_id),
  CONSTRAINT fk_dp_conv_descump_convocacao_company
    FOREIGN KEY (convocacao_id, company_id)
    REFERENCES public.dp_convocacoes(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_descump_colaborador_company
    FOREIGN KEY (colaborador_id, company_id)
    REFERENCES public.dp_colaboradores(id, company_id) ON DELETE RESTRICT,
  -- tipo x parte responsável
  CONSTRAINT dp_conv_descump_tipo_parte_check CHECK (
    (tipo IN ('desistencia_apos_aceite','ausencia_no_dia') AND parte_responsavel = 'colaborador')
    OR (tipo = 'cancelamento_empregador_apos_aceite' AND parte_responsavel = 'empregador')
  ),
  -- referência de 50%: só intermitente, só sem justo motivo, só parte colaborador. Pontos percentuais.
  CONSTRAINT dp_conv_descump_percentual_regime_check
    CHECK (percentual_referencia IS NULL OR (regime_snapshot = 'intermitente' AND parte_responsavel = 'colaborador')),
  CONSTRAINT dp_conv_descump_percentual_faixa_check
    CHECK (percentual_referencia IS NULL OR (percentual_referencia >= 0 AND percentual_referencia <= 100)),
  CONSTRAINT dp_conv_descump_percentual_analise_check
    CHECK (percentual_referencia IS NULL OR analise = 'sem_justo_motivo'),
  CONSTRAINT dp_conv_descump_valor_analise_check
    CHECK (valor_referencia IS NULL OR analise = 'sem_justo_motivo'),
  CONSTRAINT dp_conv_descump_valor_base_check
    CHECK (valor_referencia IS NULL OR (base_remuneracao IS NOT NULL AND percentual_referencia IS NOT NULL)),
  CONSTRAINT dp_conv_descump_valor_positivo_check
    CHECK (valor_referencia IS NULL OR valor_referencia >= 0),
  CONSTRAINT dp_conv_descump_base_positiva_check
    CHECK (base_remuneracao IS NULL OR base_remuneracao >= 0),
  CONSTRAINT dp_conv_descump_analise_coerente_check
    CHECK ((analisado_por IS NULL AND analisado_em IS NULL) OR analise <> 'pendente')
);

COMMENT ON TABLE public.dp_convocacao_descumprimentos IS 'Histórico/análise apenas. Nenhum desconto, multa, folha ou lançamento financeiro automático. base_remuneracao/percentual_referencia/valor_referencia são referência para decisão humana.';
COMMENT ON COLUMN public.dp_convocacao_descumprimentos.regime_snapshot IS 'Derivado de dp_convocacoes.regime_snapshot (oferta), nunca do cadastro atual. Ausente na oferta = fail closed.';

CREATE INDEX idx_dp_conv_descump_company_colab
  ON public.dp_convocacao_descumprimentos (company_id, colaborador_id, created_at DESC);

-- company_id, ocorrencia_id, colaborador_id e regime_snapshot derivados da convocação
CREATE OR REPLACE FUNCTION public.dp_conv_descump_deriva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conv record;
BEGIN
  SELECT company_id, colaborador_id, ocorrencia_id, regime_snapshot
    INTO v_conv FROM public.dp_convocacoes WHERE id = NEW.convocacao_id;
  IF v_conv IS NULL THEN
    RAISE EXCEPTION 'CONVOCACAO_INEXISTENTE';
  END IF;
  IF v_conv.regime_snapshot IS NULL THEN
    RAISE EXCEPTION 'REGIME_SNAPSHOT_AUSENTE_NA_OFERTA';
  END IF;
  NEW.company_id := v_conv.company_id;
  NEW.colaborador_id := v_conv.colaborador_id;
  NEW.ocorrencia_id := v_conv.ocorrencia_id;
  NEW.regime_snapshot := v_conv.regime_snapshot;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_conv_descump_deriva() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_dp_conv_descump_deriva
  BEFORE INSERT OR UPDATE ON public.dp_convocacao_descumprimentos
  FOR EACH ROW EXECUTE FUNCTION public.dp_conv_descump_deriva();

CREATE TRIGGER trg_dp_conv_descump_updated_at
  BEFORE UPDATE ON public.dp_convocacao_descumprimentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dp_convocacao_descumprimentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dp_convocacao_descumprimentos TO authenticated;
GRANT ALL ON public.dp_convocacao_descumprimentos TO service_role;

CREATE POLICY dp_conv_descump_select_admin ON public.dp_convocacao_descumprimentos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_conv_descump_select_proprio ON public.dp_convocacao_descumprimentos
  FOR SELECT TO authenticated
  USING (colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid())));

-- ============ 9. dp_convocacao_eventos (append-only) ============
CREATE TABLE public.dp_convocacao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  grupo_id uuid NULL,
  ocorrencia_id uuid NULL,
  convocacao_id uuid NULL,
  tipo text NOT NULL,
  de_status text NULL,
  para_status text NULL,
  ator_user_id uuid NULL,
  ator_papel text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_conv_evento_referencia_check
    CHECK (grupo_id IS NOT NULL OR ocorrencia_id IS NOT NULL OR convocacao_id IS NOT NULL),
  CONSTRAINT fk_dp_conv_evento_grupo_company
    FOREIGN KEY (grupo_id, company_id)
    REFERENCES public.dp_convocacao_grupos(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_evento_ocorrencia_company
    FOREIGN KEY (ocorrencia_id, company_id)
    REFERENCES public.dp_convocacao_ocorrencias(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_evento_convocacao_company
    FOREIGN KEY (convocacao_id, company_id)
    REFERENCES public.dp_convocacoes(id, company_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.dp_convocacao_eventos IS 'Append-only: sem UPDATE/DELETE (nem por RPC). company_id derivado da entidade principal (convocação > ocorrência > grupo).';

CREATE INDEX idx_dp_conv_eventos_company_created ON public.dp_convocacao_eventos (company_id, created_at DESC);
CREATE INDEX idx_dp_conv_eventos_convocacao ON public.dp_convocacao_eventos (convocacao_id);
CREATE INDEX idx_dp_conv_eventos_ocorrencia ON public.dp_convocacao_eventos (ocorrencia_id);
CREATE INDEX idx_dp_conv_eventos_grupo ON public.dp_convocacao_eventos (grupo_id);

CREATE OR REPLACE FUNCTION public.dp_conv_evento_deriva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_conv record;
  v_ocor record;
BEGIN
  IF NEW.convocacao_id IS NOT NULL THEN
    SELECT company_id, ocorrencia_id INTO v_conv FROM public.dp_convocacoes WHERE id = NEW.convocacao_id;
    IF v_conv IS NULL THEN RAISE EXCEPTION 'CONVOCACAO_INEXISTENTE'; END IF;
    v_company := v_conv.company_id;
  ELSIF NEW.ocorrencia_id IS NOT NULL THEN
    SELECT company_id, grupo_id INTO v_ocor FROM public.dp_convocacao_ocorrencias WHERE id = NEW.ocorrencia_id;
    IF v_ocor IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_INEXISTENTE'; END IF;
    v_company := v_ocor.company_id;
  ELSE
    SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = NEW.grupo_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'GRUPO_INEXISTENTE'; END IF;
  END IF;

  NEW.company_id := v_company;

  -- coerência entre referências informadas
  IF NEW.convocacao_id IS NOT NULL AND NEW.ocorrencia_id IS NOT NULL
     AND v_conv.ocorrencia_id IS DISTINCT FROM NEW.ocorrencia_id THEN
    RAISE EXCEPTION 'EVENTO_OCORRENCIA_INCOERENTE';
  END IF;

  IF NEW.ocorrencia_id IS NULL AND NEW.convocacao_id IS NOT NULL THEN
    NEW.ocorrencia_id := v_conv.ocorrencia_id;
  END IF;

  IF NEW.ocorrencia_id IS NOT NULL THEN
    SELECT company_id, grupo_id INTO v_ocor FROM public.dp_convocacao_ocorrencias WHERE id = NEW.ocorrencia_id;
    IF NEW.grupo_id IS NOT NULL AND v_ocor.grupo_id IS DISTINCT FROM NEW.grupo_id THEN
      RAISE EXCEPTION 'EVENTO_GRUPO_INCOERENTE';
    END IF;
    IF NEW.grupo_id IS NULL THEN
      NEW.grupo_id := v_ocor.grupo_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_conv_evento_deriva() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_dp_conv_evento_deriva
  BEFORE INSERT ON public.dp_convocacao_eventos
  FOR EACH ROW EXECUTE FUNCTION public.dp_conv_evento_deriva();

ALTER TABLE public.dp_convocacao_eventos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dp_convocacao_eventos TO authenticated;
GRANT ALL ON public.dp_convocacao_eventos TO service_role;

CREATE POLICY dp_conv_eventos_select_admin ON public.dp_convocacao_eventos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
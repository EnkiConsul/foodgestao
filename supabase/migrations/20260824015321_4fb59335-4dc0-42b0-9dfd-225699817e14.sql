-- M7 (Convocações 3A.1) — Configuração resolvível + flags aditivas.
-- Rollback: DROP FUNCTION public.dp_convocacao_config_resolvida(uuid,uuid);
--           DROP TABLE public.dp_convocacao_config; DROP FUNCTION public.dp_conv_config_integridade();
--           ALTER TABLE public.dp_config_dp DROP COLUMN considerar_indisponibilidade_cobertura;
--           ALTER TABLE public.dp_colaborador_config_trabalho DROP COLUMN compoe_equipe_habitual;

CREATE TABLE public.dp_convocacao_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  unidade_id uuid NULL,
  antecedencia_minima_dias integer NOT NULL DEFAULT 3 CHECK (antecedencia_minima_dias >= 0),
  prazo_resposta_dias_uteis integer NOT NULL DEFAULT 1 CHECK (prazo_resposta_dias_uteis > 0),
  aprovacao_modo text NOT NULL DEFAULT 'somente_excecoes'
    CHECK (aprovacao_modo IN ('sempre_gestor','somente_excecoes','automatica')),
  sub_intermitente_por_intermitente boolean NOT NULL DEFAULT true,
  sub_intermitente_por_freelancer boolean NOT NULL DEFAULT true,
  sub_freelancer_por_intermitente boolean NOT NULL DEFAULT true,
  sub_freelancer_por_freelancer boolean NOT NULL DEFAULT true,
  sub_fixo_em_folga_dominical boolean NOT NULL DEFAULT false,
  reabre_vaga_em_desistencia boolean NOT NULL DEFAULT true,
  autonomia_colaborador_desistir boolean NOT NULL DEFAULT true,
  permite_oferta_aberta boolean NOT NULL DEFAULT true,
  exige_justificativa_excecao boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dp_conv_config_escopo UNIQUE NULLS NOT DISTINCT (company_id, unidade_id),
  CONSTRAINT fk_dp_conv_config_unidade_company
    FOREIGN KEY (unidade_id, company_id)
    REFERENCES public.dp_unidades(id, company_id) ON DELETE RESTRICT
);

COMMENT ON COLUMN public.dp_convocacao_config.antecedencia_minima_dias IS 'Somente alerta + exceção auditada. Nunca bloqueia publicação (invariante: não existe hard block por antecedência).';
COMMENT ON COLUMN public.dp_convocacao_config.sub_fixo_em_folga_dominical IS 'Apenas permite o fluxo. O consentimento do trabalhador fixo é invariante e não é configurável.';

CREATE INDEX idx_dp_conv_config_company ON public.dp_convocacao_config (company_id);

CREATE TRIGGER trg_dp_conv_config_updated_at
  BEFORE UPDATE ON public.dp_convocacao_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dp_convocacao_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dp_convocacao_config TO authenticated;
GRANT ALL ON public.dp_convocacao_config TO service_role;

CREATE POLICY dp_conv_config_select_admin ON public.dp_convocacao_config
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

-- Resolução: unidade → empresa → defaults do sistema
CREATE OR REPLACE FUNCTION public.dp_convocacao_config_resolvida(_company_id uuid, _unidade_id uuid DEFAULT NULL)
RETURNS public.dp_convocacao_config
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cfg public.dp_convocacao_config;
BEGIN
  IF _unidade_id IS NOT NULL THEN
    SELECT * INTO v_cfg FROM public.dp_convocacao_config
      WHERE company_id = _company_id AND unidade_id = _unidade_id;
    IF FOUND THEN RETURN v_cfg; END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.dp_convocacao_config
    WHERE company_id = _company_id AND unidade_id IS NULL;
  IF FOUND THEN RETURN v_cfg; END IF;

  -- defaults do sistema (nada persistido)
  v_cfg.id := NULL;
  v_cfg.company_id := _company_id;
  v_cfg.unidade_id := _unidade_id;
  v_cfg.antecedencia_minima_dias := 3;
  v_cfg.prazo_resposta_dias_uteis := 1;
  v_cfg.aprovacao_modo := 'somente_excecoes';
  v_cfg.sub_intermitente_por_intermitente := true;
  v_cfg.sub_intermitente_por_freelancer := true;
  v_cfg.sub_freelancer_por_intermitente := true;
  v_cfg.sub_freelancer_por_freelancer := true;
  v_cfg.sub_fixo_em_folga_dominical := false;
  v_cfg.reabre_vaga_em_desistencia := true;
  v_cfg.autonomia_colaborador_desistir := true;
  v_cfg.permite_oferta_aberta := true;
  v_cfg.exige_justificativa_excecao := true;
  RETURN v_cfg;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_config_resolvida(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_config_resolvida(uuid, uuid) TO authenticated;

-- Flags aditivas
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS considerar_indisponibilidade_cobertura boolean NOT NULL DEFAULT true;

ALTER TABLE public.dp_colaborador_config_trabalho
  ADD COLUMN IF NOT EXISTS compoe_equipe_habitual boolean NOT NULL DEFAULT true;
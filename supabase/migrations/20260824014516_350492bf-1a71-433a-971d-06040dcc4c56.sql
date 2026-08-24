-- M4 (Convocações 3A.1) — dp_convocacao_ocorrencias. Necessidade separada do horário ofertado. Escrita RPC-only.
-- Rollback (sem dados): DROP TABLE public.dp_convocacao_ocorrencias;

CREATE TABLE public.dp_convocacao_ocorrencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  grupo_id uuid NOT NULL,
  unidade_id uuid NOT NULL,
  cargo_id uuid NOT NULL,
  data date NOT NULL,

  -- A) janela da necessidade
  necessidade_entrada time NOT NULL,
  necessidade_saida time NOT NULL,
  necessidade_termina_no_dia_seguinte boolean NOT NULL DEFAULT false,
  turno_referencia_id uuid NULL,

  -- B) horário ofertado
  horario_modo text NOT NULL,
  entrada time NULL,
  saida time NULL,
  intervalo_minutos integer NULL,
  termina_no_dia_seguinte boolean NULL,
  carga_prevista_horas numeric NULL,

  vagas integer NOT NULL DEFAULT 1,
  versao integer NOT NULL DEFAULT 1,
  substitui_ocorrencia_id uuid NULL,

  antecedencia_dias integer NULL,
  fora_antecedencia boolean NOT NULL DEFAULT false,
  confirmado_fora_prazo_por uuid NULL,
  confirmado_fora_prazo_em timestamptz NULL,
  justificativa_fora_prazo text NULL,

  condicoes_comuns jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'rascunho',
  publicada_em timestamptz NULL,
  criado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_dp_conv_ocor_id_company UNIQUE (id, company_id),
  CONSTRAINT uq_dp_conv_ocor_id_company_unidade_data UNIQUE (id, company_id, unidade_id, data),

  CONSTRAINT dp_conv_ocor_status_check CHECK (status IN (
    'rascunho','publicada','preenchida','encerrada_operacionalmente','apurada','revisada','cancelada')),
  CONSTRAINT dp_conv_ocor_horario_modo_check CHECK (horario_modo IN ('horario_unico','jornada_individual')),
  CONSTRAINT dp_conv_ocor_vagas_check CHECK (vagas > 0),
  CONSTRAINT dp_conv_ocor_versao_check CHECK (versao >= 1),
  CONSTRAINT dp_conv_ocor_antecedencia_check CHECK (antecedencia_dias IS NULL OR antecedencia_dias >= 0),
  CONSTRAINT dp_conv_ocor_intervalo_check CHECK (intervalo_minutos IS NULL OR intervalo_minutos >= 0),
  CONSTRAINT dp_conv_ocor_carga_check CHECK (carga_prevista_horas IS NULL OR carga_prevista_horas > 0),
  CONSTRAINT dp_conv_ocor_horario_coerente_check CHECK (
    (horario_modo = 'horario_unico'
      AND entrada IS NOT NULL AND saida IS NOT NULL
      AND intervalo_minutos IS NOT NULL AND termina_no_dia_seguinte IS NOT NULL
      AND carga_prevista_horas IS NOT NULL)
    OR
    (horario_modo = 'jornada_individual'
      AND entrada IS NULL AND saida IS NULL
      AND intervalo_minutos IS NULL AND termina_no_dia_seguinte IS NULL
      AND carga_prevista_horas IS NULL)
  ),
  CONSTRAINT dp_conv_ocor_nao_substitui_a_si CHECK (substitui_ocorrencia_id IS DISTINCT FROM id),

  CONSTRAINT fk_dp_conv_ocor_company FOREIGN KEY (company_id)
    REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_ocor_grupo_company FOREIGN KEY (grupo_id, company_id)
    REFERENCES public.dp_convocacao_grupos(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_ocor_unidade_company FOREIGN KEY (unidade_id, company_id)
    REFERENCES public.dp_unidades(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_ocor_cargo_company FOREIGN KEY (cargo_id, company_id)
    REFERENCES public.dp_cargos(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_ocor_turno_company FOREIGN KEY (turno_referencia_id, company_id)
    REFERENCES public.dp_turnos(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dp_conv_ocor_substitui_company FOREIGN KEY (substitui_ocorrencia_id, company_id)
    REFERENCES public.dp_convocacao_ocorrencias(id, company_id) ON DELETE RESTRICT
);

-- Uma única versão operacionalmente vigente por necessidade (janela inclui a virada de dia)
CREATE UNIQUE INDEX uq_dp_conv_ocor_necessidade_vigente
  ON public.dp_convocacao_ocorrencias
     (company_id, unidade_id, data, cargo_id, necessidade_entrada, necessidade_saida,
      necessidade_termina_no_dia_seguinte)
  WHERE status NOT IN ('revisada','cancelada');

-- No máximo uma sucessora direta por ocorrência
CREATE UNIQUE INDEX uq_dp_conv_ocor_sucessor_unico
  ON public.dp_convocacao_ocorrencias (substitui_ocorrencia_id)
  WHERE substitui_ocorrencia_id IS NOT NULL;

CREATE INDEX idx_dp_conv_ocor_grupo ON public.dp_convocacao_ocorrencias (grupo_id);
CREATE INDEX idx_dp_conv_ocor_comp_data ON public.dp_convocacao_ocorrencias (company_id, data);
CREATE INDEX idx_dp_conv_ocor_cargo ON public.dp_convocacao_ocorrencias (cargo_id);

COMMENT ON TABLE public.dp_convocacao_ocorrencias IS 'Necessidade de um dia (grupo -> ocorrência -> oferta). Escrita apenas por RPC SECURITY DEFINER. Preenchimento é atualizado transacionalmente pela RPC de aceite (3B), não por trigger de contagem.';

-- Trigger de integridade: unidade do grupo e escopo do turno (o que a composite FK não cobre)
CREATE OR REPLACE FUNCTION public.dp_conv_ocor_integridade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo_unidade uuid;
  v_turno_unidade uuid;
BEGIN
  SELECT unidade_id INTO v_grupo_unidade
  FROM public.dp_convocacao_grupos WHERE id = NEW.grupo_id;

  IF v_grupo_unidade IS DISTINCT FROM NEW.unidade_id THEN
    RAISE EXCEPTION 'CONTEXTO_INVALIDO: unidade da ocorrência difere da unidade do grupo';
  END IF;

  IF NEW.turno_referencia_id IS NOT NULL THEN
    SELECT unidade_id INTO v_turno_unidade
    FROM public.dp_turnos WHERE id = NEW.turno_referencia_id;
    IF v_turno_unidade IS NOT NULL AND v_turno_unidade IS DISTINCT FROM NEW.unidade_id THEN
      RAISE EXCEPTION 'CONTEXTO_INVALIDO: turno de referência pertence a outra unidade';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_conv_ocor_integridade
  BEFORE INSERT OR UPDATE OF grupo_id, unidade_id, turno_referencia_id
  ON public.dp_convocacao_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.dp_conv_ocor_integridade();

CREATE TRIGGER trg_dp_conv_ocor_updated_at
  BEFORE UPDATE ON public.dp_convocacao_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.dp_convocacao_ocorrencias TO authenticated;
GRANT ALL ON public.dp_convocacao_ocorrencias TO service_role;

ALTER TABLE public.dp_convocacao_ocorrencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_conv_ocor_select_admin
  ON public.dp_convocacao_ocorrencias FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
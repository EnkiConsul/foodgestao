-- =========================================================
-- Fase 1: Horário de funcionamento da unidade
-- =========================================================
CREATE TABLE public.dp_unidade_horarios_funcionamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL,
  aberto boolean NOT NULL DEFAULT true,
  hora_abertura time,
  hora_fechamento time,
  fecha_no_dia_seguinte boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_uhf_dia_semana_range CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT dp_uhf_unidade_dia_unique UNIQUE (unidade_id, dia_semana)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_unidade_horarios_funcionamento TO authenticated;
GRANT ALL ON public.dp_unidade_horarios_funcionamento TO service_role;

ALTER TABLE public.dp_unidade_horarios_funcionamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_uhf_select_members ON public.dp_unidade_horarios_funcionamento
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY dp_uhf_write_admin ON public.dp_unidade_horarios_funcionamento
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX idx_dp_uhf_company_unidade_dia
  ON public.dp_unidade_horarios_funcionamento (company_id, unidade_id, dia_semana);

CREATE TRIGGER trg_dp_uhf_updated_at
  BEFORE UPDATE ON public.dp_unidade_horarios_funcionamento
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- =========================================================
-- Fase 1: Turnos
-- =========================================================
CREATE TABLE public.dp_turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  entrada time NOT NULL,
  saida time NOT NULL,
  intervalo_minutos integer NOT NULL DEFAULT 0,
  termina_no_dia_seguinte boolean NOT NULL DEFAULT false,
  carga_liquida_horas numeric NOT NULL DEFAULT 0,
  categoria text,
  cor text,
  ativo boolean NOT NULL DEFAULT true,
  vigencia_inicio date,
  vigencia_fim date,
  versao integer NOT NULL DEFAULT 1,
  turno_origem_id uuid REFERENCES public.dp_turnos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_turnos_intervalo_positivo CHECK (intervalo_minutos >= 0),
  CONSTRAINT dp_turnos_carga_positiva CHECK (carga_liquida_horas >= 0),
  CONSTRAINT dp_turnos_versao_positiva CHECK (versao >= 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_turnos TO authenticated;
GRANT ALL ON public.dp_turnos TO service_role;

ALTER TABLE public.dp_turnos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_turnos_select_members ON public.dp_turnos
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY dp_turnos_write_admin ON public.dp_turnos
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX idx_dp_turnos_company_ativo ON public.dp_turnos (company_id, ativo);
CREATE INDEX idx_dp_turnos_company_unidade ON public.dp_turnos (company_id, unidade_id);

CREATE TRIGGER trg_dp_turnos_updated_at
  BEFORE UPDATE ON public.dp_turnos
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
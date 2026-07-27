-- =========================================================
-- FASE 1 — Jornadas, vínculo com colaborador, cobertura mínima
-- e proteção ao trabalho do menor
-- =========================================================

CREATE TYPE public.dp_tipo_escala AS ENUM ('6x1','5x2','5x1','4x2','12x36','intermitente','personalizada');
CREATE TYPE public.dp_turno AS ENUM ('matutino','vespertino','noturno','misto');

-- ---------------------------------------------------------
-- Colunas de apoio
-- ---------------------------------------------------------
ALTER TABLE public.dp_cargos
  ADD COLUMN IF NOT EXISTS insalubre_periculoso boolean NOT NULL DEFAULT false;

ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS aprendiz boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS fundamental_concluido boolean NOT NULL DEFAULT true;

ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_sexo_check
  CHECK (sexo IS NULL OR sexo IN ('F','M','outro'));

-- ---------------------------------------------------------
-- dp_jornadas — modelos de turno reutilizáveis
-- ---------------------------------------------------------
CREATE TABLE public.dp_jornadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo_escala public.dp_tipo_escala NOT NULL DEFAULT '6x1',
  carga_horaria_diaria numeric(4,2) NOT NULL DEFAULT 8,
  carga_horaria_semanal numeric(5,2) NOT NULL DEFAULT 44,
  turno public.dp_turno NOT NULL DEFAULT 'misto',
  horario_entrada time,
  horario_saida time,
  intervalo_inicio time,
  intervalo_fim time,
  permite_intervalo_fracionado boolean NOT NULL DEFAULT false,
  dias_trabalho smallint[] NOT NULL DEFAULT '{}',
  dias_folga smallint[] NOT NULL DEFAULT '{}',
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dp_jornadas_company ON public.dp_jornadas (company_id, ativo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_jornadas TO authenticated;
GRANT ALL ON public.dp_jornadas TO service_role;
ALTER TABLE public.dp_jornadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_jornadas_admin_write" ON public.dp_jornadas
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_jornadas_read_member" ON public.dp_jornadas
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_jornadas_read_colaborador" ON public.dp_jornadas
  FOR SELECT TO authenticated
  USING (company_id = (
    SELECT c.company_id FROM public.dp_colaboradores c
     WHERE c.id = public.dp_colaborador_ativo_of(auth.uid())
  ));

CREATE TRIGGER dp_jornadas_upd BEFORE UPDATE ON public.dp_jornadas
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- ---------------------------------------------------------
-- dp_colaborador_jornadas — vínculo com vigência + overrides
-- ---------------------------------------------------------
CREATE TABLE public.dp_colaborador_jornadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  jornada_id uuid NOT NULL REFERENCES public.dp_jornadas(id) ON DELETE RESTRICT,
  inicio date NOT NULL DEFAULT CURRENT_DATE,
  fim date,
  horario_entrada_override time,
  horario_saida_override time,
  intervalo_inicio_override time,
  intervalo_fim_override time,
  folga_fixa_semana_override smallint,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_colab_jornada_periodo_valido CHECK (fim IS NULL OR fim >= inicio),
  CONSTRAINT dp_colab_jornada_dow CHECK (folga_fixa_semana_override IS NULL OR folga_fixa_semana_override BETWEEN 0 AND 6)
);

CREATE UNIQUE INDEX idx_dp_colab_jornada_vigente
  ON public.dp_colaborador_jornadas (colaborador_id) WHERE fim IS NULL;
CREATE INDEX idx_dp_colab_jornada_company ON public.dp_colaborador_jornadas (company_id, colaborador_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaborador_jornadas TO authenticated;
GRANT ALL ON public.dp_colaborador_jornadas TO service_role;
ALTER TABLE public.dp_colaborador_jornadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_colab_jornadas_admin_write" ON public.dp_colaborador_jornadas
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_colab_jornadas_read_member" ON public.dp_colaborador_jornadas
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_colab_jornadas_read_self" ON public.dp_colaborador_jornadas
  FOR SELECT TO authenticated
  USING (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  );

CREATE TRIGGER dp_colab_jornadas_upd BEFORE UPDATE ON public.dp_colaborador_jornadas
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- ---------------------------------------------------------
-- dp_cobertura_minima
-- ---------------------------------------------------------
CREATE TABLE public.dp_cobertura_minima (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  dia_semana smallint,
  turno public.dp_turno,
  minimo integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_cobertura_dow CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6),
  CONSTRAINT dp_cobertura_minimo CHECK (minimo >= 0)
);

CREATE INDEX idx_dp_cobertura_company ON public.dp_cobertura_minima (company_id, unidade_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_cobertura_minima TO authenticated;
GRANT ALL ON public.dp_cobertura_minima TO service_role;
ALTER TABLE public.dp_cobertura_minima ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_cobertura_admin_write" ON public.dp_cobertura_minima
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_cobertura_read_member" ON public.dp_cobertura_minima
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE TRIGGER dp_cobertura_upd BEFORE UPDATE ON public.dp_cobertura_minima
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- ---------------------------------------------------------
-- Proteção ao trabalho do menor
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_validar_jornada_menor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c record;
  j record;
  v_exige boolean;
  v_idade int;
  v_entrada time;
  v_saida time;
  v_insalubre boolean := false;
  v_frac boolean;
BEGIN
  SELECT exige_validacao_menor INTO v_exige
    FROM public.dp_config_dp WHERE company_id = NEW.company_id;
  IF NOT COALESCE(v_exige, true) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO c FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF c.data_nascimento IS NULL THEN
    RETURN NEW;
  END IF;

  v_idade := EXTRACT(YEAR FROM age(COALESCE(NEW.inicio, CURRENT_DATE), c.data_nascimento))::int;
  IF v_idade >= 18 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO j FROM public.dp_jornadas WHERE id = NEW.jornada_id;

  -- < 16 anos só como aprendiz
  IF v_idade < 16 AND NOT COALESCE(c.aprendiz, false) THEN
    RAISE EXCEPTION 'Proibido vincular jornada a menor de 16 anos, salvo na condição de aprendiz (Art. 403 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_idade < 14 THEN
    RAISE EXCEPTION 'Proibido qualquer trabalho a menor de 14 anos (Art. 7º, XXXIII CF).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Trabalho noturno (22h às 5h)
  v_entrada := COALESCE(NEW.horario_entrada_override, j.horario_entrada);
  v_saida   := COALESCE(NEW.horario_saida_override, j.horario_saida);

  IF j.turno = 'noturno'
     OR (v_entrada IS NOT NULL AND (v_entrada >= time '22:00' OR v_entrada < time '05:00'))
     OR (v_saida IS NOT NULL AND (v_saida > time '22:00' OR v_saida <= time '05:00'))
     OR (v_entrada IS NOT NULL AND v_saida IS NOT NULL AND v_saida < v_entrada) THEN
    RAISE EXCEPTION 'Proibido trabalho noturno (22h às 5h) para menor de 18 anos (Art. 404 CLT / Art. 67 ECA).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cargo insalubre ou perigoso
  IF c.cargo_id IS NOT NULL THEN
    SELECT COALESCE(insalubre_periculoso, false) INTO v_insalubre
      FROM public.dp_cargos WHERE id = c.cargo_id;
  END IF;
  IF COALESCE(v_insalubre, false) THEN
    RAISE EXCEPTION 'Proibido vincular menor de 18 anos a cargo insalubre ou perigoso (Art. 405 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Intervalo fracionado
  v_frac := COALESCE(j.permite_intervalo_fracionado, false);
  IF v_frac THEN
    RAISE EXCEPTION 'O intervalo de menor de 18 anos não pode ser reduzido ou fracionado (Art. 411 a 413 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Carga horária do aprendiz
  IF COALESCE(c.aprendiz, false) THEN
    IF COALESCE(c.fundamental_concluido, true) = false AND j.carga_horaria_diaria > 6 THEN
      RAISE EXCEPTION 'Aprendiz sem ensino fundamental concluído: jornada máxima de 6h por dia.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF j.carga_horaria_diaria > 8 THEN
      RAISE EXCEPTION 'Contrato de aprendizagem: jornada máxima de 8h por dia.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF j.carga_horaria_diaria > 8 THEN
    RAISE EXCEPTION 'Prorrogação de jornada para menor de 18 anos exige convenção ou acordo coletivo (Art. 413 CLT).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_colab_jornadas_menor
  BEFORE INSERT OR UPDATE ON public.dp_colaborador_jornadas
  FOR EACH ROW EXECUTE FUNCTION public.dp_validar_jornada_menor();
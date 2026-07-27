-- 1. Coluna descricao em dp_jornadas
ALTER TABLE public.dp_jornadas ADD COLUMN IF NOT EXISTS descricao text;

-- 2. Tabela de horários por dia
CREATE TABLE IF NOT EXISTS public.dp_jornada_horarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  jornada_id uuid NOT NULL REFERENCES public.dp_jornadas(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  entrada time NOT NULL,
  saida time NOT NULL,
  intervalo_minutos integer NOT NULL DEFAULT 60 CHECK (intervalo_minutos >= 0 AND intervalo_minutos <= 480),
  termina_no_dia_seguinte boolean NOT NULL DEFAULT false,
  carga_horas numeric(5,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jornada_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_dp_jornada_horarios_jornada ON public.dp_jornada_horarios (jornada_id);
CREATE INDEX IF NOT EXISTS idx_dp_jornada_horarios_company ON public.dp_jornada_horarios (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_jornada_horarios TO authenticated;
GRANT ALL ON public.dp_jornada_horarios TO service_role;

ALTER TABLE public.dp_jornada_horarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da empresa leem horarios de jornada"
ON public.dp_jornada_horarios FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins gerenciam horarios de jornada"
ON public.dp_jornada_horarios FOR ALL TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

-- 3. Função de cálculo de carga diária (horas)
CREATE OR REPLACE FUNCTION public.dp_calc_carga_dia(
  _entrada time, _saida time, _intervalo_minutos integer, _vira_dia boolean
) RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(
    ROUND((
      (CASE
         WHEN _vira_dia OR _saida <= _entrada
           THEN EXTRACT(EPOCH FROM (_saida - _entrada)) / 60 + 1440
         ELSE EXTRACT(EPOCH FROM (_saida - _entrada)) / 60
       END) - COALESCE(_intervalo_minutos, 0)
    )::numeric / 60, 2),
    0
  );
$$;

-- 4. Trigger de validação + cálculo
CREATE OR REPLACE FUNCTION public.dp_jornada_horario_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _dias integer[];
  _minutos numeric;
BEGIN
  IF NEW.entrada IS NULL OR NEW.saida IS NULL THEN
    RAISE EXCEPTION 'Entrada e saída são obrigatórias';
  END IF;
  IF NEW.entrada = NEW.saida THEN
    RAISE EXCEPTION 'Entrada e saída não podem ser iguais';
  END IF;

  SELECT dias_trabalho, company_id INTO _dias, NEW.company_id
  FROM public.dp_jornadas WHERE id = NEW.jornada_id;

  IF _dias IS NULL OR NOT (NEW.dia_semana = ANY(_dias)) THEN
    RAISE EXCEPTION 'Dia % não está entre os dias de trabalho da jornada', NEW.dia_semana;
  END IF;

  _minutos := CASE
    WHEN NEW.termina_no_dia_seguinte OR NEW.saida <= NEW.entrada
      THEN EXTRACT(EPOCH FROM (NEW.saida - NEW.entrada)) / 60 + 1440
    ELSE EXTRACT(EPOCH FROM (NEW.saida - NEW.entrada)) / 60
  END;

  IF COALESCE(NEW.intervalo_minutos, 0) >= _minutos THEN
    RAISE EXCEPTION 'O intervalo não pode ser maior ou igual à duração do dia';
  END IF;

  NEW.termina_no_dia_seguinte := (NEW.saida <= NEW.entrada);
  NEW.carga_horas := public.dp_calc_carga_dia(NEW.entrada, NEW.saida, NEW.intervalo_minutos, NEW.termina_no_dia_seguinte);

  IF NEW.carga_horas <= 0 THEN
    RAISE EXCEPTION 'A carga diária precisa ser positiva';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_jornada_horario_validate ON public.dp_jornada_horarios;
CREATE TRIGGER trg_dp_jornada_horario_validate
BEFORE INSERT OR UPDATE ON public.dp_jornada_horarios
FOR EACH ROW EXECUTE FUNCTION public.dp_jornada_horario_validate();

-- 5. Recalcular carga semanal/diária da jornada pai
CREATE OR REPLACE FUNCTION public.dp_jornada_sync_carga()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _jid uuid := COALESCE(NEW.jornada_id, OLD.jornada_id);
  _sem numeric;
  _dia numeric;
BEGIN
  SELECT COALESCE(SUM(carga_horas), 0), COALESCE(MAX(carga_horas), 0)
    INTO _sem, _dia
  FROM public.dp_jornada_horarios WHERE jornada_id = _jid AND ativo;

  UPDATE public.dp_jornadas
     SET carga_horaria_semanal = _sem,
         carga_horaria_diaria = _dia,
         updated_at = now()
   WHERE id = _jid;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_jornada_sync_carga ON public.dp_jornada_horarios;
CREATE TRIGGER trg_dp_jornada_sync_carga
AFTER INSERT OR UPDATE OR DELETE ON public.dp_jornada_horarios
FOR EACH ROW EXECUTE FUNCTION public.dp_jornada_sync_carga();

-- 6. Migração das jornadas existentes
INSERT INTO public.dp_jornada_horarios (company_id, jornada_id, dia_semana, entrada, saida, intervalo_minutos, termina_no_dia_seguinte)
SELECT
  j.company_id,
  j.id,
  d.dia,
  COALESCE(j.horario_entrada, '08:00'::time),
  COALESCE(j.horario_saida, '17:00'::time),
  CASE
    WHEN j.intervalo_inicio IS NOT NULL AND j.intervalo_fim IS NOT NULL
      THEN GREATEST(0, LEAST(480, (EXTRACT(EPOCH FROM (j.intervalo_fim - j.intervalo_inicio)) / 60)::int))
    ELSE 60
  END,
  false
FROM public.dp_jornadas j
CROSS JOIN LATERAL unnest(COALESCE(j.dias_trabalho, ARRAY[]::integer[])) AS d(dia)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dp_jornada_horarios h WHERE h.jornada_id = j.id AND h.dia_semana = d.dia
)
ON CONFLICT DO NOTHING;
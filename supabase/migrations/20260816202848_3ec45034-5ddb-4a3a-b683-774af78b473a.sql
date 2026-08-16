CREATE TABLE public.dp_grades_semanais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  folga_variavel boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_grades_semanais TO authenticated;
GRANT ALL ON public.dp_grades_semanais TO service_role;
ALTER TABLE public.dp_grades_semanais ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_grades_select_members ON public.dp_grades_semanais
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));
CREATE POLICY dp_grades_write_admin ON public.dp_grades_semanais
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE TABLE public.dp_grade_dias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  grade_id uuid NOT NULL REFERENCES public.dp_grades_semanais(id) ON DELETE CASCADE,
  dow smallint NOT NULL CHECK (dow BETWEEN 0 AND 6),
  trabalha boolean NOT NULL DEFAULT true,
  turno_id uuid REFERENCES public.dp_turnos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grade_id, dow)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_grade_dias TO authenticated;
GRANT ALL ON public.dp_grade_dias TO service_role;
ALTER TABLE public.dp_grade_dias ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_grade_dias_select_members ON public.dp_grade_dias
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));
CREATE POLICY dp_grade_dias_write_admin ON public.dp_grade_dias
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE INDEX dp_grades_semanais_company_idx ON public.dp_grades_semanais (company_id, unidade_id);
CREATE INDEX dp_grade_dias_grade_idx ON public.dp_grade_dias (grade_id);

CREATE TRIGGER dp_grades_semanais_updated_at
  BEFORE UPDATE ON public.dp_grades_semanais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Converte os horários próprios por dia já cadastrados em horários da loja
-- compartilhados (dp_turnos), vinculando cada dia ao turno correspondente.
DO $$
DECLARE
  r record;
  v_turno uuid;
  v_cat text;
BEGIN
  FOR r IN
    SELECT DISTINCT c.company_id, c.unidade_id, d.entrada, d.saida, COALESCE(d.intervalo_minutos, 0) AS intervalo
    FROM public.dp_colaborador_config_dias d
    JOIN public.dp_colaborador_config_trabalho c ON c.id = d.config_id
    WHERE d.trabalha AND d.entrada IS NOT NULL AND d.saida IS NOT NULL
  LOOP
    SELECT t.id INTO v_turno
    FROM public.dp_turnos t
    WHERE t.company_id = r.company_id
      AND (t.unidade_id = r.unidade_id OR t.unidade_id IS NULL)
      AND t.entrada = r.entrada AND t.saida = r.saida
      AND COALESCE(t.intervalo_minutos, 0) = r.intervalo
      AND t.ativo
    ORDER BY (t.unidade_id IS NOT NULL) DESC
    LIMIT 1;

    IF v_turno IS NULL THEN
      v_cat := CASE
        WHEN EXTRACT(HOUR FROM r.entrada) < 11 THEN 'abertura'
        WHEN EXTRACT(HOUR FROM r.entrada) < 15 THEN 'almoco'
        WHEN EXTRACT(HOUR FROM r.entrada) < 21 THEN 'jantar'
        ELSE 'fechamento' END;
      INSERT INTO public.dp_turnos (
        company_id, unidade_id, nome, categoria, entrada, saida, intervalo_minutos,
        termina_no_dia_seguinte, ativo
      ) VALUES (
        r.company_id, r.unidade_id,
        initcap(v_cat) || ' ' || to_char(r.entrada, 'HH24:MI') || '–' || to_char(r.saida, 'HH24:MI'),
        v_cat, r.entrada, r.saida, r.intervalo,
        r.saida <= r.entrada, true
      ) RETURNING id INTO v_turno;
    END IF;

    UPDATE public.dp_colaborador_config_dias d
    SET turno_id = v_turno
    FROM public.dp_colaborador_config_trabalho c
    WHERE c.id = d.config_id
      AND c.company_id = r.company_id
      AND c.unidade_id IS NOT DISTINCT FROM r.unidade_id
      AND d.trabalha
      AND d.entrada = r.entrada AND d.saida = r.saida
      AND COALESCE(d.intervalo_minutos, 0) = r.intervalo
      AND d.turno_id IS NULL;
  END LOOP;
END $$;
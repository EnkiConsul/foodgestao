ALTER TABLE public.dp_unidade_feriados ADD COLUMN IF NOT EXISTS ano_inicio integer;
ALTER TABLE public.dp_unidade_feriados ADD CONSTRAINT dp_unidade_feriados_ano_inicio_chk CHECK (ano_inicio IS NULL OR ano_inicio BETWEEN 1800 AND 2200);

CREATE OR REPLACE FUNCTION public.dp_feriados_resolver(_unidade_id uuid, _inicio date, _fim date)
RETURNS TABLE(data date, nome text, feriado_id uuid, tipo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid; r record; y int; d date; primeiro date; ultimo date; delta int;
BEGIN
  IF _unidade_id IS NULL OR _inicio IS NULL OR _fim IS NULL OR _fim < _inicio THEN RETURN; END IF;
  SELECT u.company_id INTO v_company FROM public.dp_unidades u WHERE u.id = _unidade_id;
  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT (private.is_company_member(auth.uid(), v_company) OR private.is_company_owner(auth.uid(), v_company)) THEN RETURN; END IF;

  FOR r IN SELECT * FROM public.dp_unidade_feriados f WHERE f.unidade_id = _unidade_id AND f.ativo LOOP
    IF r.tipo = 'especifica' THEN
      IF r.data BETWEEN _inicio AND _fim THEN
        RETURN QUERY SELECT r.data, r.nome, r.id, r.tipo;
      END IF;
    ELSE
      FOR y IN GREATEST(EXTRACT(YEAR FROM _inicio)::int, COALESCE(r.ano_inicio, 0)) .. EXTRACT(YEAR FROM _fim)::int LOOP
        IF r.tipo = 'anual' THEN
          BEGIN d := make_date(y, r.mes, r.dia); EXCEPTION WHEN others THEN d := NULL; END;
        ELSE
          primeiro := make_date(y, r.mes, 1);
          IF r.ordinal = -1 THEN
            ultimo := (primeiro + INTERVAL '1 month - 1 day')::date;
            delta := (EXTRACT(DOW FROM ultimo)::int - r.dia_semana + 7) % 7;
            d := ultimo - delta;
          ELSE
            delta := (r.dia_semana - EXTRACT(DOW FROM primeiro)::int + 7) % 7;
            d := primeiro + delta + (r.ordinal - 1) * 7;
            IF EXTRACT(MONTH FROM d)::int <> r.mes THEN d := NULL; END IF;
          END IF;
        END IF;
        IF d IS NOT NULL AND d BETWEEN _inicio AND _fim THEN
          RETURN QUERY SELECT d, r.nome, r.id, r.tipo;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_feriados_resolver(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_feriados_resolver(uuid, date, date) TO authenticated, service_role;
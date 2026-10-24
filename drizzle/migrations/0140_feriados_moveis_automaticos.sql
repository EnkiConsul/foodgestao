ALTER TABLE public.dp_unidade_feriados ADD COLUMN codigo_movel text;
ALTER TABLE public.dp_unidade_feriados DROP CONSTRAINT dp_unidade_feriados_tipo_check;
ALTER TABLE public.dp_unidade_feriados ADD CONSTRAINT dp_unidade_feriados_tipo_check CHECK (tipo IN ('especifica','anual','relativa','movel'));
ALTER TABLE public.dp_unidade_feriados ADD CONSTRAINT dp_unidade_feriados_movel_check CHECK ((tipo = 'movel' AND codigo_movel IS NOT NULL AND codigo_movel IN ('carnaval','corpus_christi','sexta_feira_santa')) OR (tipo <> 'movel' AND codigo_movel IS NULL));
CREATE OR REPLACE FUNCTION public.dp_feriado_movel_data(_codigo text, _ano integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; n int; deslocamento int;
BEGIN
  IF _ano IS NULL OR _ano < 1583 OR _ano > 9999 THEN RETURN NULL; END IF;
  deslocamento := CASE _codigo WHEN 'carnaval' THEN -47 WHEN 'sexta_feira_santa' THEN -2 WHEN 'corpus_christi' THEN 60 ELSE NULL END;
  IF deslocamento IS NULL THEN RETURN NULL; END IF;
  a := _ano % 19; b := _ano / 100; c := _ano % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451; n := h + l - 7 * m + 114;
  RETURN make_date(_ano, n / 31, n % 31 + 1) + deslocamento;
END; $$;
REVOKE ALL ON FUNCTION public.dp_feriado_movel_data(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_feriado_movel_data(text, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.dp_feriado_validar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  IF NEW.tipo = 'movel' THEN
    IF NEW.codigo_movel IS NULL OR NEW.codigo_movel NOT IN ('carnaval','corpus_christi','sexta_feira_santa') THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
    NEW.nome := CASE NEW.codigo_movel WHEN 'carnaval' THEN 'Carnaval' WHEN 'corpus_christi' THEN 'Corpus Christi' ELSE 'Sexta-feira Santa' END;
    NEW.data := NULL; NEW.dia := NULL; NEW.mes := NULL; NEW.ordinal := NULL; NEW.dia_semana := NULL;
  ELSIF NEW.tipo = 'especifica' THEN
    IF NEW.data IS NULL THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
    NEW.codigo_movel := NULL; NEW.dia := NULL; NEW.mes := NULL; NEW.ordinal := NULL; NEW.dia_semana := NULL;
  ELSIF NEW.tipo = 'anual' THEN
    IF NEW.dia IS NULL OR NEW.mes IS NULL THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
    NEW.codigo_movel := NULL; NEW.data := NULL; NEW.ordinal := NULL; NEW.dia_semana := NULL;
  ELSIF NEW.tipo = 'relativa' THEN
    IF NEW.ordinal IS NULL OR NEW.dia_semana IS NULL OR NEW.mes IS NULL THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
    NEW.codigo_movel := NULL; NEW.data := NULL; NEW.dia := NULL;
  ELSE RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
  IF COALESCE(btrim(NEW.nome), '') = '' THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
  SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = NEW.unidade_id;
  IF v_company IS NULL OR v_company <> NEW.company_id THEN RAISE EXCEPTION 'FERIADO_UNIDADE_INVALIDA'; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.dp_feriados_resolver(_unidade_id uuid, _inicio date, _fim date)
RETURNS TABLE(data date, nome text, feriado_id uuid, tipo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; r record; y int; d date; primeiro date; ultimo date; delta int;
BEGIN
  IF _unidade_id IS NULL OR _inicio IS NULL OR _fim IS NULL OR _fim < _inicio THEN RETURN; END IF;
  SELECT u.company_id INTO v_company FROM public.dp_unidades u WHERE u.id = _unidade_id;
  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT (private.is_company_member(auth.uid(), v_company) OR private.is_company_owner(auth.uid(), v_company)) THEN RETURN; END IF;
  FOR r IN SELECT * FROM public.dp_unidade_feriados f WHERE f.unidade_id = _unidade_id AND f.ativo LOOP
    IF r.tipo = 'especifica' THEN
      IF r.data BETWEEN _inicio AND _fim THEN RETURN QUERY SELECT r.data, r.nome, r.id, r.tipo; END IF;
    ELSE
      FOR y IN GREATEST(EXTRACT(YEAR FROM _inicio)::int, COALESCE(r.ano_inicio, 0)) .. EXTRACT(YEAR FROM _fim)::int LOOP
        IF r.tipo = 'movel' THEN d := public.dp_feriado_movel_data(r.codigo_movel, y);
        ELSIF r.tipo = 'anual' THEN
          BEGIN d := make_date(y, r.mes, r.dia); EXCEPTION WHEN others THEN d := NULL; END;
        ELSE
          primeiro := make_date(y, r.mes, 1);
          IF r.ordinal = -1 THEN
            ultimo := (primeiro + INTERVAL '1 month - 1 day')::date;
            delta := (EXTRACT(DOW FROM ultimo)::int - r.dia_semana + 7) % 7; d := ultimo - delta;
          ELSE
            delta := (r.dia_semana - EXTRACT(DOW FROM primeiro)::int + 7) % 7; d := primeiro + delta + (r.ordinal - 1) * 7;
            IF EXTRACT(MONTH FROM d)::int <> r.mes THEN d := NULL; END IF;
          END IF;
        END IF;
        IF d IS NOT NULL AND d BETWEEN _inicio AND _fim THEN RETURN QUERY SELECT d, r.nome, r.id, r.tipo; END IF;
      END LOOP;
    END IF;
  END LOOP;
END; $$;
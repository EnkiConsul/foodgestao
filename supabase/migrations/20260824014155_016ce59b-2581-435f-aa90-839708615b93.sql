-- M2 (Convocações 3A.1) — Helpers de dia útil. V1: seg-sex úteis, sáb/dom não úteis, feriados fora do escopo.
-- Rollback: DROP FUNCTION public.dp_e_dia_util(date); DROP FUNCTION public.dp_adicionar_dias_uteis(timestamptz,integer,text);

CREATE OR REPLACE FUNCTION public.dp_e_dia_util(_data date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE WHEN _data IS NULL THEN NULL
              ELSE extract(isodow from _data) BETWEEN 1 AND 5 END;
$$;

COMMENT ON FUNCTION public.dp_e_dia_util(date) IS 'V1 de Convocações: dia útil = segunda a sexta. Não consulta feriados. NULL -> NULL.';

CREATE OR REPLACE FUNCTION public.dp_adicionar_dias_uteis(_base timestamptz, _dias integer, _timezone text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_local timestamp;
  v_data  date;
  v_restantes integer;
BEGIN
  IF _base IS NULL OR _dias IS NULL THEN
    RETURN NULL;
  END IF;

  IF _timezone IS NULL OR btrim(_timezone) = '' THEN
    RAISE EXCEPTION 'TIMEZONE_NAO_CONFIGURADO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _timezone) THEN
    RAISE EXCEPTION 'TIMEZONE_INVALIDO: %', _timezone;
  END IF;

  IF _dias < 0 THEN
    RAISE EXCEPTION 'DIAS_UTEIS_NEGATIVO: %', _dias;
  END IF;

  IF _dias = 0 THEN
    RETURN _base;  -- não normaliza, mesmo em fim de semana
  END IF;

  v_local := _base AT TIME ZONE _timezone;   -- horário local preservado
  v_data  := v_local::date;
  v_restantes := _dias;

  WHILE v_restantes > 0 LOOP
    v_data := v_data + 1;
    IF public.dp_e_dia_util(v_data) THEN
      v_restantes := v_restantes - 1;
    END IF;
  END LOOP;

  RETURN ((v_data + v_local::time) AT TIME ZONE _timezone);
END;
$$;

COMMENT ON FUNCTION public.dp_adicionar_dias_uteis(timestamptz, integer, text) IS 'Soma dias úteis (seg-sex, sem feriados) preservando o horário local do timezone. Erros: TIMEZONE_NAO_CONFIGURADO, TIMEZONE_INVALIDO, DIAS_UTEIS_NEGATIVO. _dias = 0 retorna _base inalterado.';

REVOKE ALL ON FUNCTION public.dp_e_dia_util(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_adicionar_dias_uteis(timestamptz, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_e_dia_util(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_adicionar_dias_uteis(timestamptz, integer, text) TO authenticated, service_role;
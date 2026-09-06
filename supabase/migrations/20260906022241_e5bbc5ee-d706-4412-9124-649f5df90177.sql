-- Nenhuma empresa tem timezone preenchido; erguer exceção derrubava a janela de folgas,
-- a distribuição automática e as convocações. Passa a assumir America/Sao_Paulo.
CREATE OR REPLACE FUNCTION public.dp_convocacao_timezone(
  _company_id uuid,
  _unidade_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  IF _unidade_id IS NOT NULL THEN
    SELECT NULLIF(btrim(u.timezone), '') INTO v_tz
      FROM public.dp_unidades u
     WHERE u.id = _unidade_id AND u.company_id = _company_id;
  END IF;

  IF v_tz IS NULL THEN
    SELECT NULLIF(btrim(c.timezone), '') INTO v_tz
      FROM public.companies c
     WHERE c.id = _company_id;
  END IF;

  IF v_tz IS NULL THEN
    v_tz := 'America/Sao_Paulo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    RAISE EXCEPTION 'TIMEZONE_INVALIDO: %', v_tz USING ERRCODE = '22023';
  END IF;

  RETURN v_tz;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_timezone(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_timezone(uuid, uuid) TO authenticated, service_role;

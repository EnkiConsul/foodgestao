CREATE OR REPLACE FUNCTION public.dp_gerar_folgas_clt(
  _unidade_id uuid,
  _ano int,
  _mes int
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _cfg public.dp_config_dp;
  _inicio date;
  _fim date;
  _criadas int := 0;
  _colab record;
  _intervalo int;
  _dia date;
BEGIN
  SELECT company_id INTO _company_id FROM public.dp_unidades WHERE id = _unidade_id;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Unidade não encontrada';
  END IF;
  IF NOT public.is_company_admin_or_owner(_company_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerar folgas nesta empresa';
  END IF;

  _cfg := public.dp_config_resolvida(_company_id, _unidade_id);
  IF _cfg IS NULL OR _cfg.regra_dsr <> 'clt' THEN
    RETURN 0;
  END IF;

  _inicio := make_date(_ano, _mes, 1);
  _fim := (_inicio + interval '1 month - 1 day')::date;

  FOR _colab IN
    SELECT id, data_admissao, sexo
    FROM public.dp_colaboradores
    WHERE company_id = _company_id
      AND unidade_id = _unidade_id
      AND ativo IS TRUE
      AND data_admissao IS NOT NULL
      AND deleted_at IS NULL
      AND (data_desligamento IS NULL OR data_desligamento >= _inicio)
      AND coalesce(vinculo_label, '') NOT ILIKE '%soci%'
  LOOP
    IF _colab.sexo = 'F' THEN
      _intervalo := greatest(1, round(
        CASE WHEN _cfg.modo_frequencia_domingo_mulher = 'por_mes'
          THEN CASE WHEN coalesce(_cfg.domingos_por_mes_mulher, 0) <= 0 THEN 0 ELSE 4.345 / _cfg.domingos_por_mes_mulher END
          ELSE coalesce(_cfg.periodicidade_domingo_mulher, 0) END
      )::int);
      IF (CASE WHEN _cfg.modo_frequencia_domingo_mulher = 'por_mes'
            THEN coalesce(_cfg.domingos_por_mes_mulher, 0) ELSE coalesce(_cfg.periodicidade_domingo_mulher, 0) END) <= 0 THEN
        CONTINUE;
      END IF;
    ELSE
      _intervalo := greatest(1, round(
        CASE WHEN _cfg.modo_frequencia_domingo = 'por_mes'
          THEN CASE WHEN coalesce(_cfg.domingos_por_mes, 0) <= 0 THEN 0 ELSE 4.345 / _cfg.domingos_por_mes END
          ELSE coalesce(_cfg.periodicidade_domingo, 0) END
      )::int);
      IF (CASE WHEN _cfg.modo_frequencia_domingo = 'por_mes'
            THEN coalesce(_cfg.domingos_por_mes, 0) ELSE coalesce(_cfg.periodicidade_domingo, 0) END) <= 0 THEN
        CONTINUE;
      END IF;
    END IF;

    FOR _dia IN
      SELECT d::date FROM generate_series(_inicio, _fim, interval '1 day') d
      WHERE extract(dow from d) = 0
    LOOP
      CONTINUE WHEN _dia < _colab.data_admissao;
      CONTINUE WHEN ((_dia - _colab.data_admissao) / 7) % _intervalo <> 0;

      IF EXISTS (
        SELECT 1 FROM public.dp_folgas f
        WHERE f.colaborador_id = _colab.id AND f.data = _dia
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.dp_folgas (company_id, colaborador_id, data, tipo, origem, status, observacao)
      VALUES (_company_id, _colab.id, _dia, 'normal', 'automatica_clt', 'agendada', 'Folga dominical definida pela CLT');
      _criadas := _criadas + 1;
    END LOOP;
  END LOOP;

  RETURN _criadas;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_gerar_folgas_clt(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_gerar_folgas_clt(uuid, int, int) TO authenticated;
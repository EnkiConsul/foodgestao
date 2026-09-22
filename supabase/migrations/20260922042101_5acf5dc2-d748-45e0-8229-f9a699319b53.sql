CREATE OR REPLACE FUNCTION private.dp_ferias_turno_de(_colaborador_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.categoria
  FROM public.dp_colaborador_config_trabalho ct
  JOIN public.dp_turnos t ON t.id = ct.turno_padrao_id
  WHERE ct.colaborador_id = _colaborador_id
    AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= CURRENT_DATE)
  ORDER BY ct.vigencia_inicio DESC NULLS LAST
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.dp_ferias_turno_de(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.dp_ferias_regras_check(
  _colaborador_id uuid,
  _company_id uuid,
  _data_inicio date,
  _data_fim date,
  _ignorar_gozo_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_col record;
  v_turno text;
  v_bloq record;
  v_regra record;
  v_conc int;
BEGIN
  SELECT id, unidade_id, cargo_id INTO v_col
  FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  v_turno := private.dp_ferias_turno_de(_colaborador_id);

  PERFORM private.dp_ferias_fila(_colaborador_id, _company_id, v_col.unidade_id);

  SELECT * INTO v_bloq
  FROM public.dp_ferias_bloqueios b
  WHERE b.company_id = _company_id
    AND b.ativo
    AND NOT b.permite_excecao
    AND (b.unidade_id IS NULL OR b.unidade_id = v_col.unidade_id)
    AND (
      (NOT b.recorrente_anual
        AND daterange(b.data_inicio, b.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]'))
      OR (
        b.recorrente_anual AND EXISTS (
          SELECT 1 FROM generate_series(
            EXTRACT(YEAR FROM _data_inicio)::int - 1,
            EXTRACT(YEAR FROM _data_fim)::int
          ) AS y
          WHERE daterange(
                  make_date(y, EXTRACT(MONTH FROM b.data_inicio)::int, EXTRACT(DAY FROM b.data_inicio)::int),
                  make_date(y, EXTRACT(MONTH FROM b.data_inicio)::int, EXTRACT(DAY FROM b.data_inicio)::int)
                    + (b.data_fim - b.data_inicio),
                  '[]'
                ) && daterange(_data_inicio, _data_fim, '[]')
        )
      )
    )
  LIMIT 1;

  IF v_bloq.id IS NOT NULL THEN
    RAISE EXCEPTION 'Período bloqueado para férias: %', v_bloq.nome;
  END IF;

  SELECT * INTO v_regra
  FROM public.dp_ferias_regras r
  WHERE r.company_id = _company_id
    AND r.ativo
    AND (r.unidade_id IS NULL OR r.unidade_id = v_col.unidade_id)
    AND (r.cargo_id IS NULL OR r.cargo_id = v_col.cargo_id)
    AND (r.turno IS NULL OR r.turno::text = v_turno)
  ORDER BY (r.cargo_id IS NOT NULL)::int + (r.unidade_id IS NOT NULL)::int + (r.turno IS NOT NULL)::int DESC
  LIMIT 1;

  IF v_regra.id IS NOT NULL THEN
    SELECT COUNT(DISTINCT g.colaborador_id) INTO v_conc
    FROM public.dp_ferias_gozos g
    JOIN public.dp_colaboradores c ON c.id = g.colaborador_id
    WHERE g.company_id = _company_id
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id)
      AND g.status <> 'cancelado'
      AND g.colaborador_id <> _colaborador_id
      AND daterange(g.data_inicio, g.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
      AND (v_regra.unidade_id IS NULL OR c.unidade_id = v_regra.unidade_id)
      AND (v_regra.cargo_id IS NULL OR c.cargo_id = v_regra.cargo_id)
      AND (v_regra.turno IS NULL OR v_regra.turno::text = private.dp_ferias_turno_de(c.id));

    IF v_conc + 1 > v_regra.max_simultaneos THEN
      RAISE EXCEPTION 'Limite de % colaborador(es) simultaneamente em férias já atingido neste período.', v_regra.max_simultaneos;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.dp_ferias_regras_check(uuid, uuid, date, date, uuid) FROM PUBLIC;
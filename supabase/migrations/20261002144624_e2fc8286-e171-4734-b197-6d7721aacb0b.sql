ALTER TABLE public.dp_folga_domingo_cargos
  ADD COLUMN IF NOT EXISTS modo_frequencia text NOT NULL DEFAULT 'por_mes' CHECK (modo_frequencia IN ('semanas','por_mes')),
  ADD COLUMN IF NOT EXISTS periodicidade_semanas smallint CHECK (periodicidade_semanas BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS dias_descanso smallint[];
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS folga_dif_modo text CHECK (folga_dif_modo IN ('semanas','por_mes')),
  ADD COLUMN IF NOT EXISTS folga_dif_periodicidade smallint CHECK (folga_dif_periodicidade BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS folga_dif_dias smallint[];

CREATE OR REPLACE FUNCTION private.dp_folga_dif_normalizar(_modo text, _qtd smallint, _dias smallint[],
  OUT domingos smallint, OUT semanas numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
BEGIN
  IF _modo NOT IN ('semanas','por_mes') THEN RAISE EXCEPTION 'Modelo de frequência inválido'; END IF;
  IF _qtd IS NULL OR _qtd NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Quantidade inválida: use de 1 a 4'; END IF;
  IF _dias IS NOT NULL AND (array_length(_dias,1) IS NULL OR EXISTS (SELECT 1 FROM unnest(_dias) d WHERE d NOT BETWEEN 0 AND 6)) THEN
    RAISE EXCEPTION 'Dias de descanso inválidos';
  END IF;
  IF _modo = 'semanas' THEN
    semanas := _qtd; domingos := greatest(1, least(4, round(4.33 / _qtd)))::smallint;
  ELSE
    domingos := _qtd; semanas := round(4.33 / _qtd, 2);
  END IF;
  IF semanas > 3.01 THEN RAISE EXCEPTION 'Frequência abaixo do mínimo legal (1 domingo a cada 3 semanas)'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_dif_normalizar(text, smallint, smallint[]) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.dp_colaborador_definir_domingos_folga(uuid, smallint);
CREATE FUNCTION public.dp_colaborador_definir_domingos_folga(
  _colaborador_id uuid, _domingos smallint,
  _modo text DEFAULT 'por_mes', _dias smallint[] DEFAULT NULL,
  _justificativa text DEFAULT NULL, _ciencia boolean DEFAULT false, _contexto jsonb DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; n record; v_dom smallint;
BEGIN
  SELECT company_id, sexo, domingos_folga_mes, folga_dif_modo, folga_dif_periodicidade, folga_dif_dias INTO r
    FROM dp_colaboradores WHERE id = _colaborador_id AND deleted_at IS NULL FOR UPDATE;
  IF r.company_id IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT tem_permissao(r.company_id, 'dp.cadastros', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar regras de folgas' USING ERRCODE = '42501';
  END IF;
  IF _domingos IS NOT NULL THEN
    SELECT * INTO n FROM private.dp_folga_dif_normalizar(_modo, _domingos, _dias);
    IF r.sexo = 'F' AND n.semanas > 2.01 THEN
      RAISE EXCEPTION 'Frequência abaixo do mínimo legal para mulheres (Art. 386 da CLT)';
    END IF;
    IF NOT coalesce(_ciencia,false) OR length(trim(coalesce(_justificativa,''))) < 15 THEN
      RAISE EXCEPTION 'Informe a justificativa (mínimo 15 caracteres) e confirme a ciência sobre a isonomia';
    END IF;
    v_dom := n.domingos;
  END IF;
  UPDATE dp_colaboradores SET domingos_folga_mes = v_dom,
    folga_dif_modo = CASE WHEN _domingos IS NULL THEN NULL ELSE _modo END,
    folga_dif_periodicidade = CASE WHEN _domingos IS NULL THEN NULL ELSE _domingos END,
    folga_dif_dias = CASE WHEN _domingos IS NULL THEN NULL ELSE _dias END,
    updated_at = now() WHERE id = _colaborador_id;
  INSERT INTO dp_regras_historico (company_id, usuario_id, tabela, registro_id, valor_antigo, valor_novo, justificativa, ciencia_confirmada)
  VALUES (r.company_id, auth.uid(), 'dp_colaboradores.folga_diferenciada', _colaborador_id,
    jsonb_build_object('domingos_mes', r.domingos_folga_mes, 'modo', r.folga_dif_modo, 'quantidade', r.folga_dif_periodicidade, 'dias', r.folga_dif_dias),
    CASE WHEN _domingos IS NULL THEN jsonb_build_object('removida', true)
      ELSE jsonb_build_object('domingos_mes', v_dom, 'modo', _modo, 'quantidade', _domingos, 'dias', _dias, 'isonomia', _contexto) END,
    nullif(trim(coalesce(_justificativa,'')),''), coalesce(_ciencia,false));
END $function$;
REVOKE ALL ON FUNCTION public.dp_colaborador_definir_domingos_folga(uuid, smallint, text, smallint[], text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_definir_domingos_folga(uuid, smallint, text, smallint[], text, boolean, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.dp_folga_domingo_cargo_definir(uuid, uuid, smallint);
CREATE FUNCTION public.dp_folga_domingo_cargo_definir(
  _unidade_id uuid, _cargo_id uuid, _domingos smallint,
  _modo text DEFAULT 'por_mes', _dias smallint[] DEFAULT NULL,
  _justificativa text DEFAULT NULL, _ciencia boolean DEFAULT false, _contexto jsonb DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_cargo_company uuid; n record; ant record;
BEGIN
  SELECT company_id INTO v_company FROM dp_unidades WHERE id = _unidade_id;
  SELECT company_id INTO v_cargo_company FROM dp_cargos WHERE id = _cargo_id;
  IF v_company IS NULL OR v_cargo_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Unidade ou cargo não encontrado';
  END IF;
  IF NOT tem_permissao(v_company, 'dp.cadastros', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar regras de folgas' USING ERRCODE = '42501';
  END IF;
  SELECT id, domingos_mes, modo_frequencia, periodicidade_semanas, dias_descanso INTO ant
    FROM dp_folga_domingo_cargos WHERE unidade_id = _unidade_id AND cargo_id = _cargo_id FOR UPDATE;
  IF _domingos IS NULL THEN
    DELETE FROM dp_folga_domingo_cargos WHERE unidade_id = _unidade_id AND cargo_id = _cargo_id;
  ELSE
    SELECT * INTO n FROM private.dp_folga_dif_normalizar(_modo, _domingos, _dias);
    IF NOT coalesce(_ciencia,false) OR length(trim(coalesce(_justificativa,''))) < 15 THEN
      RAISE EXCEPTION 'Informe a justificativa (mínimo 15 caracteres) e confirme a ciência sobre a isonomia';
    END IF;
    INSERT INTO dp_folga_domingo_cargos (company_id, unidade_id, cargo_id, domingos_mes, modo_frequencia, periodicidade_semanas, dias_descanso, updated_by)
    VALUES (v_company, _unidade_id, _cargo_id, n.domingos, _modo, CASE WHEN _modo='semanas' THEN _domingos END, _dias, auth.uid())
    ON CONFLICT (unidade_id, cargo_id) DO UPDATE
      SET domingos_mes = EXCLUDED.domingos_mes, modo_frequencia = EXCLUDED.modo_frequencia,
          periodicidade_semanas = EXCLUDED.periodicidade_semanas, dias_descanso = EXCLUDED.dias_descanso,
          updated_at = now(), updated_by = auth.uid();
  END IF;
  INSERT INTO dp_regras_historico (company_id, usuario_id, tabela, registro_id, valor_antigo, valor_novo, justificativa, ciencia_confirmada)
  VALUES (v_company, auth.uid(), 'dp_folga_domingo_cargos', _cargo_id,
    CASE WHEN ant.id IS NULL THEN NULL ELSE jsonb_build_object('unidade_id', _unidade_id, 'domingos_mes', ant.domingos_mes, 'modo', ant.modo_frequencia, 'semanas', ant.periodicidade_semanas, 'dias', ant.dias_descanso) END,
    CASE WHEN _domingos IS NULL THEN jsonb_build_object('unidade_id', _unidade_id, 'removida', true)
      ELSE jsonb_build_object('unidade_id', _unidade_id, 'domingos_mes', n.domingos, 'modo', _modo, 'quantidade', _domingos, 'dias', _dias, 'isonomia', _contexto) END,
    nullif(trim(coalesce(_justificativa,'')),''), coalesce(_ciencia,false));
END $function$;
REVOKE ALL ON FUNCTION public.dp_folga_domingo_cargo_definir(uuid, uuid, smallint, text, smallint[], text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_domingo_cargo_definir(uuid, uuid, smallint, text, smallint[], text, boolean, jsonb) TO authenticated;
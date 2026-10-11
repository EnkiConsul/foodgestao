CREATE OR REPLACE FUNCTION private.dp_regra_bloqueia_colaborador(_colab uuid, _data date)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record; r record;
BEGIN
  SELECT company_id, unidade_id, cargo_id, setor_id INTO c FROM public.dp_colaboradores WHERE id = _colab;
  IF NOT FOUND THEN RETURN NULL; END IF;
  FOR r IN SELECT id, nome, tipo::text AS tipo, mes, dia, regra_json FROM public.dp_bloqueio_regras
            WHERE company_id = c.company_id AND ativo = true AND removido_em IS NULL
              AND (
                (regra_json->>'alvo_tipo' = 'colaborador' AND (regra_json->>'colaborador_id' = _colab::text
                   OR COALESCE(regra_json->'colaborador_ids','[]'::jsonb) ? _colab::text))
                OR (regra_json->>'alvo_tipo' = 'cargo' AND c.cargo_id IS NOT NULL AND (regra_json->>'cargo_id' = c.cargo_id::text
                   OR COALESCE(regra_json->'cargo_ids','[]'::jsonb) ? c.cargo_id::text))
                OR (regra_json->>'alvo_tipo' = 'setor' AND c.setor_id IS NOT NULL AND (regra_json->>'setor_id' = c.setor_id::text
                   OR COALESCE(regra_json->'setor_ids','[]'::jsonb) ? c.setor_id::text))
              )
  LOOP
    IF NOT private.dp_regra_vale_unidade(r.id, c.unidade_id) THEN CONTINUE; END IF;
    IF private.dp_regra_casa_data(r.tipo, r.mes, r.dia, r.regra_json, _data) THEN RETURN r.nome; END IF;
  END LOOP;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION private.dp_regra_bloqueia_colaborador(uuid, date) FROM PUBLIC, anon, authenticated;
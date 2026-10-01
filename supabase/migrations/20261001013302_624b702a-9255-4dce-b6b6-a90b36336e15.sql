ALTER TABLE public.dp_preadmissao_pessoas
  ADD COLUMN finalidades text[] NOT NULL DEFAULT '{}';

UPDATE public.dp_preadmissao_pessoas
SET finalidades = (
  CASE WHEN finalidade_dependente THEN ARRAY['dependente_legal'] ELSE ARRAY[]::text[] END
  || CASE WHEN finalidade_sesc THEN ARRAY['sesc'] ELSE ARRAY[]::text[] END
);

CREATE OR REPLACE FUNCTION public.dp_preadmissao_salvar_candidato(p_preadmissao_id uuid, p_estados text[], p_status_novo text, p_dados jsonb, p_campos jsonb, p_pessoas jsonb, p_versao_esperada integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pa record;
  pessoa jsonb;
  idx int := 0;
  v_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_nome text;
  v_par text;
  v_par_norm text;
  v_cpf text;
  v_rg text;
  v_nasc text;
  v_dep boolean;
  v_sesc boolean;
  v_fins text[];
  v_permitidas text[];
  v_tem_regras boolean;
  v_travada uuid;
  v_afetadas int;
  v_campo_cpf text;
  v_campo_nasc text;
  c_parentescos text[] := ARRAY['filho','filha','enteado','enteada','tutelado','tutelada',
    'menor sob guarda','menor guarda','conjuge','companheiro','companheira','pai','mae','irmao','irma',
    'avo','ava','neto','neta','sogro','sogra','outro'];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF p_estados IS NOT NULL AND array_length(p_estados, 1) IS NOT NULL
     AND NOT (pa.status = ANY (p_estados)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_encerrada', 'status', pa.status);
  END IF;
  IF p_versao_esperada IS NOT NULL AND pa.versao <> p_versao_esperada THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'versao_alterada',
                              'status', pa.status, 'versao', pa.versao);
  END IF;

  -- Campos espelhados: conferidos ANTES de qualquer gravação.
  IF p_campos ? 'cpf' THEN
    v_campo_cpf := NULLIF(regexp_replace(COALESCE(p_campos->>'cpf', ''), '\D', '', 'g'), '');
    IF v_campo_cpf IS NOT NULL AND NOT public.dp_cpf_valido(v_campo_cpf) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'cpf_invalido');
    END IF;
  END IF;
  IF p_campos ? 'data_nascimento' THEN
    v_campo_nasc := NULLIF(btrim(COALESCE(p_campos->>'data_nascimento', '')), '');
    IF v_campo_nasc IS NOT NULL THEN
      IF NOT public.dp_data_iso_valida(v_campo_nasc)
         OR v_campo_nasc::date > (now() AT TIME ZONE 'UTC')::date
         OR v_campo_nasc::date < '1900-01-01'::date THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'data_nascimento_invalida');
      END IF;
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.dp_admissao_regra_parentescos x WHERE x.company_id = pa.company_id)
    INTO v_tem_regras;

  -- PASSO 1: conferência de TODOS os familiares, sem escrever nada.
  IF p_pessoas IS NOT NULL AND jsonb_typeof(p_pessoas) = 'array' THEN
    FOR pessoa IN SELECT * FROM jsonb_array_elements(p_pessoas) LOOP
      idx := idx + 1;
      v_nome := btrim(COALESCE(pessoa->>'nome', ''));
      v_par := btrim(COALESCE(pessoa->>'parentesco', ''));
      v_par_norm := public.dp_txt_norm(v_par);
      v_cpf := NULLIF(regexp_replace(COALESCE(pessoa->>'cpf', ''), '\D', '', 'g'), '');
      v_nasc := NULLIF(btrim(COALESCE(pessoa->>'data_nascimento', '')), '');
      v_dep := COALESCE((pessoa->>'finalidade_dependente')::boolean, false);
      v_sesc := COALESCE((pessoa->>'finalidade_sesc')::boolean, false);

      -- Lista de finalidades marcadas; sem lista, valem as marcações antigas.
      IF jsonb_typeof(pessoa->'finalidades') = 'array' THEN
        SELECT COALESCE(array_agg(DISTINCT lower(btrim(x))), '{}') INTO v_fins
          FROM jsonb_array_elements_text(pessoa->'finalidades') AS t(x)
         WHERE btrim(COALESCE(x, '')) <> '';
      ELSE
        v_fins := (CASE WHEN v_dep THEN ARRAY['dependente_legal'] ELSE ARRAY[]::text[] END
                   || CASE WHEN v_sesc THEN ARRAY['sesc'] ELSE ARRAY[]::text[] END);
      END IF;

      IF v_nome = '' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_nome', 'indice', idx);
      END IF;
      IF NOT (v_par_norm = ANY (c_parentescos)) AND NOT EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_parentescos x
         WHERE x.company_id = pa.company_id AND public.dp_txt_norm(x.parentesco) = v_par_norm
      ) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_parentesco', 'indice', idx);
      END IF;
      IF COALESCE(array_length(v_fins, 1), 0) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_finalidade', 'indice', idx);
      END IF;
      IF v_tem_regras THEN
        v_permitidas := NULL;
        SELECT x.finalidades INTO v_permitidas
          FROM public.dp_admissao_regra_parentescos x
         WHERE x.company_id = pa.company_id AND public.dp_txt_norm(x.parentesco) = v_par_norm
         LIMIT 1;
        IF v_permitidas IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_parentesco', 'indice', idx);
        END IF;
        IF NOT (v_fins <@ v_permitidas) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_sesc_parentesco', 'indice', idx);
        END IF;
      ELSE
        -- Sem lista configurada: só a finalidade legal e os convênios ativos.
        IF EXISTS (
          SELECT 1 FROM unnest(v_fins) AS t(c)
           WHERE c <> 'dependente_legal' AND NOT EXISTS (
             SELECT 1 FROM public.dp_admissao_finalidades f
              WHERE f.company_id = pa.company_id AND f.codigo = t.c AND f.ativo
           )
        ) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_sesc_parentesco', 'indice', idx);
        END IF;
      END IF;
      IF v_cpf IS NOT NULL AND NOT public.dp_cpf_valido(v_cpf) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_cpf', 'indice', idx);
      END IF;
      IF v_nasc IS NOT NULL THEN
        IF NOT public.dp_data_iso_valida(v_nasc) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_data', 'indice', idx);
        END IF;
        IF v_nasc::date > (now() AT TIME ZONE 'UTC')::date THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_data_futura', 'indice', idx);
        END IF;
        IF v_nasc::date < '1900-01-01'::date THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_data', 'indice', idx);
        END IF;
      END IF;

      IF NULLIF(pessoa->>'id', '') IS NOT NULL THEN
        BEGIN
          v_id := (pessoa->>'id')::uuid;
        EXCEPTION WHEN others THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_desconhecida', 'indice', idx);
        END;
        v_travada := NULL;
        SELECT id INTO v_travada
          FROM public.dp_preadmissao_pessoas
         WHERE id = v_id AND preadmissao_id = pa.id AND company_id = pa.company_id
           AND removido_em IS NULL
         FOR UPDATE;
        IF v_travada IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_desconhecida', 'indice', idx);
        END IF;
        IF v_id = ANY (v_ids) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_duplicada', 'indice', idx);
        END IF;
        v_ids := v_ids || v_id;
      END IF;
    END LOOP;
  END IF;

  -- PASSO 2: gravação. Tudo já foi conferido acima.
  v_ids := ARRAY[]::uuid[];
  idx := 0;
  IF p_pessoas IS NOT NULL AND jsonb_typeof(p_pessoas) = 'array' THEN
    FOR pessoa IN SELECT * FROM jsonb_array_elements(p_pessoas) LOOP
      idx := idx + 1;
      v_nome := btrim(COALESCE(pessoa->>'nome', ''));
      v_par := btrim(COALESCE(pessoa->>'parentesco', ''));
      v_cpf := NULLIF(regexp_replace(COALESCE(pessoa->>'cpf', ''), '\D', '', 'g'), '');
      v_rg := NULLIF(btrim(COALESCE(pessoa->>'rg', '')), '');
      v_nasc := NULLIF(btrim(COALESCE(pessoa->>'data_nascimento', '')), '');
      v_dep := COALESCE((pessoa->>'finalidade_dependente')::boolean, false);
      v_sesc := COALESCE((pessoa->>'finalidade_sesc')::boolean, false);
      IF jsonb_typeof(pessoa->'finalidades') = 'array' THEN
        SELECT COALESCE(array_agg(DISTINCT lower(btrim(x))), '{}') INTO v_fins
          FROM jsonb_array_elements_text(pessoa->'finalidades') AS t(x)
         WHERE btrim(COALESCE(x, '')) <> '';
      ELSE
        v_fins := (CASE WHEN v_dep THEN ARRAY['dependente_legal'] ELSE ARRAY[]::text[] END
                   || CASE WHEN v_sesc THEN ARRAY['sesc'] ELSE ARRAY[]::text[] END);
      END IF;
      v_dep := 'dependente_legal' = ANY (v_fins);
      v_sesc := 'sesc' = ANY (v_fins);
      v_id := NULLIF(pessoa->>'id', '')::uuid;

      IF v_id IS NOT NULL THEN
        UPDATE public.dp_preadmissao_pessoas
           SET nome = upper(v_nome), parentesco = upper(v_par), cpf = v_cpf,
               rg = upper(v_rg),
               data_nascimento = v_nasc::date,
               finalidade_dependente = v_dep, finalidade_sesc = v_sesc,
               finalidades = v_fins, updated_at = now()
         WHERE id = v_id AND preadmissao_id = pa.id AND company_id = pa.company_id
           AND removido_em IS NULL;
        GET DIAGNOSTICS v_afetadas = ROW_COUNT;
        IF v_afetadas <> 1 THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_desconhecida', 'indice', idx);
        END IF;
      ELSE
        INSERT INTO public.dp_preadmissao_pessoas
          (preadmissao_id, company_id, nome, parentesco, cpf, rg, data_nascimento,
           finalidade_dependente, finalidade_sesc, finalidades)
        VALUES (pa.id, pa.company_id, upper(v_nome), upper(v_par), v_cpf, upper(v_rg),
                v_nasc::date, v_dep, v_sesc, v_fins)
        RETURNING id INTO v_id;
      END IF;
      v_ids := v_ids || v_id;
    END LOOP;

    UPDATE public.dp_preadmissao_pessoas
       SET removido_em = now(), updated_at = now()
     WHERE preadmissao_id = pa.id AND company_id = pa.company_id
       AND removido_em IS NULL AND NOT (id = ANY (v_ids));
  END IF;

  UPDATE public.dp_preadmissoes
     SET dados = COALESCE(p_dados, dados),
         cpf = CASE WHEN p_campos ? 'cpf' THEN v_campo_cpf ELSE cpf END,
         email = CASE WHEN p_campos ? 'email'
                      THEN NULLIF(btrim(COALESCE(p_campos->>'email', '')), '') ELSE email END,
         data_nascimento = CASE WHEN p_campos ? 'data_nascimento'
                                THEN v_campo_nasc::date ELSE data_nascimento END,
         estado_civil = CASE WHEN p_campos ? 'estado_civil'
                             THEN NULLIF(btrim(COALESCE(p_campos->>'estado_civil', '')), '')
                             ELSE estado_civil END,
         status = COALESCE(p_status_novo, status),
         versao = versao + 1,
         updated_at = now()
   WHERE id = pa.id;

  RETURN jsonb_build_object('ok', true, 'status', COALESCE(p_status_novo, pa.status),
                            'versao', pa.versao + 1);
END;
$function$;
-- Pré-Admissão · concorrência: gravação do candidato em transação única com trava
-- Rollback (não destrutivo):
--   DROP FUNCTION IF EXISTS public.dp_preadmissao_salvar_candidato(uuid, text[], text, jsonb, jsonb, jsonb, integer);
--   DROP FUNCTION IF EXISTS public.dp_preadmissao_enviar(uuid, text[], integer);
--   DROP FUNCTION IF EXISTS public.dp_preadmissao_transicionar_versionado(uuid, text[], text, jsonb, integer);
--   (a coluna dp_preadmissoes.versao pode permanecer: é apenas um contador)

ALTER TABLE public.dp_preadmissoes
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.dp_txt_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT btrim(lower(translate(COALESCE(p, ''),
    'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')))
$$;

CREATE OR REPLACE FUNCTION public.dp_cpf_valido(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  d text := regexp_replace(COALESCE(p, ''), '\D', '', 'g');
  s int; r int; i int;
BEGIN
  IF length(d) <> 11 THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..9 LOOP s := s + substr(d, i, 1)::int * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> substr(d, 10, 1)::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + substr(d, i, 1)::int * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = substr(d, 11, 1)::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_data_iso_valida(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE d date;
BEGIN
  IF COALESCE(p, '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
  BEGIN d := p::date; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN to_char(d, 'YYYY-MM-DD') = p;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_preadmissao_transicionar_versionado(
  p_preadmissao_id uuid,
  p_de text[],
  p_para text,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_versao_esperada integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pa record; res jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF p_versao_esperada IS NOT NULL AND pa.versao <> p_versao_esperada THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'versao_alterada',
                              'status', pa.status, 'versao', pa.versao);
  END IF;
  res := public.dp_preadmissao_transicionar(p_preadmissao_id, p_de, p_para, p_patch);
  UPDATE public.dp_preadmissoes SET versao = versao + 1 WHERE id = p_preadmissao_id;
  RETURN res || jsonb_build_object('versao',
    (SELECT versao FROM public.dp_preadmissoes WHERE id = p_preadmissao_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_preadmissao_salvar_candidato(
  p_preadmissao_id uuid,
  p_estados text[],
  p_status_novo text,
  p_dados jsonb,
  p_campos jsonb,
  p_pessoas jsonb,
  p_versao_esperada integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  v_nasc text;
  v_dep boolean;
  v_sesc boolean;
  v_afetadas int;
  c_parentescos text[] := ARRAY['filho','filha','enteado','enteada','tutelado','tutelada',
    'menor sob guarda','conjuge','companheiro','companheira','pai','mae','irmao','irma',
    'avo','ava','neto','neta','sogro','sogra','outro'];
  c_sesc text[] := ARRAY['filho','filha','enteado','enteada','tutelado','tutelada',
    'menor sob guarda','conjuge','companheiro','companheira','pai','mae'];
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

      IF v_nome = '' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_nome', 'indice', idx);
      END IF;
      IF NOT (v_par_norm = ANY (c_parentescos)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_parentesco', 'indice', idx);
      END IF;
      IF NOT v_dep AND NOT v_sesc THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_finalidade', 'indice', idx);
      END IF;
      IF v_sesc AND NOT (v_par_norm = ANY (c_sesc)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_sesc_parentesco', 'indice', idx);
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

      v_id := NULLIF(pessoa->>'id', '')::uuid;
      IF v_id IS NULL THEN
        INSERT INTO public.dp_preadmissao_pessoas
          (preadmissao_id, company_id, nome, parentesco, data_nascimento, cpf, rg,
           finalidade_dependente, finalidade_sesc)
        VALUES (pa.id, pa.company_id, upper(v_nome), upper(v_par), v_nasc::date, v_cpf,
                NULLIF(btrim(COALESCE(pessoa->>'rg', '')), ''), v_dep, v_sesc)
        RETURNING id INTO v_id;
      ELSE
        UPDATE public.dp_preadmissao_pessoas SET
          nome = upper(v_nome),
          parentesco = upper(v_par),
          data_nascimento = v_nasc::date,
          cpf = v_cpf,
          rg = NULLIF(btrim(COALESCE(pessoa->>'rg', '')), ''),
          finalidade_dependente = v_dep,
          finalidade_sesc = v_sesc,
          updated_at = now()
        WHERE id = v_id AND preadmissao_id = pa.id AND company_id = pa.company_id
          AND removido_em IS NULL;
        GET DIAGNOSTICS v_afetadas = ROW_COUNT;
        IF v_afetadas <> 1 THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_desconhecida', 'indice', idx);
        END IF;
      END IF;
      v_ids := v_ids || v_id;
    END LOOP;
  END IF;

  IF p_pessoas IS NOT NULL AND jsonb_typeof(p_pessoas) = 'array' THEN
    UPDATE public.dp_preadmissao_pessoas
       SET removido_em = now(), updated_at = now()
     WHERE preadmissao_id = pa.id AND company_id = pa.company_id
       AND removido_em IS NULL AND NOT (id = ANY (v_ids));
  END IF;

  UPDATE public.dp_preadmissoes SET
    status = COALESCE(p_status_novo, status),
    dados = COALESCE(p_dados, dados),
    cpf = CASE WHEN p_campos ? 'cpf' THEN NULLIF(p_campos->>'cpf', '') ELSE cpf END,
    email = CASE WHEN p_campos ? 'email' THEN NULLIF(p_campos->>'email', '') ELSE email END,
    data_nascimento = CASE WHEN p_campos ? 'data_nascimento'
      THEN NULLIF(p_campos->>'data_nascimento', '')::date ELSE data_nascimento END,
    estado_civil = CASE WHEN p_campos ? 'estado_civil'
      THEN NULLIF(p_campos->>'estado_civil', '') ELSE estado_civil END,
    versao = versao + 1,
    updated_at = now()
  WHERE id = pa.id;

  RETURN jsonb_build_object('ok', true,
    'status', (SELECT status FROM public.dp_preadmissoes WHERE id = pa.id),
    'versao', (SELECT versao FROM public.dp_preadmissoes WHERE id = pa.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_preadmissao_enviar(
  p_preadmissao_id uuid,
  p_estados text[],
  p_versao_esperada integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pa record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF NOT (pa.status = ANY (p_estados)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_encerrada', 'status', pa.status);
  END IF;
  IF p_versao_esperada IS NOT NULL AND pa.versao <> p_versao_esperada THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'versao_alterada',
                              'status', pa.status, 'versao', pa.versao);
  END IF;

  UPDATE public.dp_preadmissoes
     SET status = 'aguardando_revisao', enviado_em = now(), correcao_motivo = NULL,
         versao = versao + 1, updated_at = now()
   WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe)
  VALUES (pa.id, pa.company_id, 'ficha_enviada', jsonb_build_object('status_anterior', pa.status));

  RETURN jsonb_build_object('ok', true, 'status', 'aguardando_revisao',
    'status_anterior', pa.status,
    'versao', (SELECT versao FROM public.dp_preadmissoes WHERE id = pa.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_preadmissao_documento_registrar(
  p_preadmissao_id uuid, p_requisito_codigo text, p_pessoa_id uuid,
  p_file_path text, p_file_name text, p_mime_type text, p_file_size bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  pa record;
  v_versao int;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.status NOT IN ('aguardando_preenchimento', 'em_preenchimento', 'correcao_solicitada', 'aguardando_nova_versao') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_encerrada', 'status', pa.status);
  END IF;
  IF p_pessoa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_preadmissao_pessoas
    WHERE id = p_pessoa_id AND preadmissao_id = pa.id AND company_id = pa.company_id
      AND removido_em IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'titular_invalido');
  END IF;

  UPDATE public.dp_preadmissao_documentos
     SET substituido_em = now()
   WHERE preadmissao_id = pa.id
     AND requisito_codigo = p_requisito_codigo
     AND COALESCE(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND substituido_em IS NULL;

  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_versao
    FROM public.dp_preadmissao_documentos
   WHERE preadmissao_id = pa.id AND requisito_codigo = p_requisito_codigo;

  INSERT INTO public.dp_preadmissao_documentos
    (preadmissao_id, company_id, pessoa_id, requisito_codigo, file_path, file_name, mime_type, file_size, versao)
  VALUES (pa.id, pa.company_id, p_pessoa_id, p_requisito_codigo, p_file_path, p_file_name, p_mime_type, p_file_size, v_versao)
  RETURNING id INTO v_id;

  UPDATE public.dp_preadmissoes SET versao = versao + 1, updated_at = now() WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe)
  VALUES (pa.id, pa.company_id, 'documento_enviado',
          jsonb_build_object('codigo', p_requisito_codigo, 'versao', v_versao));

  RETURN jsonb_build_object('ok', true, 'documento_id', v_id, 'versao', v_versao,
    'ficha_versao', (SELECT versao FROM public.dp_preadmissoes WHERE id = pa.id));
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_salvar_candidato(uuid, text[], text, jsonb, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_preadmissao_enviar(uuid, text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_preadmissao_transicionar_versionado(uuid, text[], text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_salvar_candidato(uuid, text[], text, jsonb, jsonb, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_enviar(uuid, text[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_transicionar_versionado(uuid, text[], text, jsonb, integer) TO service_role;
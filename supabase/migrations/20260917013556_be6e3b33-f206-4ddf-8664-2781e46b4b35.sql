-- ---------------------------------------------------------------------------
-- 1) Gravação do candidato: valida TODOS os familiares ANTES de escrever
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_preadmissao_salvar_candidato(
  p_preadmissao_id uuid, p_estados text[], p_status_novo text, p_dados jsonb,
  p_campos jsonb, p_pessoas jsonb, p_versao_esperada integer DEFAULT NULL::integer)
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
  v_nasc text;
  v_dep boolean;
  v_sesc boolean;
  v_existe int;
  v_afetadas int;
  c_parentescos text[] := ARRAY['filho','filha','enteado','enteada','tutelado','tutelada',
    'menor sob guarda','menor guarda','conjuge','companheiro','companheira','pai','mae','irmao','irma',
    'avo','ava','neto','neta','sogro','sogra','outro'];
  -- Sesc aceita avô e avó além de filhos, enteados, tutelados, menor sob
  -- guarda, cônjuge/companheiro e pais (mesma lista da tela).
  c_sesc text[] := ARRAY['filho','filha','enteado','enteada','tutelado','tutelada',
    'menor sob guarda','menor guarda','conjuge','companheiro','companheira','pai','mae','avo','ava'];
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

  -- PASSO 1: conferência de TODOS os familiares, sem escrever nada. Um
  -- familiar inválido (ou de outra ficha) recusa o pedido inteiro, de modo
  -- que jamais fica gravação parcial nem versão inconsistente.
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

      -- Id informado precisa ser familiar VIVO desta ficha E desta empresa.
      IF NULLIF(pessoa->>'id', '') IS NOT NULL THEN
        BEGIN
          v_id := (pessoa->>'id')::uuid;
        EXCEPTION WHEN others THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'pessoa_desconhecida', 'indice', idx);
        END;
        SELECT count(*) INTO v_existe
          FROM public.dp_preadmissao_pessoas
         WHERE id = v_id AND preadmissao_id = pa.id AND company_id = pa.company_id
           AND removido_em IS NULL
         FOR UPDATE;
        IF v_existe <> 1 THEN
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
      v_nasc := NULLIF(btrim(COALESCE(pessoa->>'data_nascimento', '')), '');
      v_dep := COALESCE((pessoa->>'finalidade_dependente')::boolean, false);
      v_sesc := COALESCE((pessoa->>'finalidade_sesc')::boolean, false);
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
          -- Não deveria acontecer (já conferido com trava): recusa por segurança.
          RAISE EXCEPTION 'familiar % não pertence a esta ficha', idx
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
      v_ids := v_ids || v_id;
    END LOOP;

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
$function$;

-- ---------------------------------------------------------------------------
-- 2) Transição versionada: versão só sobe quando a transição é aceita
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_preadmissao_transicionar_versionado(
  p_preadmissao_id uuid, p_de text[], p_para text, p_patch jsonb DEFAULT '{}'::jsonb,
  p_versao_esperada integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF COALESCE((res->>'ok')::boolean, false) THEN
    UPDATE public.dp_preadmissoes SET versao = versao + 1 WHERE id = p_preadmissao_id;
  END IF;
  RETURN res || jsonb_build_object('versao',
    (SELECT versao FROM public.dp_preadmissoes WHERE id = p_preadmissao_id));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Análise de documento + versão na MESMA transação travada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_preadmissao_avaliar_documento(
  p_preadmissao_id uuid, p_documento_id uuid, p_status text, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pa record; doc record;
BEGIN
  IF p_status NOT IN ('aprovado','recusado') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'status_invalido');
  END IF;
  IF p_status = 'recusado' AND length(btrim(COALESCE(p_motivo,''))) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.status IN ('concluida','cancelada','expirada') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_encerrada', 'status', pa.status);
  END IF;

  SELECT * INTO doc FROM public.dp_preadmissao_documentos
   WHERE id = p_documento_id AND preadmissao_id = pa.id AND company_id = pa.company_id
   FOR UPDATE;
  IF doc.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'documento_nao_encontrado');
  END IF;
  IF doc.substituido_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'documento_substituido');
  END IF;

  UPDATE public.dp_preadmissao_documentos
     SET status = p_status::dp_documento_aprovacao_status,
         motivo_recusa = CASE WHEN p_status = 'recusado' THEN btrim(p_motivo) ELSE NULL END,
         updated_at = now()
   WHERE id = doc.id;

  -- A análise muda as pendências: a versão sobe na MESMA transação, de modo
  -- que nenhum preparo para a contabilidade passa no intervalo.
  UPDATE public.dp_preadmissoes SET versao = versao + 1, updated_at = now() WHERE id = pa.id;

  RETURN jsonb_build_object('ok', true, 'requisito_codigo', doc.requisito_codigo,
    'versao', (SELECT versao FROM public.dp_preadmissoes WHERE id = pa.id));
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_avaliar_documento(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_avaliar_documento(uuid, uuid, text, text) TO service_role;
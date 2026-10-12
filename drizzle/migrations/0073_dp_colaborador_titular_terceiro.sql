-- Permite pagamento em conta/Pix de terceiro com dados do titular validados.
-- 1) dp_colaborador_conferir: terceiro permitido quando titular_proprio=false,
--    exigindo nome, CPF (11 dígitos) e relação do titular; chave Pix CPF pode
--    ser do titular nesse caso.
CREATE OR REPLACE FUNCTION private.dp_colaborador_conferir(_company_id uuid, _dados jsonb, _colaborador_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf text := regexp_replace(COALESCE(_dados->>'cpf', ''), '\D', '', 'g');
  v_pix_tipo text := lower(btrim(COALESCE(_dados->>'pix_tipo', '')));
  v_pix_chave text := btrim(COALESCE(_dados->>'pix_chave', ''));
  v_titular_cpf text := regexp_replace(COALESCE(_dados->>'titular_cpf', ''), '\D', '', 'g');
  v_titular_proprio boolean := COALESCE((_dados->>'titular_proprio')::boolean, true);
BEGIN
  IF COALESCE(btrim(_dados->>'nome'), '') = '' THEN RAISE EXCEPTION 'COLAB_NOME_OBRIGATORIO'; END IF;
  IF (_dados->>'cargo_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_cargos x WHERE x.id = (_dados->>'cargo_id')::uuid AND x.company_id = _company_id) THEN RAISE EXCEPTION 'COLAB_CARGO_INVALIDO'; END IF;
  IF (_dados->>'unidade_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_unidades x WHERE x.id = (_dados->>'unidade_id')::uuid AND x.company_id = _company_id) THEN RAISE EXCEPTION 'COLAB_UNIDADE_INVALIDA'; END IF;
  IF (_dados->>'setor_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_setores x WHERE x.id = (_dados->>'setor_id')::uuid AND x.company_id = _company_id) THEN RAISE EXCEPTION 'COLAB_SETOR_INVALIDO'; END IF;
  IF (_dados->>'sindicato_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_sindicatos x WHERE x.id = (_dados->>'sindicato_id')::uuid AND x.company_id = _company_id) THEN RAISE EXCEPTION 'COLAB_SINDICATO_INVALIDO'; END IF;
  IF v_cpf <> '' AND length(v_cpf) <> 11 THEN RAISE EXCEPTION 'COLAB_CPF_INVALIDO'; END IF;
  IF v_cpf <> '' AND EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.company_id = _company_id AND c.deleted_at IS NULL AND regexp_replace(COALESCE(c.cpf, ''), '\D', '', 'g') = v_cpf AND (_colaborador_id IS NULL OR c.id <> _colaborador_id)) THEN RAISE EXCEPTION 'COLAB_CPF_DUPLICADO'; END IF;

  -- Pagamento: chave Pix do próprio colaborador (CPF ou celular). O app grava
  -- celular como 'telefone' (valor aceito pela constraint da tabela).
  IF v_pix_chave <> '' OR v_pix_tipo <> '' THEN
    IF v_pix_tipo NOT IN ('cpf', 'telefone', 'celular') THEN RAISE EXCEPTION 'PIX_TIPO_NAO_PERMITIDO'; END IF;
    IF v_pix_chave = '' THEN RAISE EXCEPTION 'PIX_CHAVE_OBRIGATORIA'; END IF;
    IF v_pix_tipo = 'cpf' THEN
      IF length(regexp_replace(v_pix_chave, '\D', '', 'g')) <> 11 THEN RAISE EXCEPTION 'PIX_CHAVE_INVALIDA'; END IF;
      -- Pix CPF de terceiro é aceito quando o titular é outra pessoa.
      IF v_titular_proprio AND v_cpf <> '' AND regexp_replace(v_pix_chave, '\D', '', 'g') <> v_cpf THEN RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO'; END IF;
    ELSE
      IF length(regexp_replace(v_pix_chave, '\D', '', 'g')) NOT BETWEEN 10 AND 13 THEN RAISE EXCEPTION 'PIX_CHAVE_INVALIDA'; END IF;
    END IF;
  END IF;

  -- Titular terceiro: permitido com dados completos do titular (nome, CPF, relação).
  IF NOT v_titular_proprio THEN
    IF COALESCE(btrim(_dados->>'titular_nome'), '') = '' THEN RAISE EXCEPTION 'TITULAR_NOME_OBRIGATORIO'; END IF;
    IF length(v_titular_cpf) <> 11 THEN RAISE EXCEPTION 'TITULAR_CPF_INVALIDO'; END IF;
    IF COALESCE(btrim(_dados->>'titular_relacao'), '') = '' THEN RAISE EXCEPTION 'TITULAR_RELACAO_OBRIGATORIA'; END IF;
  ELSE
    IF v_titular_cpf <> '' AND v_cpf <> '' AND v_titular_cpf <> v_cpf THEN RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO'; END IF;
  END IF;
END $function$;

-- 2) dp_colaborador_salvar: não força mais titular_proprio=true; respeita o
--    valor enviado pelo app (padrão true quando ausente).
CREATE OR REPLACE FUNCTION public.dp_colaborador_salvar(p_dados jsonb, p_id uuid DEFAULT NULL::uuid, p_company_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bloqueadas text[] := ARRAY[
    'id','company_id','user_id','created_at','updated_at','deleted_at','deleted_by',
    'delete_reason','ativo','data_desligamento','desligado_em','desligado_por',
    'motivo_desligamento','acesso_portal_ate','aproval_status','email_portal'
  ];
  v_atual public.dp_colaboradores;
  v_company uuid;
  v_json jsonb;
  v_merge jsonb;
  v_cols text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'COLAB_DADOS_INVALIDOS';
  END IF;

  IF p_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('dp_colaborador:' || p_id::text, 0));
    SELECT * INTO v_atual FROM public.dp_colaboradores WHERE id = p_id AND deleted_at IS NULL;
    IF v_atual.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_company := v_atual.company_id;
  ELSE
    v_company := p_company_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'COLAB_EMPRESA_OBRIGATORIA'; END IF;
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Campos protegidos ficam fora; nomes de cadastro em CAIXA ALTA.
  v_json := p_dados - v_bloqueadas;
  IF v_json ? 'nome' THEN
    v_json := jsonb_set(v_json, '{nome}', to_jsonb(upper(btrim(COALESCE(v_json->>'nome', '')))));
  END IF;
  IF v_json ? 'nome_mae' AND COALESCE(v_json->>'nome_mae','') <> '' THEN
    v_json := jsonb_set(v_json, '{nome_mae}', to_jsonb(upper(btrim(v_json->>'nome_mae'))));
  END IF;
  IF v_json ? 'nome_pai' AND COALESCE(v_json->>'nome_pai','') <> '' THEN
    v_json := jsonb_set(v_json, '{nome_pai}', to_jsonb(upper(btrim(v_json->>'nome_pai'))));
  END IF;

  IF p_id IS NULL THEN
    v_json := v_json || jsonb_build_object('company_id', v_company, 'ativo', true);
    v_merge := v_json;
  ELSE
    v_merge := to_jsonb(v_atual) || v_json;
  END IF;

  PERFORM private.dp_colaborador_conferir(v_company, v_merge, p_id);

  SELECT string_agg(quote_ident(c.column_name), ', ')
    INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'dp_colaboradores'
     AND v_json ? c.column_name;

  IF v_cols IS NULL THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'COLAB_DADOS_INVALIDOS'; END IF;
    RETURN p_id;
  END IF;

  IF p_id IS NULL THEN
    EXECUTE format(
      'INSERT INTO public.dp_colaboradores (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.dp_colaboradores, $1) RETURNING id',
      v_cols
    ) USING v_json INTO v_id;
  ELSE
    EXECUTE format(
      'UPDATE public.dp_colaboradores SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.dp_colaboradores, $1)), updated_at = now() WHERE id = $2 RETURNING id',
      v_cols
    ) USING v_json, p_id INTO v_id;
  END IF;

  RETURN v_id;
END $function$;
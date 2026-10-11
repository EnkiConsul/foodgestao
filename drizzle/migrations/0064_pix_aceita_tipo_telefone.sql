CREATE OR REPLACE FUNCTION private.dp_colaborador_conferir(_company_id uuid, _dados jsonb, _colaborador_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf text := regexp_replace(COALESCE(_dados->>'cpf', ''), '\D', '', 'g');
  v_pix_tipo text := lower(btrim(COALESCE(_dados->>'pix_tipo', '')));
  v_pix_chave text := btrim(COALESCE(_dados->>'pix_chave', ''));
  v_titular_cpf text := regexp_replace(COALESCE(_dados->>'titular_cpf', ''), '\D', '', 'g');
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
      IF v_cpf <> '' AND regexp_replace(v_pix_chave, '\D', '', 'g') <> v_cpf THEN RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO'; END IF;
    ELSE
      IF length(regexp_replace(v_pix_chave, '\D', '', 'g')) NOT BETWEEN 10 AND 13 THEN RAISE EXCEPTION 'PIX_CHAVE_INVALIDA'; END IF;
    END IF;
  END IF;

  IF COALESCE((_dados->>'titular_proprio')::boolean, true) = false THEN RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO'; END IF;
  IF v_titular_cpf <> '' AND v_cpf <> '' AND v_titular_cpf <> v_cpf THEN RAISE EXCEPTION 'TITULAR_TERCEIRO_NAO_PERMITIDO'; END IF;
END $function$;
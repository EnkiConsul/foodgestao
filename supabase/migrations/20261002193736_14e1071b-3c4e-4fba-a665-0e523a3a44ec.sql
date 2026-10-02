CREATE OR REPLACE FUNCTION public.dp_acesso_massa_analisar(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT tem_permissao(p_company, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar acessos de colaboradores.';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome,
      'cpf', regexp_replace(coalesce(c.cpf,''), '\D', '', 'g'),
      'whatsapp', regexp_replace(coalesce(c.whatsapp, c.telefone, ''), '\D', '', 'g'),
      'tem_conta', c.user_id IS NOT NULL
    ) ORDER BY c.nome)
    FROM dp_colaboradores c
    WHERE c.company_id = p_company AND c.deleted_at IS NULL AND coalesce(c.ativo, true)
      AND c.data_desligamento IS NULL
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.dp_cpf_valido(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text := regexp_replace(coalesce(p,''), '\D', '', 'g'); s int; r int; i int;
BEGIN
  IF length(d) <> 11 OR d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..9 LOOP s := s + substr(d,i,1)::int * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> substr(d,10,1)::int THEN RETURN false; END IF;
  s := 0; FOR i IN 1..10 LOOP s := s + substr(d,i,1)::int * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = substr(d,11,1)::int;
END $$;

CREATE OR REPLACE FUNCTION public.dp_acesso_massa_completar(p_company uuid, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_id uuid; v_cpf text; v_wpp text; ok int := 0; erros jsonb := '[]'::jsonb; v_nome text;
BEGIN
  IF NOT tem_permissao(p_company, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar colaboradores.';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) > 500 THEN
    RAISE EXCEPTION 'Lista inválida.';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_id := nullif(r->>'id','')::uuid;
    v_cpf := nullif(regexp_replace(coalesce(r->>'cpf',''), '\D', '', 'g'), '');
    v_wpp := nullif(regexp_replace(coalesce(r->>'whatsapp',''), '\D', '', 'g'), '');
    SELECT nome INTO v_nome FROM dp_colaboradores WHERE id = v_id AND company_id = p_company AND deleted_at IS NULL;
    IF v_nome IS NULL THEN
      erros := erros || jsonb_build_object('id', v_id, 'motivo', 'Colaborador não encontrado.'); CONTINUE;
    END IF;
    IF v_cpf IS NOT NULL AND NOT dp_cpf_valido(v_cpf) THEN
      erros := erros || jsonb_build_object('id', v_id, 'nome', v_nome, 'motivo', 'CPF inválido.'); CONTINUE;
    END IF;
    IF v_cpf IS NOT NULL AND EXISTS (SELECT 1 FROM dp_colaboradores WHERE company_id = p_company AND id <> v_id
        AND deleted_at IS NULL AND regexp_replace(coalesce(cpf,''), '\D', '', 'g') = v_cpf) THEN
      erros := erros || jsonb_build_object('id', v_id, 'nome', v_nome, 'motivo', 'CPF já usado por outro colaborador.'); CONTINUE;
    END IF;
    IF v_wpp IS NOT NULL THEN
      IF v_wpp ~ '^55\d{10,11}$' THEN v_wpp := substr(v_wpp, 3); END IF;
      IF v_wpp !~ '^\d{10,11}$' THEN
        erros := erros || jsonb_build_object('id', v_id, 'nome', v_nome, 'motivo', 'WhatsApp deve ter DDD + número.'); CONTINUE;
      END IF;
    END IF;
    UPDATE dp_colaboradores SET
      cpf = coalesce(v_cpf, cpf),
      whatsapp = coalesce(v_wpp, whatsapp),
      updated_at = now()
    WHERE id = v_id AND company_id = p_company;
    ok := ok + 1;
  END LOOP;
  RETURN jsonb_build_object('salvos', ok, 'erros', erros);
END $$;

REVOKE ALL ON FUNCTION public.dp_acesso_massa_analisar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_acesso_massa_completar(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_cpf_valido(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_acesso_massa_analisar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_acesso_massa_completar(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_cpf_valido(text) TO service_role;
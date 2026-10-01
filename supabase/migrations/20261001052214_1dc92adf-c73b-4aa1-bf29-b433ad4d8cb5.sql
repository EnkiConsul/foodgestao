-- Permite familiar aceito apenas para cadastro (sem finalidade). Reversão: recriar com RAISE 'FINALIDADE_OBRIGATORIA' para lista vazia.
CREATE OR REPLACE FUNCTION public.dp_admissao_regra_parentesco_definir_v2(
  p_company_id uuid, p_parentesco text, p_finalidades text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p text := lower(btrim(coalesce(p_parentesco, '')));
        v_lista text[];
        v_cod text;
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF v_p = '' OR length(v_p) > 40 OR v_p !~ '^[a-z0-9_ ]+$' THEN
    RAISE EXCEPTION 'REGRA_PARENTESCO_INVALIDO';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_lista
  FROM unnest(coalesce(p_finalidades, '{}')) AS t(x)
  WHERE btrim(coalesce(x, '')) <> '';
  FOREACH v_cod IN ARRAY v_lista LOOP
    IF v_cod <> 'dependente_legal' AND NOT EXISTS (
      SELECT 1 FROM public.dp_admissao_finalidades f
      WHERE f.company_id = p_company_id AND f.codigo = v_cod AND f.ativo
    ) THEN
      RAISE EXCEPTION 'FINALIDADE_DESCONHECIDA';
    END IF;
  END LOOP;
  PERFORM private.dp_regras_fila(format('parentesco|%s|%s', p_company_id, upper(v_p)));
  INSERT INTO public.dp_admissao_regra_parentescos (company_id, parentesco, finalidades)
  VALUES (p_company_id, v_p, v_lista)
  ON CONFLICT (company_id, parentesco) DO UPDATE
    SET finalidades = excluded.finalidades, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.dp_admissao_regra_parentesco_definir_v2(uuid,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_parentesco_definir_v2(uuid,text,text[]) TO authenticated, service_role;
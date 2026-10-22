-- Guarda na RPC: término por novo emprego exige as duas declarações, nota de evidência e data já ocorrida.
CREATE OR REPLACE FUNCTION public.dp_desligamento_termino_guard(p jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF (p->>'aplicar_termino')::boolean IS NOT TRUE THEN RETURN; END IF;
  IF (p->>'pedido_dispensado_pelo_empregado')::boolean IS NOT TRUE OR (p->>'novo_emprego_comprovado')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirme as duas declarações: pedido escrito do colaborador e comprovação do novo emprego.';
  END IF;
  IF length(btrim(coalesce(p->>'nota',''))) < 20 THEN
    RAISE EXCEPTION 'Descreva como e quando houve o pedido e a comprovação (mínimo 20 caracteres).';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_termino_guard(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_termino_guard(jsonb) TO service_role;

-- Envolve a transição existente sem reescrevê-la: renomeia e expõe a guarda na mesma assinatura.
ALTER FUNCTION public.dp_desligamento_transicao(jsonb) RENAME TO dp_desligamento_transicao_nucleo;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_transicao_nucleo(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.dp_desligamento_transicao(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p->>'acao' = 'ocorrencia' AND (p->>'aplicar_termino')::boolean IS TRUE THEN
    PERFORM public.dp_desligamento_termino_guard(p);
    IF (p->>'data')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'O último dia trabalhado não pode ser futuro: registre depois que ele ocorrer.';
    END IF;
  END IF;
  RETURN public.dp_desligamento_transicao_nucleo(p);
END $$;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_transicao(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_transicao(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.dp_adiantamento_encerrar_no_vinculo(uuid, date, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_adiantamento_encerrar_no_desligamento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_adiantamento_encerrar_no_novo_vinculo() FROM PUBLIC, anon, authenticated;
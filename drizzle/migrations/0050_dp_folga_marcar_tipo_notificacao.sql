DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.dp_folga_marcar(date)'::regprocedure);
  v_def := replace(v_def, '''folga''::public.dp_notificacao_tipo', '''folga_acima_limite''::public.dp_notificacao_tipo');
  v_def := replace(v_def, '''folga''::dp_notificacao_tipo', '''folga_acima_limite''::dp_notificacao_tipo');
  EXECUTE v_def;
END $$;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('dp_convocacao_horario_efetivo','dp_convocacao_jornada_na_data','dp_ferias_corte_efetivo','dp_ferias_em_curso','dp_ferias_periodo_conflitos','dp_folga_dias_fds_aplicaveis','dp_folga_marcadas_no_mes','dp_folga_ocupado_no_dia','dp_jornada_dia_prevista','dp_notificar_admins_empresa','dp_setor_previsto_id')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
DO $mig$
DECLARE
  v_def text;
  v_novo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dp_escala_definir_setor_dia';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'dp_escala_definir_setor_dia não encontrada';
  END IF;

  IF position('dp.escala_oficial' in v_def) > 0 THEN
    RETURN;
  END IF;

  v_novo := regexp_replace(
    v_def,
    E'\nBEGIN\n',
    E'\nBEGIN\n  PERFORM set_config(''dp.escala_oficial'', ''1'', true);\n',
    ''
  );

  IF v_novo = v_def THEN
    RAISE EXCEPTION 'não foi possível inserir a marcação da rotina oficial';
  END IF;

  EXECUTE v_novo;
END
$mig$;
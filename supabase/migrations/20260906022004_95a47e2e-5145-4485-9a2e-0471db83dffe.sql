-- Correção: as rotinas de folga verificavam o dono da empresa por public.companies.owner_id,
-- coluna que não existe (o dono é public.companies.user_id). Qualquer chamada falhava com 42703.
DO $do$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('dp_folga_limite_dia', 'dp_capacidade_habitual_dia_cargo')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('c.owner_id' IN v_def) > 0 THEN
      v_def := replace(v_def, 'c.owner_id', 'c.user_id');
      EXECUTE v_def;
    END IF;
  END LOOP;
END
$do$;

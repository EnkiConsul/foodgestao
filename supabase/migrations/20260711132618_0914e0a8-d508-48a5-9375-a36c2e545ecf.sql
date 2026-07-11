
DROP FUNCTION IF EXISTS public.dre_ultimo_snapshot(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_dre_periodo(uuid, date, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_dre_periodo(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.dre_check_consistency(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.dre_gerar(uuid, date, date, text) CASCADE;

DROP TABLE IF EXISTS public.dre_snapshots CASCADE;
DROP TABLE IF EXISTS public.dre_ajustes_manuais CASCADE;
DROP TABLE IF EXISTS public.dre_categoria_mapeamento CASCADE;
DROP TABLE IF EXISTS public.dre_rubricas CASCADE;

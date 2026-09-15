-- Rotina da loja por turno: expõe o turno de cada linha e impede que regimes
-- convocáveis (intermitente/freelancer) apareçam sem convocação aceita.
DROP FUNCTION IF EXISTS public.dp_portal_rotina_dia(date);

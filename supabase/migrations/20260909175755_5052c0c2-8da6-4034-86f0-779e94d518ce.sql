DROP POLICY IF EXISTS modulos_catalogo_select_anon ON public.modulos_catalogo;
CREATE POLICY modulos_catalogo_select_anon
ON public.modulos_catalogo
FOR SELECT
TO anon
USING (ativo = true);
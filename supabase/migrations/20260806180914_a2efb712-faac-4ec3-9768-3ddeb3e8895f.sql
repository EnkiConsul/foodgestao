DROP FUNCTION IF EXISTS public.storefront_public_asset_allowed(text);

CREATE OR REPLACE FUNCTION public.storefront_public_media_allowed(
  p_slug text, p_bucket text, p_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_bucket = 'ped-storefront' THEN EXISTS (
      SELECT 1 FROM public.ped_storefronts s
       WHERE s.slug = lower(btrim(p_slug)) AND s.is_published
         AND (s.logo_url = p_path OR s.banner_url = p_path))
    WHEN p_bucket = 'ped-produtos' THEN EXISTS (
      SELECT 1 FROM public.ped_storefronts s
        JOIN public.ped_products pr ON pr.company_id = s.company_id
       WHERE s.slug = lower(btrim(p_slug)) AND s.is_published
         AND pr.image_path = p_path)
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_public_media_allowed(text, text, text) TO anon, authenticated, service_role;
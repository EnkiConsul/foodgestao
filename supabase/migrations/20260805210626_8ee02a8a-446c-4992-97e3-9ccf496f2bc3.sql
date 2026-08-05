ALTER TABLE public.ped_units DROP CONSTRAINT IF EXISTS ped_units_menu_url_chk;
ALTER TABLE public.ped_units ADD CONSTRAINT ped_units_menu_url_chk
  CHECK (external_menu_url IS NULL OR (external_menu_url ~* '^https?://.{3,}$' AND length(external_menu_url) <= 507));
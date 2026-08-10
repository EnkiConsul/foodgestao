ALTER TABLE public.ped_storefronts
  ADD COLUMN IF NOT EXISTS banner_fit text NOT NULL DEFAULT 'contain',
  ADD COLUMN IF NOT EXISTS banner_zoom numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS banner_focus_x numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_focus_y numeric NOT NULL DEFAULT 50;

ALTER TABLE public.ped_storefronts
  DROP CONSTRAINT IF EXISTS ped_storefronts_banner_display_chk;
ALTER TABLE public.ped_storefronts
  ADD CONSTRAINT ped_storefronts_banner_display_chk CHECK (
    banner_fit IN ('contain','cover')
    AND banner_zoom BETWEEN 1 AND 3
    AND banner_focus_x BETWEEN 0 AND 100
    AND banner_focus_y BETWEEN 0 AND 100
  );
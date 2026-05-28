ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_label text NOT NULL DEFAULT 'Mais popular';

UPDATE public.plans SET is_featured = true WHERE slug = 'pro' AND is_featured = false;

CREATE TABLE public.landing_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL UNIQUE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_content TO anon;
GRANT SELECT ON public.landing_content TO authenticated;
GRANT ALL ON public.landing_content TO service_role;

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read landing content"
ON public.landing_content FOR SELECT
USING (true);

CREATE POLICY "Super admins manage landing content"
ON public.landing_content FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_landing_content_updated_at
BEFORE UPDATE ON public.landing_content
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 1) dre_rubricas: require the caller to be a member of at least one company
DROP POLICY IF EXISTS "Authenticated can read dre_rubricas" ON public.dre_rubricas;
CREATE POLICY "Company members can read dre_rubricas"
  ON public.dre_rubricas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- 2) landing_content: add publish flag and restrict anon reads to published rows
ALTER TABLE public.landing_content
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Anyone can read landing content" ON public.landing_content;
CREATE POLICY "Public can read published landing content"
  ON public.landing_content
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- 3) dre_snapshot_lock_published: internal trigger function; revoke public/anon EXECUTE
REVOKE ALL ON FUNCTION public.dre_snapshot_lock_published() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dre_snapshot_lock_published() FROM anon;
REVOKE ALL ON FUNCTION public.dre_snapshot_lock_published() FROM authenticated;

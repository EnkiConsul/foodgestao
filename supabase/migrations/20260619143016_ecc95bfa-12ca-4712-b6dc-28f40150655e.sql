-- Harden RLS for coupons & coupon_redemptions: explicitly remove any anon access
-- and ensure authenticated grants align with existing RLS policies (super_admin only
-- for coupons; own-row read for coupon_redemptions). Reads at checkout go through
-- the validate-coupon edge function using the service role.

REVOKE ALL ON public.coupons FROM anon, PUBLIC;
REVOKE ALL ON public.coupon_redemptions FROM anon, PUBLIC;

-- Keep authenticated grants narrow: RLS still restricts rows.
REVOKE ALL ON public.coupons FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

REVOKE ALL ON public.coupon_redemptions FROM authenticated;
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

-- Force RLS so even table owners cannot bypass policies through ordinary connections.
ALTER TABLE public.coupons FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions FORCE ROW LEVEL SECURITY;

-- Recreate policies idempotently to make intent explicit and scope to authenticated only.
DROP POLICY IF EXISTS "Super admins manage coupons" ON public.coupons;
CREATE POLICY "Super admins manage coupons"
ON public.coupons
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage redemptions" ON public.coupon_redemptions;
CREATE POLICY "Super admins manage redemptions"
ON public.coupon_redemptions
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users view own redemptions" ON public.coupon_redemptions;
CREATE POLICY "Users view own redemptions"
ON public.coupon_redemptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

COMMENT ON TABLE public.coupons IS
  'Coupon catalog. Direct reads restricted to super_admin. Checkout validation must go through the validate-coupon edge function (service role).';
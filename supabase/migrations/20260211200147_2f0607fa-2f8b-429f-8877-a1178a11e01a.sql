
-- =============================================
-- Fix #1: companies table - allow member access
-- =============================================
DROP POLICY IF EXISTS "Users can manage own companies" ON public.companies;

CREATE POLICY "Company members can view companies"
ON public.companies FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_company_member(auth.uid(), id));

CREATE POLICY "Users can create own companies"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Company admins can update companies"
ON public.companies FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.is_company_admin_or_owner(auth.uid(), id))
WITH CHECK (auth.uid() = user_id OR public.is_company_admin_or_owner(auth.uid(), id));

CREATE POLICY "Company owners can delete companies"
ON public.companies FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- =============================================
-- Fix #2: accounts table - add company member access
-- =============================================
DROP POLICY IF EXISTS "Users can manage own accounts" ON public.accounts;

-- Personal accounts (no company)
CREATE POLICY "Users can manage personal accounts"
ON public.accounts FOR ALL TO authenticated
USING (auth.uid() = user_id AND company_id IS NULL)
WITH CHECK (auth.uid() = user_id AND company_id IS NULL);

-- Company accounts - SELECT for members
CREATE POLICY "Company members can view company accounts"
ON public.accounts FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id));

-- Company accounts - INSERT/UPDATE for admins/owners
CREATE POLICY "Company admins can insert company accounts"
ON public.accounts FOR INSERT TO authenticated
WITH CHECK (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Company admins can update company accounts"
ON public.accounts FOR UPDATE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Company admins can delete company accounts"
ON public.accounts FOR DELETE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

-- =============================================
-- Fix #3: transactions table - add company member access
-- =============================================
DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;

CREATE POLICY "Users can manage personal transactions"
ON public.transactions FOR ALL TO authenticated
USING (auth.uid() = user_id AND company_id IS NULL)
WITH CHECK (auth.uid() = user_id AND company_id IS NULL);

CREATE POLICY "Company members can view company transactions"
ON public.transactions FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can insert company transactions"
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Company admins can update company transactions"
ON public.transactions FOR UPDATE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Company admins can delete company transactions"
ON public.transactions FOR DELETE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

-- =============================================
-- Fix #4: bills table - add company member access
-- =============================================
DROP POLICY IF EXISTS "Users can manage own bills" ON public.bills;

CREATE POLICY "Users can manage personal bills"
ON public.bills FOR ALL TO authenticated
USING (auth.uid() = user_id AND company_id IS NULL)
WITH CHECK (auth.uid() = user_id AND company_id IS NULL);

CREATE POLICY "Company members can view company bills"
ON public.bills FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can insert company bills"
ON public.bills FOR INSERT TO authenticated
WITH CHECK (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Company admins can update company bills"
ON public.bills FOR UPDATE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Company admins can delete company bills"
ON public.bills FOR DELETE TO authenticated
USING (company_id IS NOT NULL AND public.is_company_admin_or_owner(auth.uid(), company_id));

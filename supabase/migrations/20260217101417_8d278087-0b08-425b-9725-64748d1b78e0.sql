
-- Drop all RLS policies on bills table first
DROP POLICY IF EXISTS "Company admins can delete company bills" ON public.bills;
DROP POLICY IF EXISTS "Company admins can insert company bills" ON public.bills;
DROP POLICY IF EXISTS "Company admins can update company bills" ON public.bills;
DROP POLICY IF EXISTS "Company members can view company bills" ON public.bills;
DROP POLICY IF EXISTS "Users can manage personal bills" ON public.bills;

-- Drop the bills table
DROP TABLE IF EXISTS public.bills;

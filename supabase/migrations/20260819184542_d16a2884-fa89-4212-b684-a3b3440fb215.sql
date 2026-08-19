GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_accounts TO authenticated;
GRANT ALL ON public.chart_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_account_companies TO authenticated;
GRANT ALL ON public.chart_account_companies TO service_role;
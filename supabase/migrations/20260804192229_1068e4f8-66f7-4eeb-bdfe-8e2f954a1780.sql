ALTER TABLE public.companies REPLICA IDENTITY FULL;
ALTER TABLE public.company_members REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_members;
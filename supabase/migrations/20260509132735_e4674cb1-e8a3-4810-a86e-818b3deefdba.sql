
-- Habilitar realtime nas tabelas críticas
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;

-- REPLICA IDENTITY FULL para receber old_record em UPDATE/DELETE
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.accounts REPLICA IDENTITY FULL;
ALTER TABLE public.categories REPLICA IDENTITY FULL;

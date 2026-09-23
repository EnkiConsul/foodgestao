-- Remove índices redundantes em public.transactions (pares duplicados de company_due e parent)
DROP INDEX IF EXISTS public.idx_transactions_company_due;
DROP INDEX IF EXISTS public.idx_transactions_parent;
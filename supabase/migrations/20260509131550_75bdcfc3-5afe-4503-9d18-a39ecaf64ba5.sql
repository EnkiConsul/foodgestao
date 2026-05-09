
-- Remover FKs antigas duplicadas, manter as novas (fk_*)
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_company_id_fkey;
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_category_id_fkey;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_parent_id_fkey;
ALTER TABLE public.category_companies DROP CONSTRAINT IF EXISTS category_companies_category_id_fkey;
ALTER TABLE public.category_companies DROP CONSTRAINT IF EXISTS category_companies_company_id_fkey;
ALTER TABLE public.company_invites DROP CONSTRAINT IF EXISTS company_invites_company_id_fkey;
ALTER TABLE public.company_members DROP CONSTRAINT IF EXISTS company_members_company_id_fkey;
ALTER TABLE public.contact_companies DROP CONSTRAINT IF EXISTS contact_companies_company_id_fkey;
ALTER TABLE public.contact_companies DROP CONSTRAINT IF EXISTS contact_companies_contact_id_fkey;
ALTER TABLE public.payment_method_companies DROP CONSTRAINT IF EXISTS payment_method_companies_company_id_fkey;
ALTER TABLE public.payment_method_companies DROP CONSTRAINT IF EXISTS payment_method_companies_payment_method_id_fkey;
ALTER TABLE public.transaction_attachments DROP CONSTRAINT IF EXISTS transaction_attachments_transaction_id_fkey;
ALTER TABLE public.transaction_tags DROP CONSTRAINT IF EXISTS transaction_tags_tag_id_fkey;
ALTER TABLE public.transaction_tags DROP CONSTRAINT IF EXISTS transaction_tags_transaction_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_account_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_category_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_company_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_contact_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_cost_center_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_destination_account_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_parent_transaction_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_id_fkey;

-- Remover índices duplicados também
DROP INDEX IF EXISTS public.idx_accounts_user;
DROP INDEX IF EXISTS public.idx_budgets_user;
DROP INDEX IF EXISTS public.idx_categories_user_parent;
DROP INDEX IF EXISTS public.idx_transaction_attachments_transaction_id;

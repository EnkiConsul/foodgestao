-- ============================================================
-- FASE 1: ÍNDICES, FOREIGN KEYS E OTIMIZAÇÃO DE RLS
-- ============================================================

-- ------------------------------------------------------------
-- 1) ÍNDICES ESTRATÉGICOS
-- ------------------------------------------------------------

-- transactions (tabela mais consultada)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_company_date ON public.transactions (company_id, transaction_date DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_destination_account ON public.transactions (destination_account_id) WHERE destination_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_contact ON public.transactions (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON public.transactions (payment_method_id) WHERE payment_method_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_cost_center ON public.transactions (cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_parent ON public.transactions (parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_due_date ON public.transactions (due_date) WHERE bill_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_bill_status ON public.transactions (bill_status) WHERE bill_status IS NOT NULL;

-- accounts
CREATE INDEX IF NOT EXISTS idx_accounts_user_context ON public.accounts (user_id, context, is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_company ON public.accounts (company_id, is_active) WHERE company_id IS NOT NULL;

-- categories
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON public.categories (user_id, transaction_type, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories (parent_id) WHERE parent_id IS NOT NULL;

-- contacts
CREATE INDEX IF NOT EXISTS idx_contacts_user_active ON public.contacts (user_id, is_active);

-- budgets
CREATE INDEX IF NOT EXISTS idx_budgets_user_category ON public.budgets (user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON public.budgets (start_date, end_date);

-- company_members (usado em RLS — crítico)
CREATE INDEX IF NOT EXISTS idx_company_members_user ON public.company_members (user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_user ON public.company_members (company_id, user_id);

-- company_invites
CREATE INDEX IF NOT EXISTS idx_company_invites_company ON public.company_invites (company_id);
CREATE INDEX IF NOT EXISTS idx_company_invites_email_status ON public.company_invites (invited_email, status);
CREATE INDEX IF NOT EXISTS idx_company_invites_token ON public.company_invites (token);

-- companies
CREATE INDEX IF NOT EXISTS idx_companies_user ON public.companies (user_id, is_active);

-- transaction_attachments
CREATE INDEX IF NOT EXISTS idx_transaction_attachments_transaction ON public.transaction_attachments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_attachments_user ON public.transaction_attachments (user_id);

-- transaction_tags
CREATE INDEX IF NOT EXISTS idx_transaction_tags_transaction ON public.transaction_tags (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON public.transaction_tags (tag_id);

-- tags
CREATE INDEX IF NOT EXISTS idx_tags_user ON public.tags (user_id);

-- payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_active ON public.payment_methods (user_id, is_active);

-- cost_centers
CREATE INDEX IF NOT EXISTS idx_cost_centers_user_active ON public.cost_centers (user_id, is_active);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- Junções PF/PJ
CREATE INDEX IF NOT EXISTS idx_category_companies_category ON public.category_companies (category_id);
CREATE INDEX IF NOT EXISTS idx_category_companies_company ON public.category_companies (company_id);
CREATE INDEX IF NOT EXISTS idx_contact_companies_contact ON public.contact_companies (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_companies_company ON public.contact_companies (company_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_companies_pm ON public.payment_method_companies (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_companies_company ON public.payment_method_companies (company_id);

-- profiles & user_roles
CREATE INDEX IF NOT EXISTS idx_profiles_user ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles (user_id);

-- ------------------------------------------------------------
-- 2) LIMPEZA DE REGISTROS ÓRFÃOS (antes de criar FKs)
-- ------------------------------------------------------------

-- transactions: SET NULL nos vínculos opcionais órfãos
UPDATE public.transactions t SET category_id = NULL
  WHERE category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = t.category_id);
UPDATE public.transactions t SET contact_id = NULL
  WHERE contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = t.contact_id);
UPDATE public.transactions t SET payment_method_id = NULL
  WHERE payment_method_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payment_methods pm WHERE pm.id = t.payment_method_id);
UPDATE public.transactions t SET cost_center_id = NULL
  WHERE cost_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = t.cost_center_id);
UPDATE public.transactions t SET destination_account_id = NULL
  WHERE destination_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = t.destination_account_id);
UPDATE public.transactions t SET parent_transaction_id = NULL
  WHERE parent_transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transactions p WHERE p.id = t.parent_transaction_id);
UPDATE public.transactions t SET company_id = NULL
  WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = t.company_id);

-- transactions com account_id órfão são removidas (account_id é NOT NULL, sem como SET NULL)
DELETE FROM public.transactions t
  WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = t.account_id);

-- accounts
UPDATE public.accounts a SET company_id = NULL
  WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = a.company_id);

-- categories: parent órfão vira NULL (filhos viram raízes)
UPDATE public.categories c SET parent_id = NULL
  WHERE parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories p WHERE p.id = c.parent_id);

-- budgets com categoria órfã são removidas (category_id NOT NULL)
DELETE FROM public.budgets b
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = b.category_id);

-- Tabelas de junção: deletar órfãos
DELETE FROM public.category_companies cc
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = cc.category_id)
     OR NOT EXISTS (SELECT 1 FROM public.companies co WHERE co.id = cc.company_id);
DELETE FROM public.contact_companies cc
  WHERE NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = cc.contact_id)
     OR NOT EXISTS (SELECT 1 FROM public.companies co WHERE co.id = cc.company_id);
DELETE FROM public.payment_method_companies pmc
  WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods pm WHERE pm.id = pmc.payment_method_id)
     OR NOT EXISTS (SELECT 1 FROM public.companies co WHERE co.id = pmc.company_id);

-- transaction_attachments e transaction_tags
DELETE FROM public.transaction_attachments ta
  WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = ta.transaction_id);
DELETE FROM public.transaction_tags tt
  WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = tt.transaction_id)
     OR NOT EXISTS (SELECT 1 FROM public.tags tg WHERE tg.id = tt.tag_id);

-- company_members e company_invites
DELETE FROM public.company_members cm
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = cm.company_id);
DELETE FROM public.company_invites ci
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = ci.company_id);

-- ------------------------------------------------------------
-- 3) FOREIGN KEYS
-- ------------------------------------------------------------

-- transactions
ALTER TABLE public.transactions
  ADD CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_transactions_destination_account FOREIGN KEY (destination_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_transactions_contact FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_transactions_payment_method FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_transactions_cost_center FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_transactions_parent FOREIGN KEY (parent_transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_transactions_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- accounts
ALTER TABLE public.accounts
  ADD CONSTRAINT fk_accounts_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- categories (auto-referência)
ALTER TABLE public.categories
  ADD CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;

-- budgets
ALTER TABLE public.budgets
  ADD CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

-- company_members
ALTER TABLE public.company_members
  ADD CONSTRAINT fk_company_members_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- company_invites
ALTER TABLE public.company_invites
  ADD CONSTRAINT fk_company_invites_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- transaction_attachments
ALTER TABLE public.transaction_attachments
  ADD CONSTRAINT fk_transaction_attachments_transaction FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

-- transaction_tags
ALTER TABLE public.transaction_tags
  ADD CONSTRAINT fk_transaction_tags_transaction FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_transaction_tags_tag FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

-- Junções PF/PJ
ALTER TABLE public.category_companies
  ADD CONSTRAINT fk_category_companies_category FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_category_companies_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.contact_companies
  ADD CONSTRAINT fk_contact_companies_contact FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_contact_companies_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.payment_method_companies
  ADD CONSTRAINT fk_payment_method_companies_pm FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_payment_method_companies_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Garantir unicidade nas junções (evita duplicatas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_companies ON public.category_companies (category_id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_companies ON public.contact_companies (contact_id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_method_companies ON public.payment_method_companies (payment_method_id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_members ON public.company_members (company_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_tags ON public.transaction_tags (transaction_id, tag_id);

-- ------------------------------------------------------------
-- 4) OTIMIZAÇÃO DE RLS — função auxiliar para profiles
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_company_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id
$$;

-- Reescrever a policy mais pesada de profiles
DROP POLICY IF EXISTS "Company members can view member profiles" ON public.profiles;

CREATE POLICY "Company members can view member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR user_id IN (
    SELECT cm.user_id
    FROM public.company_members cm
    WHERE cm.company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  )
);


-- Enums
CREATE TYPE public.company_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- Tabela company_members
CREATE TABLE public.company_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role company_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Tabela company_invites
CREATE TABLE public.company_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role company_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL,
  status invite_status NOT NULL DEFAULT 'pending',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

-- Security definer: is_company_member
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- Security definer: get_company_role
CREATE OR REPLACE FUNCTION public.get_company_role(_user_id UUID, _company_id UUID)
RETURNS company_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.company_members
  WHERE user_id = _user_id AND company_id = _company_id
  LIMIT 1
$$;

-- Security definer: is_company_admin_or_owner
CREATE OR REPLACE FUNCTION public.is_company_admin_or_owner(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id AND role IN ('owner', 'admin')
  )
$$;

-- RLS: company_members - SELECT (membros podem ver membros da mesma empresa)
CREATE POLICY "Members can view company members"
ON public.company_members
FOR SELECT
TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

-- RLS: company_members - INSERT (apenas owner/admin)
CREATE POLICY "Admins can add company members"
ON public.company_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id));

-- RLS: company_members - UPDATE (apenas owner/admin)
CREATE POLICY "Admins can update company members"
ON public.company_members
FOR UPDATE
TO authenticated
USING (public.is_company_admin_or_owner(auth.uid(), company_id));

-- RLS: company_members - DELETE (apenas owner/admin, não pode remover a si mesmo se owner)
CREATE POLICY "Admins can remove company members"
ON public.company_members
FOR DELETE
TO authenticated
USING (public.is_company_admin_or_owner(auth.uid(), company_id));

-- RLS: company_invites - SELECT (owner/admin da empresa)
CREATE POLICY "Admins can view company invites"
ON public.company_invites
FOR SELECT
TO authenticated
USING (public.is_company_admin_or_owner(auth.uid(), company_id));

-- RLS: company_invites - INSERT (owner/admin)
CREATE POLICY "Admins can create invites"
ON public.company_invites
FOR INSERT
TO authenticated
WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id) AND invited_by = auth.uid());

-- RLS: company_invites - UPDATE (owner/admin ou o convidado aceitando)
CREATE POLICY "Admins can update invites"
ON public.company_invites
FOR UPDATE
TO authenticated
USING (public.is_company_admin_or_owner(auth.uid(), company_id));

-- RLS: company_invites - DELETE (owner/admin)
CREATE POLICY "Admins can delete invites"
ON public.company_invites
FOR DELETE
TO authenticated
USING (public.is_company_admin_or_owner(auth.uid(), company_id));

-- Trigger: auto-inserir owner ao criar empresa
CREATE OR REPLACE FUNCTION public.auto_add_company_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_add_company_owner
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_company_owner();

-- Triggers de updated_at
CREATE TRIGGER update_company_members_updated_at
BEFORE UPDATE ON public.company_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrar empresas existentes: inserir owners para empresas que ainda não têm
INSERT INTO public.company_members (company_id, user_id, role)
SELECT c.id, c.user_id, 'owner'::company_role
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_members cm WHERE cm.company_id = c.id AND cm.user_id = c.user_id
);

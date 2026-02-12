
-- Add visible_pf column to contacts
ALTER TABLE public.contacts ADD COLUMN visible_pf boolean NOT NULL DEFAULT true;

-- Create contact_companies junction table
CREATE TABLE public.contact_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (contact_id, company_id)
);

-- Enable RLS
ALTER TABLE public.contact_companies ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can manage links for their own contacts
CREATE POLICY "Users can manage own contact companies"
ON public.contact_companies
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.contacts c
  WHERE c.id = contact_companies.contact_id AND c.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.contacts c
  WHERE c.id = contact_companies.contact_id AND c.user_id = auth.uid()
));

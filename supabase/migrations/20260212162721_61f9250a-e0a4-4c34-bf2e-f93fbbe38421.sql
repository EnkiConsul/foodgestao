
-- Add visible_pf to payment_methods
ALTER TABLE public.payment_methods ADD COLUMN visible_pf boolean NOT NULL DEFAULT true;

-- Create junction table
CREATE TABLE public.payment_method_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_method_companies_unique UNIQUE (payment_method_id, company_id)
);

-- Enable RLS
ALTER TABLE public.payment_method_companies ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Users can manage own payment method companies"
ON public.payment_method_companies
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.payment_methods pm
    WHERE pm.id = payment_method_companies.payment_method_id
    AND pm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.payment_methods pm
    WHERE pm.id = payment_method_companies.payment_method_id
    AND pm.user_id = auth.uid()
  )
);

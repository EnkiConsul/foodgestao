
-- Add visible_pf flag to categories (visible in personal context)
ALTER TABLE public.categories
ADD COLUMN visible_pf boolean NOT NULL DEFAULT true;

-- Junction table for category-company visibility
CREATE TABLE public.category_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (category_id, company_id)
);

ALTER TABLE public.category_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own category companies"
ON public.category_companies
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_companies.category_id
    AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_companies.category_id
    AND c.user_id = auth.uid()
  )
);

-- 1) Tabela de modelo padrão do plano de contas
CREATE TABLE public.chart_account_templates (
  code text PRIMARY KEY,
  parent_code text REFERENCES public.chart_account_templates(code) ON DELETE CASCADE,
  name text NOT NULL,
  is_synthetic boolean NOT NULL DEFAULT false,
  is_tax boolean NOT NULL DEFAULT false,
  ai_description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chart_account_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.chart_account_templates TO authenticated;
GRANT ALL ON public.chart_account_templates TO service_role;

ALTER TABLE public.chart_account_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chart_account_templates_read_authenticated"
ON public.chart_account_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "chart_account_templates_super_admin_write"
ON public.chart_account_templates FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER chart_account_templates_updated_at
BEFORE UPDATE ON public.chart_account_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Semeia a tabela com o modelo padrão atual (hardcoded na função)
INSERT INTO public.chart_account_templates (code, parent_code, name, is_synthetic, is_tax, ai_description, sort_order)
SELECT n->>'k', NULLIF(n->>'p',''), n->>'n',
       COALESCE((n->>'s')::boolean,false), COALESCE((n->>'t')::boolean,false),
       n->>'d', ord
FROM jsonb_array_elements(public.chart_accounts_default_nodes()) WITH ORDINALITY AS t(n, ord)
ON CONFLICT (code) DO NOTHING;

-- 3) A função passa a ler da tabela (mantém a mesma forma de retorno)
CREATE OR REPLACE FUNCTION public.chart_accounts_default_nodes()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'k', code, 'p', parent_code, 'n', name,
           's', is_synthetic, 't', is_tax, 'd', ai_description
         ) ORDER BY sort_order, code), '[]'::jsonb)
  FROM public.chart_account_templates;
$function$;

-- 4) Escrita nos modelos padrão de categorias e nos grupos raiz: só super admin
GRANT INSERT, UPDATE, DELETE ON public.category_templates TO authenticated;
GRANT ALL ON public.category_templates TO service_role;

CREATE POLICY "category_templates_super_admin_write"
ON public.category_templates FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

GRANT INSERT, UPDATE, DELETE ON public.chart_accounts_root_meta TO authenticated;
GRANT ALL ON public.chart_accounts_root_meta TO service_role;

CREATE POLICY "chart_accounts_root_meta_super_admin_write"
ON public.chart_accounts_root_meta FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
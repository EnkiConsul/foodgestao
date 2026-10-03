CREATE POLICY dp_datas_bloq_read_colab ON public.dp_datas_bloqueadas FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = public.dp_colaborador_of((SELECT auth.uid())) AND c.company_id = dp_datas_bloqueadas.company_id));

CREATE POLICY dp_dia_config_read_colab ON public.dp_dia_config FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = public.dp_colaborador_of((SELECT auth.uid())) AND c.company_id = dp_dia_config.company_id));

DROP POLICY IF EXISTS dp_folgas_self_delete ON public.dp_folgas;

ALTER TABLE public.dp_folgas ADD COLUMN IF NOT EXISTS direito_origem text;
ALTER TABLE public.dp_folgas DROP CONSTRAINT IF EXISTS dp_folgas_direito_origem_chk;
ALTER TABLE public.dp_folgas ADD CONSTRAINT dp_folgas_direito_origem_chk
  CHECK (direito_origem IS NULL OR direito_origem IN ('fds','fixa','dominical_deslocada','folga_fixa_deslocada','excecao_gestor'));
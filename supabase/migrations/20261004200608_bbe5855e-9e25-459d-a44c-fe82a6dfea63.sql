GRANT SELECT (folga_dif_dias, folga_dif_modo, folga_dif_periodicidade) ON public.dp_colaboradores TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
UPDATE public.app_error_logs
SET status = 'resolvido',
    status_note = 'Ruído de recarga a quente do ambiente de desenvolvimento ao adicionar o atalho do Hub de Módulos no menu do Pessoas 360°. O ícone está importado corretamente no código atual e o registro de erros passou a ignorar esse tipo de ruído.'
WHERE status = 'aberto'
  AND message = 'LayoutGrid is not defined';
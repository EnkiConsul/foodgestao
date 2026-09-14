REVOKE EXECUTE ON FUNCTION public.dp_documento_arquivo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_documento_arquivar(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_documento_excluir_definitivo(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_documento_versao_publicar(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_bulk_item_reservar(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_bulk_item_reservar(uuid) FROM authenticated;
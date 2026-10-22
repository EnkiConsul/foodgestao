CREATE OR REPLACE FUNCTION private.dp_documento_cancelar_avisos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (NEW.arquivado_em IS NOT NULL AND OLD.arquivado_em IS NULL) THEN
    DELETE FROM public.dp_notificacoes
     WHERE ref_table = 'dp_documentos' AND ref_id = OLD.id AND lida_em IS NULL;
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD); -- aviso nunca impede arquivar/excluir
END $$;
REVOKE ALL ON FUNCTION private.dp_documento_cancelar_avisos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_documento_cancelar_avisos_upd ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_cancelar_avisos_upd
AFTER UPDATE OF arquivado_em ON public.dp_documentos
FOR EACH ROW EXECUTE FUNCTION private.dp_documento_cancelar_avisos();

DROP TRIGGER IF EXISTS trg_dp_documento_cancelar_avisos_del ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_cancelar_avisos_del
AFTER DELETE ON public.dp_documentos
FOR EACH ROW EXECUTE FUNCTION private.dp_documento_cancelar_avisos();
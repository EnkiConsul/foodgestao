import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnexoFotoPdfPicker } from "@/components/dp/portal/AnexoFotoPdfPicker";
import { supabase } from "@/integrations/supabase/client";
import { prepararUpload, comRetentativa } from "@/lib/storage/uploadPolicy";
import { sanitizeStorageFilename } from "@/lib/storage";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";

export type AtestadoAnexoAlvo = {
  id: string;
  company_id: string;
  colaborador_id: string;
  data_alvo: string;
  nome?: string | null;
};

interface Props {
  alvo: AtestadoAnexoAlvo | null;
  /** gestor anexa pelo DP; colaborador reenvia após devolução. */
  modo: "gestor" | "colaborador";
  aviso?: string | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/** Envia o arquivo do atestado e vincula à solicitação pendente. */
export function AtestadoAnexoDialog({ alvo, modo, aviso, onOpenChange, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (alvo) setFile(null); }, [alvo]);

  const enviar = async () => {
    if (!alvo || !file) return;
    setEnviando(true);
    try {
      const arq = await prepararUpload("dp-documentos", file);
      const path = `${alvo.company_id}/${alvo.colaborador_id}/${Date.now()}-${sanitizeStorageFilename(arq.name)}`;
      const up = await comRetentativa(() =>
        supabase.storage.from("dp-documentos").upload(path, arq, { contentType: arq.type, upsert: false }),
      );
      if (up.error) throw up.error;
      const { error } = await supabase.rpc(
        modo === "gestor" ? "dp_solicitacao_anexar_gestor" : "dp_solicitacao_reanexar",
        { p_id: alvo.id, p_arquivo_path: path },
      );
      if (error) {
        if (error.message.includes("STATUS_INVALIDO")) throw new Error("Esta solicitação já foi respondida.");
        throw error;
      }
      try {
        await registrarDocumento({
          company_id: alvo.company_id,
          colaborador_id: alvo.colaborador_id,
          tipo: "atestado",
          exige_aceite: false,
          titulo: `Atestado ${alvo.data_alvo.split("-").reverse().join("/")}`,
          descricao: null,
          file_path: path,
          file_name: arq.name,
          file_size: arq.size,
          mime_type: arq.type,
          referencia_data: alvo.data_alvo,
        });
      } catch {
        /* o anexo já está na solicitação; o arquivo nos documentos é complementar */
      }
      toast.success(modo === "gestor" ? "Anexo incluído no atestado" : "Atestado reenviado ao gestor");
      onDone();
    } catch (e) {
      toast.error("Não foi possível enviar o anexo", { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === "gestor" ? "Anexar atestado" : "Reenviar atestado"}</DialogTitle>
          <DialogDescription>
            {modo === "gestor"
              ? `${alvo?.nome ?? "Colaborador"} · o novo arquivo substitui o anterior nesta solicitação.`
              : "Envie a foto ou o PDF do atestado para o gestor analisar."}
          </DialogDescription>
        </DialogHeader>
        {aviso && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
            <b>Pedido do gestor:</b> {aviso}
          </div>
        )}
        <AnexoFotoPdfPicker file={file} onChange={setFile} />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Voltar</Button>
          <Button onClick={enviar} disabled={!file || enviando}>{enviando ? "Enviando..." : "Enviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

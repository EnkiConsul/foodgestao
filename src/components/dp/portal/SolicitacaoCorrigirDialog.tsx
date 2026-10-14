import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AnexoFotoPdfPicker } from "@/components/dp/portal/AnexoFotoPdfPicker";
import { supabase } from "@/integrations/supabase/client";
import { prepararUpload, comRetentativa } from "@/lib/storage/uploadPolicy";
import { sanitizeStorageFilename } from "@/lib/storage";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";

export type SolicitacaoCorrigir = {
  id: string;
  company_id: string;
  colaborador_id: string;
  tipo: string;
  data_alvo: string;
  data_fim: string | null;
  motivo: string | null;
  devolvido_motivo: string | null;
  arquivo_path?: string | null;
};

/** Colaborador corrige datas, motivo e/ou anexo de uma solicitação devolvida e reenvia. */
export function SolicitacaoCorrigirDialog({
  alvo,
  onOpenChange,
  onDone,
}: {
  alvo: SolicitacaoCorrigir | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const comAnexo = !!alvo && (alvo.tipo === "atestado" || alvo.tipo.startsWith("licenca"));

  useEffect(() => {
    if (!alvo) return;
    setIni(alvo.data_alvo ?? "");
    setFim(alvo.data_fim ?? "");
    setMotivo(alvo.motivo ?? "");
    setFile(null);
  }, [alvo]);

  const periodoOk = !!ini && (!fim || fim >= ini);

  const enviar = async () => {
    if (!alvo || !periodoOk) return;
    setEnviando(true);
    try {
      let path: string | null = null;
      let arq: File | null = null;
      if (file) {
        arq = await prepararUpload("dp-documentos", file);
        path = `${alvo.company_id}/${alvo.colaborador_id}/${Date.now()}-${sanitizeStorageFilename(arq.name)}`;
        const up = await comRetentativa(() =>
          supabase.storage.from("dp-documentos").upload(path!, arq!, { contentType: arq!.type, upsert: false }),
        );
        if (up.error) throw up.error;
      }
      const { error } = await supabase.rpc("dp_solicitacao_corrigir_reenviar", {
        p_id: alvo.id,
        p_data_alvo: ini,
        p_data_fim: fim || null,
        p_motivo: motivo,
        p_arquivo_path: path,
      });
      if (error) {
        if (error.message.includes("STATUS_INVALIDO")) throw new Error("Esta solicitação já foi respondida.");
        if (error.message.includes("PERIODO_INVALIDO")) throw new Error("A data final não pode ser antes da inicial.");
        throw error;
      }
      if (path && arq && comAnexo) {
        try {
          await registrarDocumento({
            company_id: alvo.company_id,
            colaborador_id: alvo.colaborador_id,
            tipo: "atestado",
            titulo: `Atestado ${ini.split("-").reverse().join("/")}`,
            descricao: null,
            file_path: path,
            file_name: arq.name,
            file_size: arq.size,
            mime_type: arq.type,
            referencia_data: ini,
          });
        } catch {
          /* complementar */
        }
      }
      toast.success("Solicitação corrigida e reenviada ao gestor");
      onDone();
    } catch (e) {
      toast.error("Não foi possível reenviar", { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Corrigir e reenviar</DialogTitle>
          <DialogDescription>Ajuste o que o gestor pediu. Só o que você mudar será alterado.</DialogDescription>
        </DialogHeader>
        {alvo?.devolvido_motivo && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
            <b>Pedido do gestor:</b> {alvo.devolvido_motivo}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label>Data inicial</Label>
            <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Data final</Label>
            <Input type="date" value={fim} min={ini} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        {!periodoOk && ini && <p className="text-xs text-destructive">A data final não pode ser antes da inicial.</p>}
        <div className="grid gap-1">
          <Label>Motivo / observação</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        {comAnexo && (
          <div className="grid gap-1">
            <Label>Novo anexo (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              {alvo?.arquivo_path ? "Já existe um arquivo enviado. Ele será mantido se você não escolher outro." : "Ainda não há arquivo enviado nesta solicitação."}
            </p>
            <AnexoFotoPdfPicker file={file} onChange={setFile} />
            {file && alvo?.arquivo_path && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Este arquivo vai substituir o anterior ao reenviar.</p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Voltar</Button>
          <Button onClick={enviar} disabled={!periodoOk || enviando}>{enviando ? "Enviando..." : "Reenviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

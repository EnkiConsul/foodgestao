import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { isValidCpf } from "@/lib/cpf";
import { cn } from "@/lib/utils";
import {
  enviarDocumentoFoto, mensagemErro, useColegasSubstitutos, useSolicitarSubstituicao,
} from "@/hooks/useDpSubstituicoes";
import {
  PagamentoFolguistaCampos, PAGAMENTO_FOLGUISTA_VAZIO, erroPagamentoFolguista, type PagamentoFolguista,
} from "./PagamentoFolguistaCampos";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  convocacaoId: string | null;
  companyId: string | null;
  colaboradorId: string | null;
  rotuloDia: string;
}

/**
 * Passar um plantão aceito: para um colega cadastrado do mesmo cargo (ele aceita)
 * ou para um folguista de fora (o gestor aprova antes).
 */
export function PassarPlantaoDialog({ open, onOpenChange, convocacaoId, companyId, colaboradorId, rotuloDia }: Props) {
  const [modo, setModo] = useState<"colega" | "terceiro">("colega");
  const [colegaId, setColegaId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [pag, setPag] = useState<PagamentoFolguista>(PAGAMENTO_FOLGUISTA_VAZIO);
  const [doc, setDoc] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const colegas = useColegasSubstitutos(open ? convocacaoId : null);
  const solicitar = useSolicitarSubstituicao();

  useEffect(() => {
    if (!open) return;
    setModo("colega"); setColegaId(null); setMotivo(""); setNome(""); setCpf(""); setTelefone("");
    setPag(PAGAMENTO_FOLGUISTA_VAZIO); setDoc(null);
  }, [open]);

  const enviar = async () => {
    if (!convocacaoId) return;
    if (modo === "colega") {
      if (!colegaId) return toast.error("Escolha o colega que vai no seu lugar.");
      await solicitar.mutateAsync({ convocacaoId, tipo: "colega", colegaId, dados: { motivo } });
      onOpenChange(false);
      return;
    }
    if (nome.trim().split(/\s+/).length < 2) return toast.error("Informe o nome completo do folguista.");
    if (!isValidCpf(cpf.replace(/\D/g, ""))) return toast.error("Confira o CPF do folguista: os números não fecham.");
    if (telefone.replace(/\D/g, "").length < 10) return toast.error("Informe o WhatsApp do folguista com DDD.");
    const erroPag = erroPagamentoFolguista(pag);
    if (erroPag) return toast.error(erroPag);
    if (!doc) return toast.error("Anexe o documento com foto (RG ou CNH) do folguista.");
    setEnviando(true);
    try {
      const path = await enviarDocumentoFoto(`${companyId}/${colaboradorId}/substituicoes`, doc);
      await solicitar.mutateAsync({
        convocacaoId,
        tipo: "terceiro",
        dados: { nome, cpf, telefone, motivo, documento_foto_path: path, ...pag },
      });
      onOpenChange(false);
    } catch (e) {
      if (!solicitar.isError) toast.error("Não foi possível enviar", { description: mensagemErro(e) });
    } finally {
      setEnviando(false);
    }
  };

  const ocupado = enviando || solicitar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Passar plantão — {rotuloDia}</DialogTitle>
          <DialogDescription>
            Até a troca ser concluída, o plantão continua sob sua responsabilidade.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {([
            ["colega", Users, "Colega cadastrado"],
            ["terceiro", UserPlus, "Indicar folguista"],
          ] as const).map(([v, Icone, rot]) => (
            <button
              key={v}
              type="button"
              onClick={() => setModo(v)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium",
                modo === v ? "border-primary bg-primary/10 text-primary" : "border-border",
              )}
            >
              <Icone className="size-4" /> {rot}
            </button>
          ))}
        </div>

        <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1 text-sm">
          {modo === "colega" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Só aparecem colegas do mesmo cargo que não estão escalados nem indisponíveis neste dia.
                O plantão passa para o colega assim que ele aceitar, e o gestor é avisado.
              </p>
              {colegas.isLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Buscando colegas…</p>
              ) : (colegas.data ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed p-3 text-muted-foreground">
                  Nenhum colega do mesmo cargo está livre neste dia. Você pode indicar um folguista.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {(colegas.data ?? []).map((c) => (
                    <button
                      key={c.colaborador_id}
                      type="button"
                      onClick={() => setColegaId(c.colaborador_id)}
                      className={cn(
                        "w-full rounded-lg border p-2.5 text-left",
                        colegaId === c.colaborador_id ? "border-primary bg-primary/5" : "border-border",
                      )}
                    >
                      <p className="font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.cargo_nome ?? "—"} · {c.unidade_nome ?? "—"}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                O folguista só assume o plantão depois que o gestor conferir e aprovar os dados e o documento.
              </p>
              <div className="grid gap-1.5">
                <Label>Nome completo *</Label>
                <Input value={nome} maxLength={120} onChange={(e) => setNome(e.target.value.toUpperCase())} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>CPF *</Label>
                  <Input value={cpf} maxLength={14} inputMode="numeric" onChange={(e) => setCpf(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>WhatsApp *</Label>
                  <Input value={telefone} maxLength={20} inputMode="tel" placeholder="(62) 90000-0000" onChange={(e) => setTelefone(e.target.value)} />
                </div>
              </div>
              <PagamentoFolguistaCampos value={pag} onChange={setPag} />
              <div className="grid gap-1.5 rounded-md border p-3">
                <Label>Documento com foto (RG ou CNH) *</Label>
                <DpFilePicker accept="image/*,application/pdf" file={doc} onFileChange={setDoc} />
              </div>
            </>
          )}
          <div className="grid gap-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={ocupado}>Cancelar</Button>
          <Button onClick={() => void enviar().catch(() => undefined)} disabled={ocupado}>
            {ocupado ? "Enviando..." : modo === "colega" ? "Enviar convite" : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

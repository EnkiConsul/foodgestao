import { useEffect, useState } from "react";
import { Loader2, Replace, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DP_DOC_GRUPOS } from "@/lib/dp/documentoTipos";
import {
  docSourceConfig, podeEditarClassificacao, substituirDocumentoHistorico,
} from "@/lib/dp/historicoDocAcoes";

export type DocSubstituirTarget = {
  rowId: string;
  titulo: string;
  tipo_key: string;
  colaborador_id: string | null;
  colaborador_nome: string;
  /** MM/YYYY ou "—" */
  competencia: string;
  file_path: string | null;
  unidade_id?: string | null;
  unidade_nome?: string | null;
};


/** Converte "MM/YYYY" no formato aceito pelo input month (YYYY-MM). */
function competenciaParaInput(v: string) {
  const m = v.match(/^(\d{2})\/(\d{4})$/);
  return m ? `${m[2]}-${m[1]}` : "";
}

export function DocSubstituirDialog(props: {
  target: DocSubstituirTarget | null;
  companyId: string | null;
  colaboradores: { id: string; nome: string }[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { target, companyId, colaboradores } = props;
  const editavel = target ? podeEditarClassificacao(target.rowId) : false;

  const [file, setFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState("");
  const [colabId, setColabId] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setFile(null);
    setTipo(target.tipo_key);
    setColabId(target.colaborador_id ?? "");
    setCompetencia(competenciaParaInput(target.competencia));
    setMotivo("");
  }, [target]);

  const submit = async () => {
    if (!target || !companyId) return;
    if (!file) return toast.error("Selecione o novo arquivo");
    setSaving(true);
    try {
      await substituirDocumentoHistorico({
        rowId: target.rowId,
        companyId,
        filePathAtual: target.file_path,
        file,
        patch: editavel
          ? {
              tipo,
              colaborador_id: colabId || null,
              competencia: competencia || null,
            }
          : undefined,
        meta: {
          titulo: target.titulo,
          tipo: target.tipo_key,
          competencia: target.competencia,
          colaborador_id: target.colaborador_id,
          colaborador_nome: target.colaborador_nome,
          unidade_id: target.unidade_id ?? null,
          unidade_nome: target.unidade_nome ?? null,
          motivo: motivo.trim() || null,
        },
      });
      toast.success("Documento substituído");
      props.onDone();
      props.onOpenChange(false);

    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao substituir o documento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Replace className="h-5 w-5 text-primary" /> Substituir Documento
          </DialogTitle>
          <DialogDescription>
            {target
              ? `${docSourceConfig(target.rowId).label} · ${target.colaborador_nome} · ${target.competencia}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Novo Arquivo</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              O arquivo atual será apagado e a validação digital, se já concedida, voltará para "Aguardando".
            </p>
          </div>

          {editavel && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Colaborador</Label>
                <Select value={colabId} onValueChange={setColabId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {colaboradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Competência</Label>
                <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {DP_DOC_GRUPOS.map((g) => (
                      <SelectGroup key={g.grupo}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.tipos
                          .filter((t) => t.value !== "ferias" && t.value !== "sindicato")
                          .map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Motivo da Substituição</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: arquivo importado errado"
            />
            <p className="text-xs text-muted-foreground">
              O motivo fica registrado no log de alterações do documento.
            </p>
          </div>
        </div>


        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !file}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            Substituir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

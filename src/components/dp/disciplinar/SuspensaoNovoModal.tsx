import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registrarDisciplinar } from "@/lib/dp/colaborador-oficial";
import { notifyError } from "@/lib/notifyError";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DpDialogShell } from "@/components/dp/DpDialogShell";

/** Mesma tabela da tela Disciplinar (Art. 482 da CLT). */
const MOTIVOS = [
  "Atraso ou Falta Injustificada",
  "Insubordinação / Descumprimento de Ordem",
  "Indisciplina / Descumprimento de Normas Internas",
  "Mau Procedimento / Conduta Inadequada",
  "Desídia no Desempenho das Funções",
  "Ofensa ou Agressão a Colega ou Cliente",
  "Uso Indevido de Celular no Expediente",
  "Embriaguez em Serviço",
];
const REGIMES_EMPREGO = ["clt", "intermitente", "temporario", "aprendiz"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaboradorId: string;
  colaboradorNome: string;
  regime?: string | null;
  data: string;
}

/** Suspensão aberta sobre o calendário: grava pelo fluxo oficial e gera o modelo para assinatura. */
export function SuspensaoNovoModal({ open, onOpenChange, colaboradorId, colaboradorNome, regime, data }: Props) {
  const qc = useQueryClient();
  const [dataDoc, setDataDoc] = useState(data);
  const [dias, setDias] = useState("1");
  const [motivos, setMotivos] = useState<string[]>([]);
  const [outro, setOutro] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setDataDoc(data); setDias("1"); setMotivos([]); setOutro(""); setObs("");
  }, [open, data]);

  const semVinculo = !!regime && !REGIMES_EMPREGO.includes(regime.toLowerCase());

  const salvar = useMutation({
    mutationFn: async () => {
      const n = parseInt(dias || "0", 10);
      if (!Number.isFinite(n) || n < 1 || n > 30) throw new Error("Informe de 1 a 30 dias de suspensão.");
      const motivo = [...motivos, outro.trim()].filter(Boolean).join(" + ");
      if (!motivo) throw new Error("Selecione ou digite o motivo da suspensão.");
      if (!dataDoc) throw new Error("Informe a data do documento.");
      const id = await registrarDisciplinar({
        colaboradorId, tipo: "suspensao", data: dataDoc, motivo, descricao: obs.trim() || null, suspensaoDias: n,
      });
      const { data: pdf, error } = await supabase.functions.invoke("dp-generate-disciplinary-pdf", { body: { registro_id: id } });
      if (error || (pdf as any)?.error) return null;
      return (pdf as { signed_url?: string })?.signed_url ?? null;
    },
    onSuccess: (url) => {
      toast.success("Suspensão registrada", {
        description: "Imprima o modelo, colha a assinatura e depois importe a via assinada em Disciplinar.",
      });
      if (url) window.open(url, "_blank");
      qc.invalidateQueries({ queryKey: ["dp_disciplinar"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("suspens") });
      onOpenChange(false);
    },
    onError: (e) => notifyError(e, { surface: "Calendário", action: "registrar a suspensão", fallback: "Erro ao registrar" }),
  });

  return (
    <DpDialogShell
      open={open}
      onOpenChange={(v) => !salvar.isPending && onOpenChange(v)}
      icon={ShieldAlert}
      title="Suspensão Disciplinar"
      description={colaboradorNome}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvar.isPending}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || semVinculo}>
            {salvar.isPending ? "Salvando..." : "Registrar e Gerar Modelo"}
          </Button>
        </>
      }
    >
      {semVinculo ? (
        <p className="text-sm text-destructive">
          Esta pessoa não tem vínculo de emprego. Suspensão é poder disciplinar do empregador (Art. 2º e 3º da CLT).
        </p>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Data do documento *</Label>
              <Input type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Dias *</Label>
              <Input type="number" min={1} max={30} value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Máximo de 30 dias (Art. 474 da CLT). A suspensão começa no dia seguinte à data do documento.</p>
          <div className="grid gap-1.5">
            <Label>Motivo *</Label>
            {MOTIVOS.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={motivos.includes(m)}
                  onCheckedChange={(v) => setMotivos((cur) => (v ? [...cur, m] : cur.filter((x) => x !== m)))}
                />
                {m}
              </label>
            ))}
            <Input placeholder="Outro motivo (opcional)" maxLength={200} value={outro} onChange={(e) => setOutro(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Aplique pessoalmente: imprima o modelo, converse com o colaborador e colha a assinatura (ou de 2 testemunhas se ele recusar).
          </p>
        </div>
      )}
    </DpDialogShell>
  );
}

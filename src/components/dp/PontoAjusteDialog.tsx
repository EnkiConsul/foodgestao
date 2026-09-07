import { useState } from "react";
import { toast } from "sonner";
import { PencilLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDEM_MARCACOES, PONTO_TIPO_LABEL } from "@/lib/dp/ponto";
import {
  AJUSTE_ACAO_LABEL,
  useMeusAjustesPonto,
  type PontoAjusteAcao,
  type PontoTipoEnum,
} from "@/hooks/useDpPontoAjustes";

interface Props {
  colaboradorId: string;
  companyId: string;
  dataPadrao: string;
}

export function PontoAjusteDialog({ colaboradorId, companyId, dataPadrao }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(dataPadrao);
  const [tipo, setTipo] = useState<PontoTipoEnum>("entrada");
  const [acao, setAcao] = useState<PontoAjusteAcao>("incluir");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");

  const { solicitar } = useMeusAjustesPonto(colaboradorId);

  const enviar = () => {
    if (motivo.trim().length < 5) {
      toast.error("Descreva o motivo do ajuste.");
      return;
    }
    if (acao !== "excluir" && !/^[0-2]\d:[0-5]\d$/.test(hora)) {
      toast.error("Informe o horário no formato HH:MM.");
      return;
    }
    solicitar.mutate(
      { company_id: companyId, colaborador_id: colaboradorId, data, tipo, acao, hora_solicitada: hora || null, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast.success("Solicitação enviada para o DP.");
          setOpen(false);
          setMotivo("");
          setHora("");
        },
        onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível enviar a solicitação."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <PencilLine className="mr-2 h-4 w-4" />
          Solicitar Ajuste de Ponto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar Ajuste de Ponto</DialogTitle>
          <DialogDescription>O DP analisa o pedido antes de alterar o espelho.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ajuste-data">Dia</Label>
            <Input id="ajuste-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Marcação</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as PontoTipoEnum)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDEM_MARCACOES.map((t) => (
                    <SelectItem key={t} value={t}>{PONTO_TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ação</Label>
              <Select value={acao} onValueChange={(v) => setAcao(v as PontoAjusteAcao)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(AJUSTE_ACAO_LABEL) as PontoAjusteAcao[]).map((a) => (
                    <SelectItem key={a} value={a}>{AJUSTE_ACAO_LABEL[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {acao !== "excluir" && (
            <div className="space-y-1.5">
              <Label htmlFor="ajuste-hora">Horário correto</Label>
              <Input id="ajuste-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ajuste-motivo">Motivo</Label>
            <Textarea
              id="ajuste-motivo"
              rows={3}
              value={motivo}
              placeholder="Ex.: esqueci de bater a saída"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={solicitar.isPending}>Enviar Solicitação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

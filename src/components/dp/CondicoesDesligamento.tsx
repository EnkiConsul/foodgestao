import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOTIVO_DESLIGAMENTO_OPTIONS } from "@/lib/dp/desligamento";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";

/** Motivos sem aviso prévio: a data informada é o término do vínculo. */
export const SEM_AVISO = new Set(["dispensa_com_justa_causa", "termino_contrato", "abandono_emprego", "aposentadoria", "falecimento", "outro"]);
/** Sem aviso e sem regra automática: exigem confirmação informada do responsável. */
export const SEM_AVISO_ASSISTIDO = new Set(["abandono_emprego", "aposentadoria", "outro"]);

export type CondicoesValor = {
  motivo: string; modalidade: "trabalhado" | "indenizado"; reducao: "duas_horas" | "sete_dias"; comunicacao: string;
  terminoAcordado: string; descontar: boolean; pedidoEscrito: boolean; aceiteEmpresa: boolean; confirmacaoSemAviso: boolean;
};

/** Formulário de condições (registrar e alterar compartilham). */
export function CondicoesDesligamento({ v, set, comMotivo, planejamento = false }: {
  v: CondicoesValor;
  set: (p: Partial<CondicoesValor>) => void; comMotivo: boolean; planejamento?: boolean;
}) {
  const semAviso = SEM_AVISO.has(v.motivo);
  const pedido = v.motivo === "pedido_demissao";
  const pedidoDispensado = pedido && v.modalidade === "indenizado";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {comMotivo && (
        <div className="space-y-1">
          <Label>Motivo</Label>
          <Select value={v.motivo} onValueChange={(m) => set({ motivo: m })}>
            <SelectTrigger aria-label="Motivo"><SelectValue /></SelectTrigger>
            <SelectContent>{MOTIVO_DESLIGAMENTO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="desl-com">{semAviso ? "Data do término" : pedido ? "Data do pedido" : "Data da comunicação"}</Label>
        <Input id="desl-com" type="date" value={v.comunicacao} max={planejamento ? undefined : hojeIsoLocal()} onChange={(e) => set({ comunicacao: e.target.value })} />
      </div>
      {!semAviso && (
        <div className="space-y-1">
          <Label>{pedido ? "Cumprimento do aviso (30 dias)" : "Aviso"}</Label>
          <RadioGroup value={v.modalidade} onValueChange={(m) => set({ modalidade: m as "trabalhado" | "indenizado" })} className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="trabalhado" /> Trabalhado</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="indenizado" /> {pedido ? "Empresa dispensa o cumprimento" : "Indenizado"}</label>
          </RadioGroup>
        </div>
      )}
      {!semAviso && v.modalidade === "trabalhado" && v.motivo === "dispensa_sem_justa_causa" && (
        <div className="space-y-1">
          <Label>Redução escolhida pelo colaborador</Label>
          <RadioGroup value={v.reducao} onValueChange={(m) => set({ reducao: m as "duas_horas" | "sete_dias" })} className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="duas_horas" /> 2 horas por dia</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="sete_dias" /> 7 dias corridos no final</label>
          </RadioGroup>
        </div>
      )}
      {pedido && v.modalidade === "trabalhado" && (
        <p className="text-xs text-muted-foreground sm:col-span-2">No pedido de demissão não há redução de 2 horas nem de 7 dias (o art. 488 só vale para aviso dado pela empresa).</p>
      )}
      {v.motivo === "acordo_mutuo" && (
        <p className="text-xs text-muted-foreground sm:col-span-2">{v.modalidade === "indenizado"
          ? "Acordo mútuo com aviso indenizado: a lei reduz o aviso pela metade (art. 484-A, I, “a”)."
          : "Acordo mútuo com aviso trabalhado: 30 dias cumpridos, sem redução automática. A metade do art. 484-A vale só para o aviso indenizado; se as partes combinaram algo diferente, valide com o jurídico."}</p>
      )}
      {pedidoDispensado && (
        <div className="space-y-3 rounded-md border p-3 sm:col-span-2">
          <div className="space-y-1">
            <Label htmlFor="desl-term">Término acordado (vazio = na data do pedido)</Label>
            <Input id="desl-term" type="date" value={v.terminoAcordado} min={v.comunicacao} onChange={(e) => set({ terminoAcordado: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Desconto do aviso</Label>
            <RadioGroup value={v.descontar ? "com" : "sem"} onValueChange={(m) => set({ descontar: m === "com" })} className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="sem" /> Sem descontar</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="com" /> Descontar</label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">Dispensar o cumprimento é liberalidade da empresa e não exige prova de novo emprego. O desconto do aviso no pedido de demissão é tema controverso: confirme com a contabilidade ou o jurídico antes de aplicar.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={v.pedidoEscrito} onCheckedChange={(x) => set({ pedidoEscrito: x === true })} aria-label="Pedido escrito do colaborador" />
            <span>O colaborador pediu a demissão por escrito.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={v.aceiteEmpresa} onCheckedChange={(x) => set({ aceiteEmpresa: x === true })} aria-label="Aceite da empresa" />
            <span>A empresa aceitou dispensar o cumprimento do aviso{v.descontar ? ", com desconto" : ", sem descontar"}.</span>
          </label>
          <p className="text-xs text-muted-foreground">Guarde o pedido e o aceite no GED ou com a contabilidade; estas declarações não substituem a evidência.</p>
        </div>
      )}
      {semAviso && (
        <p className="text-xs text-muted-foreground sm:col-span-2">Sem aviso prévio neste motivo: a data informada é o término do vínculo e o prazo de quitação (10 dias) conta dela.</p>
      )}
      {SEM_AVISO_ASSISTIDO.has(v.motivo) && (
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <Checkbox checked={v.confirmacaoSemAviso} onCheckedChange={(x) => set({ confirmacaoSemAviso: x === true })} aria-label="Confirmação da data de término" />
          <span>Este motivo exige determinação factual ou jurídica (ex.: abandono caracterizado, aposentadoria que encerra o vínculo). Confirmo que a data de término foi validada com a contabilidade ou o jurídico.</span>
        </label>
      )}
    </div>
  );
}


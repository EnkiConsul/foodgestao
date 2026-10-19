/**
 * Exame admissional (ASO) na revisão do gestor: agendar (com link do Maps e
 * envio por WhatsApp), anexar o ASO feito ou dispensar com base legal.
 */
import { useEffect, useRef, useState } from "react";
import { CalendarClock, ExternalLink, FileUp, Loader2, MapPin, MessageSquare, ShieldAlert, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";
import {
  ASO_JUSTIFICATIVA_MIN, BASES_LEGAIS_DISPENSA, asoLiberaContabilidade, linkMapsValido, mensagemAgendamentoAso,
  type AsoDados, type AsoModo,
} from "@/lib/dp/aso-admissional";
import { linkWhatsapp } from "@/lib/dp/whatsapp-despacho";
import { abrirAsoPreadmissao, anexarAsoPreadmissao, salvarAsoPreadmissao } from "@/hooks/dp/useDpPreadmissoes";

type Props = {
  preadmissaoId: string;
  aso: AsoDados | null;
  candidatoNome: string;
  whatsapp?: string | null;
  cargo?: string;
  empresa?: string;
  encerrada: boolean;
  onSalvo: () => void;
};

export function AsoAdmissionalCard({ preadmissaoId, aso, candidatoNome, whatsapp, cargo, empresa, encerrada, onSalvo }: Props) {
  const [modo, setModo] = useState<AsoModo>(aso?.modo ?? "agendado");
  const [f, setF] = useState<AsoDados>(aso ?? {});
  const [ciente, setCiente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setF(aso ?? {}); setModo(aso?.modo ?? "agendado"); setCiente(false); }, [aso]);

  const set = (k: keyof AsoDados, v: string) => setF((x) => ({ ...x, [k]: v }));
  const liberado = asoLiberaContabilidade(aso);
  const mapsOk = linkMapsValido(f.maps_url ?? "");

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarAsoPreadmissao(preadmissaoId, { ...f, modo, ciente });
      toast.success(modo === "dispensado" ? "Dispensa registrada no histórico." : "Exame admissional salvo.");
      onSalvo();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar o exame admissional" });
    } finally { setSalvando(false); }
  };

  const anexar = async (arq: File) => {
    setAnexando(true);
    try {
      await anexarAsoPreadmissao(preadmissaoId, arq);
      toast.success("ASO anexado. Ele entra no pacote da contabilidade.");
      onSalvo();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "anexar o ASO" });
    } finally { setAnexando(false); }
  };

  const enviarWhatsapp = () => {
    const link = linkWhatsapp(whatsapp ?? "", mensagemAgendamentoAso({ nome: candidatoNome, cargo, empresa, aso: f }));
    if (!link) { toast.error("O candidato não tem WhatsApp válido na ficha."); return; }
    window.open(link, "_blank", "noopener");
  };

  const OPCOES: Array<{ v: AsoModo; rotulo: string; icone: typeof CalendarClock }> = [
    { v: "agendado", rotulo: "Agendar", icone: CalendarClock },
    { v: "realizado", rotulo: "Anexar ASO", icone: Stethoscope },
    { v: "dispensado", rotulo: "Dispensar", icone: ShieldAlert },
  ];

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Exame admissional (ASO)</p>
        {liberado
          ? <Badge variant="outline" className="border-primary/40 text-primary">Liberado para a contabilidade</Badge>
          : <Badge variant="secondary">Pendente</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        Obrigatório antes do início das atividades (NR-7 e art. 168 da CLT). O envio à contabilidade só é liberado com
        o ASO Apto anexado ou com a dispensa formalizada.
      </p>

      <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1" role="tablist">
        {OPCOES.map(({ v, rotulo, icone: I }) => (
          <button key={v} type="button" role="tab" aria-selected={modo === v} disabled={encerrada}
            onClick={() => setModo(v)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium ${modo === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            <I className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </div>

      {modo === "agendado" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Clínica ou local</Label>
            <Input value={f.clinica ?? ""} onChange={(e) => set("clinica", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Endereço</Label>
            <Input value={f.endereco ?? ""} onChange={(e) => set("endereco", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Link do Google Maps</Label>
            <div className="flex gap-2">
              <Input inputMode="url" placeholder="https://maps.app.goo.gl/..." value={f.maps_url ?? ""}
                onChange={(e) => set("maps_url", e.target.value.trim())} aria-invalid={!mapsOk} />
              <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={!f.maps_url || !mapsOk}
                onClick={() => window.open(f.maps_url, "_blank", "noopener")} aria-label="Testar link do mapa">
                <MapPin className="h-4 w-4" />
              </Button>
            </div>
            {!mapsOk && <p className="text-xs text-destructive">Cole um link do Google Maps.</p>}
            <p className="text-xs text-muted-foreground">No Maps, toque em Compartilhar e copie o link.</p>
          </div>
          <div className="space-y-1"><Label className="text-xs">Data</Label>
            <Input type="date" value={f.data ?? ""} onChange={(e) => set("data", e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Horário</Label>
            <Input type="time" value={f.hora ?? ""} onChange={(e) => set("hora", e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Telefone da clínica</Label>
            <Input inputMode="tel" value={f.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Orientações ao candidato</Label>
            <Textarea rows={2} placeholder="Ex.: jejum de 4 horas, levar óculos se usar." value={f.orientacoes ?? ""}
              onChange={(e) => set("orientacoes", e.target.value)} /></div>
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <Button disabled={encerrada || salvando || !f.clinica || !f.data || !mapsOk} onClick={() => void salvar()}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar Agendamento
            </Button>
            <Button variant="outline" disabled={aso?.modo !== "agendado"} onClick={enviarWhatsapp}>
              <MessageSquare className="mr-2 h-4 w-4" /> Enviar ao Candidato pelo WhatsApp
            </Button>
          </div>
        </div>
      )}

      {modo === "realizado" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1"><Label className="text-xs">Data do exame</Label>
            <Input type="date" value={f.data_realizacao ?? ""} onChange={(e) => set("data_realizacao", e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Resultado</Label>
            <Select value={f.parecer ?? ""} onValueChange={(v) => set("parecer", v)}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent><SelectItem value="apto">Apto</SelectItem><SelectItem value="inapto">Inapto</SelectItem></SelectContent>
            </Select></div>
          <div className="space-y-1"><Label className="text-xs">Médico</Label>
            <Input value={f.medico ?? ""} onChange={(e) => set("medico", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1"><Label className="text-xs">CRM</Label>
            <Input value={f.crm ?? ""} onChange={(e) => set("crm", e.target.value.toUpperCase())} /></div>
          {f.parecer === "inapto" && (
            <p className="text-xs text-destructive sm:col-span-2">Candidato inapto não pode seguir para o registro.</p>
          )}
          <input ref={arquivoRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void anexar(a); }} />
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <Button disabled={encerrada || salvando || !f.data_realizacao || !f.parecer} onClick={() => void salvar()}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar Resultado
            </Button>
            <Button variant="outline" disabled={encerrada || anexando || aso?.modo !== "realizado"} onClick={() => arquivoRef.current?.click()}>
              {anexando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {aso?.arquivo_path ? "Trocar Arquivo do ASO" : "Anexar Arquivo do ASO"}
            </Button>
            {aso?.arquivo_path && (
              <Button variant="ghost" onClick={async () => {
                try { window.open((await abrirAsoPreadmissao(preadmissaoId)).url, "_blank", "noopener"); }
                catch (e) { notifyError(e as Error, { surface: "Pessoas 360°", action: "abrir o ASO" }); }
              }}><ExternalLink className="mr-2 h-4 w-4" /> Ver ASO</Button>
            )}
          </div>
          {aso?.modo !== "realizado" && <p className="text-xs text-muted-foreground sm:col-span-2">Salve o resultado para anexar o arquivo.</p>}
        </div>
      )}

      {modo === "dispensado" && (
        <div className="space-y-2">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            A dispensa do ASO é restrita às hipóteses da NR-1 (item 1.8.4) e da NR-7. A dispensa indevida gera autuação
            fiscal e risco trabalhista. Só o dono ou um administrador da empresa pode registrá-la, e ela fica no histórico.
          </div>
          <div className="space-y-1"><Label className="text-xs">Base legal</Label>
            <Select value={f.base_legal ?? ""} onValueChange={(v) => set("base_legal", v)}>
              <SelectTrigger><SelectValue placeholder="Escolha a base legal" /></SelectTrigger>
              <SelectContent>{BASES_LEGAIS_DISPENSA.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label className="text-xs">Justificativa</Label>
            <Textarea rows={3} value={f.justificativa ?? ""} onChange={(e) => set("justificativa", e.target.value)} />
            <p className="text-xs text-muted-foreground">Mínimo de {ASO_JUSTIFICATIVA_MIN} caracteres.</p></div>
          <div className="flex items-start gap-2">
            <Checkbox id="aso-ciente" checked={ciente} onCheckedChange={(v) => setCiente(v === true)} />
            <Label htmlFor="aso-ciente" className="text-sm font-normal leading-snug">
              Declaro que a empresa atende aos requisitos legais de dispensa e assumo a responsabilidade técnica e jurídica pela decisão.
            </Label>
          </div>
          <Button variant="destructive" disabled={encerrada || salvando || !ciente || !f.base_legal || (f.justificativa ?? "").trim().length < ASO_JUSTIFICATIVA_MIN}
            onClick={() => void salvar()}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar Dispensa
          </Button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { FileSignature, History, PenLine, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDefinirModoAssinatura, useDpDocsAguardandoCelular, useDpModoAssinatura } from "@/hooks/useDpModoAssinatura";
import {
  hojeBrasilia, ROTULO_MODO, situacaoModoAssinatura, type ModoAssinatura,
} from "@/lib/dp/modo-assinatura";
import { cn } from "@/lib/utils";

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Selo curto para listas e cabeçalhos: só aparece para quem assina em papel. */
export function AssinaturaPapelBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 border-warning/50 bg-warning/10 text-warning-foreground", className)}>
      <FileSignature className="h-3 w-3" aria-hidden="true" />
      Assina em papel
    </Badge>
  );
}

/**
 * Como o colaborador assina os documentos: celular (portal) ou papel (via
 * impressa). Cada troca vale a partir de uma data e fica no histórico; quem
 * decide em cada documento novo é o servidor, no momento da emissão.
 */
export function ModoAssinaturaCard({
  colaboradorId,
  dataAdmissao,
  semAcesso,
}: {
  colaboradorId: string;
  dataAdmissao?: string | null;
  /** Sem WhatsApp/e-mail de acesso: sugere papel ao abrir a troca. */
  semAcesso?: boolean;
}) {
  const historico = useDpModoAssinatura(colaboradorId);
  const definir = useDefinirModoAssinatura();
  const hoje = hojeBrasilia();
  const situacao = useMemo(() => situacaoModoAssinatura(historico.data ?? [], hoje), [historico.data, hoje]);
  const [editando, setEditando] = useState(false);
  const [modo, setModo] = useState<ModoAssinatura>("fisica");
  const [desde, setDesde] = useState(hoje);
  const [motivo, setMotivo] = useState("");
  const [converter, setConverter] = useState(true);
  const [verHistorico, setVerHistorico] = useState(false);

  const minimo = dataAdmissao ? dataAdmissao.slice(0, 10) : undefined;
  const papelJa = modo === "fisica" && !!desde && desde <= hoje;
  const pendentes = useDpDocsAguardandoCelular(colaboradorId, editando && papelJa);

  useEffect(() => {
    if (!editando) return;
    const proximo: ModoAssinatura = situacao.atual === "fisica" ? "digital" : "fisica";
    setModo(proximo);
    // Vale a partir de hoje (ou da admissão, se ela ainda não chegou).
    const adm = dataAdmissao?.slice(0, 10) ?? null;
    setDesde(adm && adm > hoje ? adm : hoje);
    setMotivo(proximo === "fisica" && semAcesso ? "Não tem celular para assinar pelo portal" : "");
    setConverter(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  const salvar = async () => {
    if (!desde) { toast.warning("Informe a partir de quando vale."); return; }
    try {
      const r = await definir.mutateAsync({
        colaboradorId, modo, vigenteDesde: desde, motivo: motivo.trim() || null,
        converterPendentes: papelJa && converter,
      });
      if (r.sem_mudanca) toast.info("Nada mudou: esse modo já vale nessa data.");
      else {
        toast.success(
          modo === "fisica"
            ? `Assinatura em papel a partir de ${dataBR(desde)}.${r.convertidos > 0 ? ` ${r.convertidos} documento(s) passaram para a via impressa.` : ""}`
            : `Assinatura pelo celular a partir de ${dataBR(desde)}.`,
        );
      }
      setEditando(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar agora.");
    }
  };

  const Icone = situacao.atual === "fisica" ? FileSignature : Smartphone;

  return (
    <div className="space-y-3 rounded-lg border p-4" id="modo-assinatura">
      <div className="flex items-start gap-3">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          situacao.atual === "fisica" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-primary",
        )}>
          <Icone className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Assinatura de documentos</p>
          {historico.isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <p className="text-sm">
                {ROTULO_MODO[situacao.atual]}
                {situacao.desde && <span className="text-muted-foreground"> · desde {dataBR(situacao.desde)}</span>}
              </p>
              {situacao.proxima && (
                <p className="text-xs text-muted-foreground">
                  A partir de {dataBR(situacao.proxima.desde)}: {ROTULO_MODO[situacao.proxima.modo].toLowerCase()}.
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {situacao.atual === "fisica"
                  ? "Documentos novos não vão para o celular: imprima, colha a assinatura à mão e anexe a via assinada. O recibo pelo link do WhatsApp continua possível como exceção."
                  : "Documentos novos vão para o portal e o colaborador assina pelo celular."}
              </p>
            </>
          )}
        </div>
        {!editando && (
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setEditando(true)}>
            <PenLine className="mr-1 h-4 w-4" aria-hidden="true" />Alterar
          </Button>
        )}
      </div>

      {editando && (
        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <RadioGroup value={modo} onValueChange={(v) => setModo(v as ModoAssinatura)} className="grid gap-2 sm:grid-cols-2">
            {(["digital", "fisica"] as ModoAssinatura[]).map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border bg-background p-3 text-sm">
                <RadioGroupItem value={m} className="mt-0.5" />
                <span>
                  <span className="font-medium">{ROTULO_MODO[m]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m === "digital" ? "Assina no portal, pelo celular." : "Não tem celular ou prefere assinar à mão."}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`modo-desde-${colaboradorId}`}>Vale a partir de</Label>
              <Input
                id={`modo-desde-${colaboradorId}`}
                type="date"
                className="h-11"
                value={desde}
                min={minimo}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`modo-motivo-${colaboradorId}`}>Motivo (opcional)</Label>
              <Input
                id={`modo-motivo-${colaboradorId}`}
                className="h-11"
                value={motivo}
                maxLength={500}
                placeholder="Ex.: não tem celular"
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O que for emitido antes dessa data continua como foi emitido. Documentos já assinados nunca mudam.
          </p>
          {papelJa && (pendentes.data ?? 0) > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <Checkbox checked={converter} onCheckedChange={(v) => setConverter(v === true)} className="mt-0.5" />
              <span>
                Passar também {pendentes.data === 1 ? "o documento que espera" : `os ${pendentes.data} documentos que esperam`} assinatura no celular para a via impressa
                <span className="block text-xs text-muted-foreground">Eles saem da cobrança do portal e passam a pedir a via assinada.</span>
              </span>
            </label>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => setEditando(false)} disabled={definir.isPending}>
              Cancelar
            </Button>
            <Button type="button" className="h-11 sm:h-9" onClick={salvar} disabled={definir.isPending}>
              {definir.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}

      {(historico.data ?? []).length > 0 && (
        <div>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary"
            onClick={() => setVerHistorico((v) => !v)}
            aria-expanded={verHistorico}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {verHistorico ? "Ocultar histórico" : `Ver histórico (${historico.data!.length})`}
          </button>
          {verHistorico && (
            <ul className="mt-1 space-y-1">
              {historico.data!.map((h) => (
                <li key={h.id ?? h.created_at} className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-medium">{ROTULO_MODO[h.modo]}</span> a partir de {dataBR(h.vigente_desde)}
                  <span className="block text-muted-foreground">
                    Registrado em {new Date(h.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {h.origem === "importacao_ficha" ? " · na importação de fichas" : ""}
                    {(h.documentos_convertidos ?? 0) > 0 ? ` · ${h.documentos_convertidos} documento(s) passaram para o papel` : ""}
                    {h.motivo ? ` · ${h.motivo}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

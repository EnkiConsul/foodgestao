import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatBR, parseYMD } from "@/lib/dp/folga-rules";
import {
  abrirDocumentoFoto, useDecidirSubstituicao, useDpSubstituicoesGestor, type Substituicao,
} from "@/hooks/useDpSubstituicoes";

const cpfFmt = (v: string | null) =>
  v && v.length === 11 ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}` : v ?? "—";

/** Fila do gestor: folguistas indicados por intermitentes/freelancers para assumir um plantão. */
export function SubstituicoesAprovacao() {
  const lista = useDpSubstituicoesGestor();
  const decidir = useDecidirSubstituicao();
  const [aberta, setAberta] = useState<Substituicao | null>(null);
  const [motivo, setMotivo] = useState("");
  const itens = lista.data ?? [];
  if (itens.length === 0) return null;

  const fechar = () => { setAberta(null); setMotivo(""); };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="h-4 w-4" /> Folguistas indicados para substituição
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">{itens.length}</Badge>
      </p>
      {itens.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setAberta(s)}
          className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-left hover:bg-muted/50"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{s.terceiro_nome}</p>
            <p className="text-xs text-muted-foreground">
              No lugar de {s.solicitante?.nome} · {s.convocacao ? formatBR(parseYMD(s.convocacao.data)) : ""}
            </p>
          </div>
          <Badge variant="outline" className="border-amber-500/50 text-[11px]">Aguardando sua aprovação</Badge>
        </button>
      ))}

      <Dialog open={!!aberta} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Substituição de plantão</DialogTitle>
            <DialogDescription>
              {aberta?.solicitante?.nome} indicou um folguista para {aberta?.convocacao ? formatBR(parseYMD(aberta.convocacao.data)) : ""}
              {aberta?.convocacao ? ` (${String(aberta.convocacao.entrada).slice(0, 5)}–${String(aberta.convocacao.saida).slice(0, 5)})` : ""}.
            </DialogDescription>
          </DialogHeader>
          {aberta && (
            <div className="grid gap-2 text-sm">
              <p><strong>Nome:</strong> {aberta.terceiro_nome}</p>
              <p><strong>CPF:</strong> {cpfFmt(aberta.terceiro_cpf)}</p>
              <p><strong>WhatsApp:</strong> {aberta.terceiro_telefone}</p>
              <p>
                <strong>Pagamento:</strong>{" "}
                {aberta.pix_chave ? `Pix (${aberta.pix_tipo}) ${aberta.pix_chave}` : ""}
                {aberta.conta ? ` ${aberta.banco_nome ?? ""} ag. ${aberta.agencia} cc. ${aberta.conta}${aberta.conta_digito ? `-${aberta.conta_digito}` : ""}` : ""}
              </p>
              {aberta.motivo ? <p><strong>Motivo:</strong> {aberta.motivo}</p> : null}
              {aberta.documento_foto_path ? (
                <Button variant="outline" size="sm" className="w-fit" onClick={() => void abrirDocumentoFoto(aberta.documento_foto_path!)}>
                  Ver documento com foto
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Ao aprovar, o folguista é cadastrado (ou atualizado) em Folguistas com esses dados e assume o plantão.
              </p>
              <Textarea rows={2} placeholder="Motivo (obrigatório para recusar)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={decidir.isPending || motivo.trim().length < 5}
              onClick={() => aberta && decidir.mutate({ id: aberta.id, aprovar: false, motivo }, { onSuccess: fechar })}
            >
              Recusar
            </Button>
            <Button
              disabled={decidir.isPending}
              onClick={() => aberta && decidir.mutate({ id: aberta.id, aprovar: true, motivo }, { onSuccess: fechar })}
            >
              Aprovar e cadastrar folguista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Ficha do colaborador: endereço, dados bancários e contatos de emergência
 * (com a confirmação semestral feita pelo colaborador no portal).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Home, Landmark, Loader2, MessageCircle, Phone, Send, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { notifyError } from "@/lib/notifyError";
import { maskPhone } from "@/lib/phone";
import { CONTA_TIPOS, PIX_TIPOS } from "@/lib/dp/dadosPagamento";
import {
  confirmacaoVencida, contatosValidos, rotuloParentescoEmergencia, type ContatoEmergencia,
} from "@/lib/dp/contatosEmergencia";
import { ContatosEmergenciaEditor, limparContatos } from "./ContatosEmergenciaEditor";

const ESTADO_CIVIL: Record<string, string> = {
  solteiro: "Solteiro(a)", casado: "Casado(a)", divorciado: "Divorciado(a)", viuvo: "Viúvo(a)",
  uniao_estavel: "União estável", separado: "Separado(a)",
};

function Item({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value || "—"}</p>
    </div>
  );
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

export function ColaboradorDadosPessoaisCard({ colaboradorId }: { colaboradorId?: string | null }) {
  const qc = useQueryClient();
  const chave = ["dp-colab-dados-pessoais", colaboradorId];
  const { data: c } = useQuery({
    queryKey: chave,
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_colaboradores").select("*").eq("id", colaboradorId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, any> | null;
    },
  });
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<ContatoEmergencia[]>([]);
  const [salvando, setSalvando] = useState(false);

  if (!c) return null;
  const end = (c.endereco ?? {}) as Record<string, string>;
  const contatos = (Array.isArray(c.contatos_emergencia) ? c.contatos_emergencia : []) as ContatoEmergencia[];
  const vencida = confirmacaoVencida(c.contatos_confirmados_em, c.contatos_solicitado_em);

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc(fn, args);
      if (error) throw error;
      toast.success(ok);
      setEditando(false);
      qc.invalidateQueries({ queryKey: chave });
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "atualizar os contatos de emergência" });
    } finally {
      setSalvando(false);
    }
  };

  const linhaEndereco = [end.logradouro, end.numero, end.complemento].filter(Boolean).join(", ");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Home className="h-4 w-4 text-primary" /> Dados Pessoais e Endereço</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Nome social" value={c.nome_social} />
          <Item label="Estado civil" value={ESTADO_CIVIL[c.estado_civil] ?? c.estado_civil} />
          <Item label="PIS / PASEP / NIS" value={c.pis_nit} />
          <Item label="Cidade / UF de nascimento" value={[c.naturalidade, c.naturalidade_uf].filter(Boolean).join(" / ")} />
          <Item label="Endereço" value={linhaEndereco || end.texto} />
          <Item label="Bairro" value={end.bairro} />
          <Item label="Cidade / UF" value={[end.cidade, end.uf].filter(Boolean).join(" / ")} />
          <Item label="CEP" value={end.cep} />
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4 text-primary" /> Dados Bancários e Pix</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Banco" value={c.banco_nome} />
          <Item label="Tipo de conta" value={CONTA_TIPOS.find((t) => t.value === c.conta_tipo)?.label ?? c.conta_tipo} />
          <Item label="Agência" value={c.agencia} />
          <Item label="Conta" value={[c.conta, c.conta_digito].filter(Boolean).join("-")} />
          <Item label="Tipo de chave Pix" value={PIX_TIPOS.find((t) => t.value === c.pix_tipo)?.label ?? c.pix_tipo} />
          <Item label="Chave Pix" value={c.pix_chave} />
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4 text-primary" /> Contatos de Emergência</h3>
          {contatos.length > 0 && !vencida ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">Confirmados em {fmt(c.contatos_confirmados_em)}</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700">
              {c.contatos_solicitado_em ? "Confirmação solicitada ao colaborador" : contatos.length ? "Confirmação pendente (mais de 6 meses)" : "Sem contato cadastrado"}
            </Badge>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setRascunho(contatos); setEditando(true); }}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
            {!c.contatos_solicitado_em && (
              <Button size="sm" variant="outline" disabled={salvando}
                onClick={() => rpc("dp_contatos_solicitar_confirmacao", { _colaborador_id: c.id }, "O colaborador verá o pedido ao abrir o portal.")}>
                <Send className="h-4 w-4 mr-1" /> Solicitar Confirmação
              </Button>
            )}
          </div>
        </div>
        {contatos.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {contatos.map((k, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{k.nome}</p>
                  <p className="text-xs text-muted-foreground">{rotuloParentescoEmergencia(k.parentesco)} · {maskPhone(k.whatsapp)}</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`https://wa.me/55${k.whatsapp.replace(/^55/, "")}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp">
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum contato de emergência cadastrado.</p>
        )}
        <p className="text-xs text-muted-foreground">A cada 6 meses o colaborador confirma pelo portal o próprio WhatsApp e estes contatos.</p>
      </section>

      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Contatos de Emergência</DialogTitle>
            <DialogDescription>Informe de 1 a 2 contatos com nome, parentesco e WhatsApp.</DialogDescription>
          </DialogHeader>
          <ContatosEmergenciaEditor value={rascunho} onChange={setRascunho} />
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={salvando || !contatosValidos(limparContatos(rascunho))}
              onClick={() => rpc("dp_contatos_salvar", { _colaborador_id: c.id, _contatos: limparContatos(rascunho), _confirmar: false }, "Contatos salvos.")}>
              Salvar
            </Button>
            <Button disabled={salvando || !contatosValidos(limparContatos(rascunho))}
              onClick={() => rpc("dp_contatos_salvar", { _colaborador_id: c.id, _contatos: limparContatos(rascunho), _confirmar: true }, "Contatos salvos e confirmados.")}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Salvar e Confirmar com o Colaborador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";
import { useCliente360Detalhe } from "@/hooks/useCliente360";
import { useExemptSubscription, useRemoveExemption, useStartGrace } from "@/hooks/useBilling";
import {
  C360Assinatura, C360Conta, MODULOS, STATUS_LABEL, assinaturaDoModulo, brl, dataBR, emCortesia, fimDoDiaBR,
  idCurto, mrrPotencial, semAcessoV2,
} from "@/lib/admin/cliente360";

const MOTIVOS = [
  ["base_anterior", "Base anterior (sem prazo)"], ["parceria", "Parceria"], ["piloto", "Piloto"],
  ["compensacao", "Compensação"], ["comercial", "Comercial"], ["outro", "Outro"],
] as const;

type Acao = { tipo: "cortesia" | "revogar" | "carencia"; sub: C360Assinatura } | null;

export function Cliente360Drawer({ conta, onClose }: { conta: C360Conta | null; onClose: () => void }) {
  const qc = useQueryClient();
  const det = useCliente360Detalhe(conta?.id ?? null);
  const [acao, setAcao] = useState<Acao>(null);
  const [motivoCod, setMotivoCod] = useState("outro");
  const [texto, setTexto] = useState("");
  const [ate, setAte] = useState("");
  const [interna, setInterna] = useState(false);
  const exempt = useExemptSubscription();
  const revoke = useRemoveExemption();
  const grace = useStartGrace();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-cliente360"] });
    qc.invalidateQueries({ queryKey: ["admin-cliente360-detalhe"] });
  };

  const marcar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_cliente360_marcar_interna" as any, {
        _account: conta!.id, _interna: !conta!.is_internal, _motivo: texto,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(conta!.is_internal ? "Marcação de conta interna removida" : "Conta marcada como interna"); refresh(); fechar(); },
    onError: (e) => notifyError(e, { surface: "Sistema", action: "marcar a conta", fallback: "Não foi possível alterar a marcação" }),
  });

  const fechar = () => { setAcao(null); setInterna(false); setTexto(""); setAte(""); setMotivoCod("outro"); };
  const motivoOk = texto.trim().length >= 10;
  const dataOk = motivoCod === "base_anterior" || (!!ate && new Date(fimDoDiaBR(ate)) > new Date());

  const confirmar = async () => {
    if (!acao) return;
    try {
      if (acao.tipo === "cortesia") {
        await exempt.mutateAsync({
          subscriptionId: acao.sub.id, planId: acao.sub.plan_id, // cortesia nunca altera o plano
          mode: motivoCod === "base_anterior" ? "permanent" : "until",
          exemptUntil: motivoCod === "base_anterior" ? null : fimDoDiaBR(ate),
          reason: texto.trim(), motivoCodigo: motivoCod,
        });
      } else if (acao.tipo === "revogar") {
        await revoke.mutateAsync({ subscriptionId: acao.sub.id, reason: texto.trim() });
      } else {
        await grace.mutateAsync({ subscriptionId: acao.sub.id, reason: texto.trim() });
      }
      refresh(); fechar();
    } catch { /* erro já exibido pelo hook */ }
  };

  const ocupado = exempt.isPending || revoke.isPending || grace.isPending || marcar.isPending;

  return (
    <Sheet open={!!conta} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        {conta && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {conta.nome}
                <Badge variant="outline">{conta.tipo === "grupo" ? "Grupo" : "Empresa"}</Badge>
                {conta.is_internal && <Badge variant="secondary">Interna</Badge>}
                {semAcessoV2(conta) && <Badge variant="destructive">Sem acesso no modelo V2</Badge>}
              </SheetTitle>
              <SheetDescription>
                {conta.documento ? `Documento ${idCurto(conta.documento, conta.id)} · ` : ""}
                MRR potencial {conta.is_internal ? "fora (conta interna)" : brl(mrrPotencial(conta))} · cadastro {dataBR(conta.created_at)}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => setInterna(true)}>
                {conta.is_internal ? "Remover marcação de conta interna" : "Marcar como conta interna"}
              </Button>
              {conta.is_internal && conta.internal_reason && (
                <p className="mt-1 text-xs text-muted-foreground">Motivo: {conta.internal_reason} ({dataBR(conta.internal_marked_at)})</p>
              )}
            </div>

            <Tabs defaultValue="modulos" className="mt-4">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="empresas">Empresas</TabsTrigger>
                <TabsTrigger value="modulos">Módulos e planos</TabsTrigger>
                <TabsTrigger value="concessoes">Concessões</TabsTrigger>
                <TabsTrigger value="faturas">Faturas</TabsTrigger>
                <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
                <TabsTrigger value="usuarios">Usuários</TabsTrigger>
              </TabsList>

              <TabsContent value="empresas" className="space-y-2">
                {conta.empresas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa ativa nesta conta.</p>}
                {conta.empresas.map((e) => (
                  <div key={e.id} className="rounded border p-3 text-sm">
                    <div className="font-medium">{e.nome} <span className="text-muted-foreground">({idCurto(e.cnpj, e.id)})</span></div>
                    {e.fantasia && e.fantasia !== e.nome && <div className="text-xs text-muted-foreground">{e.fantasia}</div>}
                    <div className="text-xs text-muted-foreground">Na conta desde {dataBR(e.desde)}</div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="modulos" className="space-y-3">
                {conta.empresas.length > 0 && conta.assinaturas.length === 0 && (
                  <p className="text-sm">Status: <Badge variant="outline">Sem assinatura</Badge></p>
                )}
                {MODULOS.map((m) => {
                  const s = assinaturaDoModulo(conta, m.key);
                  return (
                    <div key={m.key} className="rounded border p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{m.label}</span>
                        {s ? <Badge variant={s.status === "canceled" || s.status === "expired" ? "destructive" : "outline"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                          : <Badge variant="outline">Sem assinatura</Badge>}
                      </div>
                      {s && (
                        <>
                          <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                            <span>Plano: {s.plano}</span>
                            <span>Ciclo: {s.billing_cycle ?? "—"}</span>
                            <span>Valor mensal potencial: {brl(s.mrr_cents)}</span>
                            <span>Período até: {dataBR(s.current_period_end)}</span>
                            {emCortesia(s) && <span>Cortesia: {s.exempt_until ? `até ${dataBR(s.exempt_until)}` : "sem prazo"}</span>}
                            {s.status === "grace" && <span>Carência até {dataBR(s.grace_ends_at)}</span>}
                            {m.key === "pessoas" && <span>Colaboradores: {s.colab_uso ?? conta.colaboradores_ativos} / {s.colab_limite ?? "—"}</span>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "cortesia", sub: s })}>Conceder cortesia</Button>
                            {s.is_exempt && <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "revogar", sub: s })}>Revogar cortesia</Button>}
                            {s.status === "active" && !s.is_exempt && (
                              <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "carencia", sub: s })}>Iniciar carência</Button>
                            )}
                            <Button size="sm" variant="ghost" asChild><Link to="/admin/assinaturas">Alterar plano / cancelar</Link></Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="concessoes" className="space-y-2 text-sm">
                {(det.data?.concessoes ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma concessão registrada.</p>}
                {(det.data?.concessoes ?? []).map((g: any) => (
                  <div key={g.id} className="rounded border p-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge variant={g.revoked_at ? "outline" : "secondary"}>{g.revoked_at ? "Histórico" : "Vigente"}</Badge>
                      <span className="font-medium">{g.tipo}</span>
                      <span className="text-muted-foreground">{g.module}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Motivo: {g.motivo_codigo}{g.motivo_texto ? ` — ${g.motivo_texto}` : ""} · início {dataBR(g.starts_at)} · fim {g.ends_at ? dataBR(g.ends_at) : "sem prazo"}
                      {g.revoked_at && ` · revogada em ${dataBR(g.revoked_at)}${g.revoke_reason ? ` (${g.revoke_reason})` : ""}`}
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="faturas" className="space-y-2 text-sm">
                {(det.data?.faturas ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma fatura.</p>}
                {(det.data?.faturas ?? []).map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between rounded border p-2">
                    <span>{dataBR(f.due_date)} · {brl(f.amount_cents)} · {f.status}</span>
                    {f.url && ["open", "overdue"].includes(f.status) && (
                      <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(f.url); toast.success("Link de pagamento copiado"); }}>
                        Copiar link de pagamento
                      </Button>
                    )}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="timeline" className="space-y-1 text-xs">
                {(det.data?.eventos ?? []).length === 0 && <p className="text-muted-foreground">Sem eventos.</p>}
                {(det.data?.eventos ?? []).map((e: any, i: number) => (
                  <div key={i} className="border-b py-1">
                    <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                    {" · "}<span className="font-medium">{e.tipo}</span>
                    {e.module && <span className="text-muted-foreground"> ({e.module})</span>}
                    {e.ator && <span className="text-muted-foreground"> — {e.ator}</span>}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="usuarios" className="space-y-2 text-sm">
                <div>Titular: <span className="font-medium">{conta.titular?.nome ?? "—"}</span></div>
                {conta.admins.map((a) => <div key={a.user_id}>{a.nome ?? "—"} <span className="text-muted-foreground">({a.role})</span></div>)}
                <p className="text-muted-foreground">
                  {conta.colaboradores_portal} colaborador(es) com acesso ao portal nas empresas desta conta · {conta.colaboradores_ativos} colaborador(es) ativos.
                </p>
              </TabsContent>
            </Tabs>
          </>
        )}

        <Dialog open={!!acao || interna} onOpenChange={(o) => !o && fechar()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {interna ? (conta?.is_internal ? "Remover marcação de conta interna" : "Marcar como conta interna")
                  : acao?.tipo === "cortesia" ? "Conceder cortesia" : acao?.tipo === "revogar" ? "Revogar cortesia" : "Iniciar carência"}
              </DialogTitle>
              <DialogDescription>
                {interna ? "Contas internas ficam fora do total de clientes e do MRR potencial."
                  : acao?.tipo === "cortesia" ? "O plano atual é mantido. A cortesia vale até 23:59:59 da data escolhida."
                  : "A carência termina às 23:59:59 do último dia, conforme o prazo configurado."}
              </DialogDescription>
            </DialogHeader>
            {acao?.tipo === "cortesia" && (
              <div className="space-y-3">
                <div><Label>Motivo</Label>
                  <Select value={motivoCod} onValueChange={setMotivoCod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MOTIVOS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {motivoCod !== "base_anterior" && (
                  <div><Label>Data de término</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
                )}
              </div>
            )}
            <div><Label>Justificativa (mínimo 10 caracteres)</Label><Textarea value={texto} onChange={(e) => setTexto(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button
                disabled={ocupado || !motivoOk || (acao?.tipo === "cortesia" && !dataOk)}
                onClick={() => (interna ? marcar.mutate() : confirmar())}
              >Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

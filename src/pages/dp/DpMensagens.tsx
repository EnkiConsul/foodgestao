import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Mail, Send, Search, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useDpMensagens } from "@/hooks/useDpComunicacao";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { toast } from "sonner";

type Modo = "direta" | "broadcast";

export default function DpMensagens() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { data: mensagens = [], isLoading, send, remove } = useDpMensagens();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<any | null>(null);
  const [tab, setTab] = useState<"enviadas" | "recebidas">("enviadas");
  const [search, setSearch] = useState("");
  const [modo, setModo] = useState<Modo>("direta");
  const [destinatario, setDestinatario] = useState<string>("");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [canal, setCanal] = useState<"whatsapp" | "email" | "sms">("email");
  const [escopo, setEscopo] = useState<"todos" | "unidade" | "cargo">("todos");
  const [alvoId, setAlvoId] = useState("");
  const [sending, setSending] = useState(false);

  const unidades = useDpUnidades();
  const cargos = useDpCargos();

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["dp_colab_min", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, unidade_id, cargo_id")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (mensagens as any[]).filter((m) => {
      const mine = m.remetente_id === user?.id;
      if (tab === "enviadas" && !mine) return false;
      if (tab === "recebidas" && mine) return false;
      if (s && !`${m.assunto} ${m.corpo} ${m.dp_colaboradores?.nome ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [mensagens, tab, search, user?.id]);

  const counts = useMemo(() => {
    let enviadas = 0, recebidas = 0, naoLidas = 0;
    for (const m of mensagens as any[]) {
      if (m.remetente_id === user?.id) enviadas++;
      else { recebidas++; if (!m.lida_em) naoLidas++; }
    }
    return { enviadas, recebidas, naoLidas };
  }, [mensagens, user?.id]);

  const reset = () => {
    setDestinatario(""); setAssunto(""); setCorpo("");
    setModo("direta"); setEscopo("todos"); setAlvoId(""); setCanal("email");
  };

  const enviar = async () => {
    if (!assunto || !corpo) return;
    if (modo === "direta") {
      if (!destinatario) return;
      send.mutate(
        { destinatario_colaborador_id: destinatario, assunto, corpo },
        { onSuccess: () => { setOpen(false); reset(); } },
      );
      return;
    }
    // broadcast
    let ids: string[] = [];
    if (escopo === "todos") ids = colaboradores.map((c: any) => c.id);
    else if (escopo === "unidade") ids = colaboradores.filter((c: any) => c.unidade_id === alvoId).map((c: any) => c.id);
    else if (escopo === "cargo") ids = colaboradores.filter((c: any) => c.cargo_id === alvoId).map((c: any) => c.id);
    if (ids.length === 0) return toast.error("Nenhum destinatário para este escopo");
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("dp-send-broadcast", {
        body: { company_id: selectedCompanyId, canal, assunto, corpo, colaborador_ids: ids },
      });
      if (error) throw error;
      toast.success(`Broadcast enviado para ${ids.length} destinatário(s)`);
      setOpen(false); reset();
    } catch (e: any) {
      toast.error(e.message ?? "Erro no broadcast");
    } finally { setSending(false); }
  };

  return (
    <DpPage>
      <Helmet><title>Mensagens — DP 360°</title></Helmet>
      <DpPageHeader
        icon={Mail}
        title="Mensagens"
        description="Converse com colaboradores individualmente ou em grupo."
        actions={
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova mensagem</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova mensagem</DialogTitle>
              <DialogDescription>Envie uma mensagem direta ou faça um broadcast para um grupo.</DialogDescription>
            </DialogHeader>
            <Tabs value={modo} onValueChange={(v) => setModo(v as Modo)} className="mb-2">
              <TabsList>
                <TabsTrigger value="direta"><Mail className="h-3.5 w-3.5 mr-1" />Direta</TabsTrigger>
                <TabsTrigger value="broadcast"><Users className="h-3.5 w-3.5 mr-1" />Broadcast</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-3">
              {modo === "direta" ? (
                <div>
                  <Label>Destinatário</Label>
                  <Select value={destinatario} onValueChange={setDestinatario}>
                    <SelectTrigger><SelectValue placeholder="Selecione um colaborador" /></SelectTrigger>
                    <SelectContent>
                      {colaboradores.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Canal</Label>
                      <Select value={canal} onValueChange={(v: any) => setCanal(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">E-mail</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Escopo</Label>
                      <Select value={escopo} onValueChange={(v: any) => { setEscopo(v); setAlvoId(""); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos ativos</SelectItem>
                          <SelectItem value="unidade">Por unidade</SelectItem>
                          <SelectItem value="cargo">Por cargo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {escopo === "unidade" && (
                    <div>
                      <Label>Unidade</Label>
                      <Select value={alvoId} onValueChange={setAlvoId}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {(unidades.data ?? []).map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {escopo === "cargo" && (
                    <div>
                      <Label>Cargo</Label>
                      <Select value={alvoId} onValueChange={setAlvoId}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {(cargos.data ?? []).map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
              <div>
                <Label>Assunto</Label>
                <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
              </div>
              <div>
                <Label>Mensagem <span className="text-xs text-muted-foreground">— use {"{nome}"} para personalizar</span></Label>
                <Textarea rows={6} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={sending || !assunto || !corpo || (modo === "direta" ? !destinatario : (escopo !== "todos" && !alvoId))}
                onClick={enviar}
              >
                <Send className="h-4 w-4 mr-1" /> {sending ? "Enviando..." : "Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="enviadas">Enviadas ({counts.enviadas})</TabsTrigger>
            <TabsTrigger value="recebidas">
              Recebidas ({counts.recebidas})
              {counts.naoLidas > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{counts.naoLidas}</Badge>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-64" />
        </div>
      </div>

      {isLoading ? (
        <DpContentCard contentClassName="p-6"><p className="text-sm text-muted-foreground">Carregando…</p></DpContentCard>
      ) : filtered.length === 0 ? (
        <DpContentCard><DpEmptyState icon={Mail}>Nenhuma mensagem.</DpEmptyState></DpContentCard>
      ) : (
        <div className="grid gap-3">
          {filtered.map((m: any) => {
            const mine = m.remetente_id === user?.id;
            return (
              <Card key={m.id} className={`dp-content-card ${!mine && !m.lida_em ? "border-primary/40" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {m.assunto}
                        {!mine && !m.lida_em && <Badge className="text-[10px]">Não lida</Badge>}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {mine ? "Para" : "De"} {m.dp_colaboradores?.nome ?? "—"} ·{" "}
                        {format(new Date(m.created_at), "dd 'de' MMM yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setToDelete(m)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{m.corpo}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem "{toDelete?.assunto}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { remove.mutate(toDelete.id); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}

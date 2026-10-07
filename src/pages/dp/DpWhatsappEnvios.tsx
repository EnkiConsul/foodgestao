import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { maskPhone } from "@/lib/phone";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

type Envio = {
  id: string; tipo: "acesso" | "senha" | "recibo"; destinatario_nome: string | null; telefone: string | null;
  status: "enviado" | "entregue" | "lido" | "falhou"; erro: string | null; link: string | null;
  colaborador_id: string | null; recibo_id: string | null; created_at: string; entregue_em: string | null; lido_em: string | null;
};

const TIPO: Record<Envio["tipo"], string> = { acesso: "Acesso ao Portal", senha: "Nova Senha", recibo: "Assinatura de Recibo" };
const STATUS: Record<Envio["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  enviado: { label: "Enviado", variant: "secondary" },
  entregue: { label: "Entregue", variant: "outline" },
  lido: { label: "Lido", variant: "default" },
  falhou: { label: "Falhou", variant: "destructive" },
};

const dataHora = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const telefoneBr = (t: string | null) => !t ? "—" : t.startsWith("55") && t.length >= 12 ? `+55 ${maskPhone(t.slice(2))}` : t;

export default function DpWhatsappEnvios() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const { isSuperAdmin } = useSuperAdmin();
  const ativarLeitura = async () => {
    const { data: r, error } = await supabase.functions.invoke("zapi-webhook", { body: { acao: "configurar" } });
    if (error || !(r as { ok?: boolean })?.ok) toast.error("Não foi possível ativar a confirmação de entrega/leitura.", { description: "Confira se o WhatsApp da Aveto está conectado e tente de novo." });
    else toast.success("Confirmação de entrega e leitura ativada.");
  };
  const [reenviando, setReenviando] = useState<string | null>(null);

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dp_whatsapp_envios", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_whatsapp_envios").select("*")
        .eq("company_id", selectedCompanyId!).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Envio[];
    },
  });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    return data.filter((e) =>
      (tipo === "todos" || e.tipo === tipo) && (status === "todos" || e.status === status) &&
      (!q || (e.destinatario_nome ?? "").toLowerCase().includes(q) || (!!qd && (e.telefone ?? "").includes(qd))));
  }, [data, busca, tipo, status]);

  const copiar = async (link: string) => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copiado. Envie manualmente pelo WhatsApp."); }
    catch { toast.error("Não foi possível copiar. Selecione e copie o link manualmente."); }
  };

  const reenviar = async (e: Envio) => {
    setReenviando(e.id);
    try {
      const chamada = e.tipo === "recibo"
        ? supabase.functions.invoke("dp-recibo-emitir", { body: { acao: "link", recibo_id: e.recibo_id } })
        : supabase.functions.invoke(e.tipo === "senha" ? "dp-reset-password" : "dp-criar-acesso-colaborador",
            { body: { colaborador_id: e.colaborador_id, enviar_whatsapp: true } });
      const { data: r, error } = await chamada;
      let motivo = (r as { error?: string } | null)?.error;
      if (error && !motivo) { try { motivo = (await (error as { context?: Response }).context?.json())?.error; } catch { /* ignora */ } }
      if (error || motivo) toast.error("Não foi possível reenviar", { description: motivo ?? "Tente de novo pela ficha do colaborador." });
      else if ((r as { whatsapp_enviado?: boolean }).whatsapp_enviado === false) toast.warning("Reenvio falhou", { description: (r as { whatsapp_erro?: string }).whatsapp_erro ?? "Use “Copiar Link” e envie manualmente." });
      else toast.success("Mensagem reenviada pelo WhatsApp da Aveto.");
    } finally {
      setReenviando(null);
      qc.invalidateQueries({ queryKey: ["dp_whatsapp_envios"] });
    }
  };

  const podeReenviar = (e: Envio) => e.tipo === "recibo" ? !!e.recibo_id : !!e.colaborador_id;

  return (
    <DpPage>
      <Helmet><title>Envios WhatsApp — Pessoas 360°</title></Helmet>
      <DpPageHeader icon={MessageCircle} title="Envios WhatsApp"
        description="Acompanhe as mensagens enviadas pelo WhatsApp da Aveto: convites de acesso, nova senha e assinatura de recibos."
        actions={<div className="flex gap-2">{isSuperAdmin && <Button variant="outline" onClick={ativarLeitura}>Ativar Entrega/Leitura</Button>}<Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Atualizar</Button></div>} />

      <DpContentCard>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              {Object.entries(TIPO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as Situações</SelectItem>
              {Object.entries(STATUS).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          “Entregue” e “Lido” são informados pelo WhatsApp e podem não aparecer se a pessoa desativou a confirmação de leitura.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !lista.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum envio encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>Destinatário</TableHead><TableHead>Telefone</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">{dataHora(e.created_at)}</TableCell>
                    <TableCell className="text-sm font-medium">{e.destinatario_nome ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{telefoneBr(e.telefone)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{TIPO[e.tipo]}</TableCell>
                    <TableCell className="text-sm">
                      <Badge variant={STATUS[e.status].variant}>{STATUS[e.status].label}</Badge>
                      {e.status === "lido" && <p className="mt-1 text-xs text-muted-foreground">Lido em {dataHora(e.lido_em)}</p>}
                      {e.status === "entregue" && <p className="mt-1 text-xs text-muted-foreground">Entregue em {dataHora(e.entregue_em)}</p>}
                      {e.status === "falhou" && e.erro && <p className="mt-1 max-w-xs text-xs text-destructive">{e.erro}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {e.link && <Button size="sm" variant="ghost" onClick={() => copiar(e.link!)}><Copy className="mr-1 h-4 w-4" />Copiar Link</Button>}
                        {podeReenviar(e) && (
                          <Button size="sm" variant="ghost" onClick={() => reenviar(e)} disabled={reenviando === e.id}>
                            {reenviando === e.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Reenviar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DpContentCard>
    </DpPage>
  );
}

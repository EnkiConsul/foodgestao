import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Mail, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpMensagens } from "@/hooks/useDpComunicacao";

export default function DpMensagens() {
  const { selectedCompanyId } = useCompanyContext();
  const { data: mensagens = [], isLoading, send, remove } = useDpMensagens();
  const [open, setOpen] = useState(false);
  const [destinatario, setDestinatario] = useState<string>("");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["dp_colab_min", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => { setDestinatario(""); setAssunto(""); setCorpo(""); };

  return (
    <div className="space-y-4">
      <Helmet><title>Mensagens — DP 360°</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6" /> Mensagens diretas
          </h1>
          <p className="text-muted-foreground">Converse com colaboradores individualmente.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova mensagem</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova mensagem</DialogTitle></DialogHeader>
            <div className="space-y-3">
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
              <div>
                <Label>Assunto</Label>
                <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
              </div>
              <div>
                <Label>Mensagem</Label>
                <Textarea rows={6} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={!destinatario || !assunto || !corpo}
                onClick={() => {
                  send.mutate(
                    { destinatario_colaborador_id: destinatario, assunto, corpo },
                    { onSuccess: () => { setOpen(false); reset(); } },
                  );
                }}
              >
                <Send className="h-4 w-4 mr-1" /> Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : mensagens.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Nenhuma mensagem enviada ainda.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {mensagens.map((m: any) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{m.assunto}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Para {m.dp_colaboradores?.nome ?? "—"} ·{" "}
                      {format(new Date(m.created_at), "dd 'de' MMM yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{m.corpo}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { MessageSquare, Plus, Copy, Pencil, Trash2, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { useDpMensagens } from "@/hooks/useDpComunicacao";
import {
  useDpModelosMensagem, type DpModeloMensagem, type DpModeloTipo,
} from "@/hooks/useDpModelosMensagem";
import { toast } from "sonner";

const TIPO_LABELS: Record<DpModeloTipo, string> = {
  aniversario: "Aniversário",
  tempo_de_casa: "Tempo de Casa",
  outro: "Outro",
};

const TIPO_DETALHES: Partial<Record<DpModeloTipo, string>> = {
  aniversario: "Aniversário de Nascimento",
  tempo_de_casa: "Aniversário de Contratação",
};

type ModeloForm = {
  id?: string;
  titulo: string;
  tipo: DpModeloTipo;
  assunto: string;
  corpo: string;
};

const EMPTY_FORM: ModeloForm = { titulo: "", tipo: "outro", assunto: "", corpo: "" };

export default function DpMensagens() {
  const { selectedCompanyId } = useCompanyContext();
  const { send } = useDpMensagens();
  const modelos = useDpModelosMensagem();

  const [modeloOpen, setModeloOpen] = useState(false);
  const [modeloForm, setModeloForm] = useState<ModeloForm>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<DpModeloMensagem | null>(null);

  const [destinatario, setDestinatario] = useState<string>("todos");
  const [modeloSel, setModeloSel] = useState<string>("nenhum");
  const [canal, setCanal] = useState<"whatsapp" | "email" | "sms">("whatsapp");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [enviando, setEnviando] = useState(false);

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

  const modelosList = useMemo(
    () => (modelos.data ?? []) as DpModeloMensagem[],
    [modelos.data],
  );

  const openNovoModelo = () => { setModeloForm(EMPTY_FORM); setModeloOpen(true); };
  const editarModelo = (m: DpModeloMensagem) => {
    setModeloForm({
      id: m.id,
      titulo: m.titulo,
      tipo: (m.tipo ?? "outro") as DpModeloTipo,
      assunto: m.assunto ?? "",
      corpo: m.corpo,
    });
    setModeloOpen(true);
  };

  const duplicarModelo = (m: DpModeloMensagem) => {
    modelos.upsert.mutate({
      titulo: `${m.titulo} (cópia)`,
      tipo: (m.tipo ?? "outro") as DpModeloTipo,
      assunto: m.assunto ?? "",
      corpo: m.corpo,
      canal: m.canal,
    } as any);
  };

  const salvarModelo = () => {
    if (!modeloForm.titulo || !modeloForm.assunto || !modeloForm.corpo) {
      toast.error("Preencha nome, assunto e corpo");
      return;
    }
    modelos.upsert.mutate(
      {
        id: modeloForm.id,
        titulo: modeloForm.titulo,
        tipo: modeloForm.tipo,
        assunto: modeloForm.assunto,
        corpo: modeloForm.corpo,
        canal: "whatsapp",
      } as any,
      { onSuccess: () => { setModeloOpen(false); setModeloForm(EMPTY_FORM); } },
    );
  };

  const aplicarModelo = (id: string) => {
    setModeloSel(id);
    if (id === "nenhum") return;
    const m = modelosList.find((x) => x.id === id);
    if (m) {
      setAssunto(m.assunto ?? m.titulo);
      setCorpo(m.corpo);
    }
  };

  const enviar = async () => {
    if (!assunto || !corpo) return toast.error("Preencha assunto e mensagem");
    setEnviando(true);
    try {
      const ids =
        destinatario === "todos"
          ? (colaboradores as any[]).map((c) => c.id)
          : [destinatario];
      if (ids.length === 0) {
        toast.error("Nenhum destinatário disponível");
        return;
      }
      if (destinatario !== "todos") {
        await new Promise<void>((resolve, reject) =>
          send.mutate(
            { destinatario_colaborador_id: destinatario, assunto, corpo },
            { onSuccess: () => resolve(), onError: (e) => reject(e) },
          ),
        );
      } else {
        const { error } = await supabase.functions.invoke("dp-send-broadcast", {
          body: { company_id: selectedCompanyId, canal, assunto, corpo, colaborador_ids: ids },
        });
        if (error) throw error;
        toast.success(`Mensagem enviada para ${ids.length} colaborador(es)`);
      }
      setAssunto(""); setCorpo(""); setModeloSel("nenhum");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DpPage>
      <Helmet><title>Mensagens — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={MessageSquare}
        title="Mensagens"
        description="Envie mensagens para colaboradores via WhatsApp e/ou E-mail usando modelos pré-definidos."
      />

      {/* Modelos Rápidos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Modelos Rápidos</h2>
          <Button onClick={openNovoModelo}>
            <Plus className="h-4 w-4 mr-1" /> Novo Modelo
          </Button>
        </div>
        {modelosList.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--dp-border))] p-8 text-center text-sm text-muted-foreground">
            Nenhum modelo cadastrado. Clique em "Novo Modelo" para criar o primeiro.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modelosList.map((m) => {
              const tipo = (m.tipo ?? "outro") as DpModeloTipo;
              return (
                <div key={m.id} className="rounded-xl border-2 border-[hsl(var(--dp-border))] bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{m.titulo}</p>
                      <p className="text-xs text-muted-foreground">{TIPO_LABELS[tipo]}</p>
                      {TIPO_DETALHES[tipo] && (
                        <p className="text-xs text-muted-foreground">{TIPO_DETALHES[tipo]}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => duplicarModelo(m)} title="Duplicar">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editarModelo(m)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setToDelete(m)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Enviar Mensagem */}
      <section className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Enviar Mensagem</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Destinatário</Label>
            <Select value={destinatario} onValueChange={setDestinatario}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os colaboradores</SelectItem>
                {(colaboradores as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Modelo (opcional)</Label>
            <Select value={modeloSel} onValueChange={aplicarModelo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum</SelectItem>
                {modelosList.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.titulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Canal de Envio</Label>
          <Select value={canal} onValueChange={(v: any) => setCanal(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
              <SelectItem value="email">✉️ E-mail</SelectItem>
              <SelectItem value="sms">💬 SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Assunto *</Label>
          <Input placeholder="Assunto da mensagem" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Mensagem *</Label>
          <Textarea rows={6} placeholder="Digite a mensagem..." value={corpo} onChange={(e) => setCorpo(e.target.value)} />
        </div>

        <Button onClick={enviar} disabled={enviando || !assunto || !corpo}>
          <Send className="h-4 w-4 mr-1" /> {enviando ? "Enviando..." : "Enviar Mensagem"}
        </Button>
      </section>

      {/* Dialog Modelo */}
      <Dialog open={modeloOpen} onOpenChange={setModeloOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modeloForm.id ? "Editar Modelo" : "Novo Modelo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome do Modelo *</Label>
              <Input
                placeholder="Ex: Aniversário"
                value={modeloForm.titulo}
                onChange={(e) => setModeloForm((f) => ({ ...f, titulo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={modeloForm.tipo}
                onValueChange={(v: DpModeloTipo) => setModeloForm((f) => ({ ...f, tipo: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outro">Outro</SelectItem>
                  <SelectItem value="aniversario">Aniversário</SelectItem>
                  <SelectItem value="tempo_de_casa">Tempo de Casa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assunto *</Label>
              <Input
                placeholder="Assunto do modelo"
                value={modeloForm.assunto}
                onChange={(e) => setModeloForm((f) => ({ ...f, assunto: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Corpo da Mensagem *</Label>
              <Textarea
                rows={5}
                placeholder="Conteúdo do modelo"
                value={modeloForm.corpo}
                onChange={(e) => setModeloForm((f) => ({ ...f, corpo: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModeloOpen(false)}>Cancelar</Button>
            <Button onClick={salvarModelo}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo "{toDelete?.titulo}" será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { modelos.remove.mutate(toDelete.id); setToDelete(null); } }}
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

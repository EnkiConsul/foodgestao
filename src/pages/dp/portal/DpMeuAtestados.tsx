import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format } from "date-fns";
import { HeartPulse, Upload, FileText, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";

const BUCKET = "dp-documentos";

const statusColor: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  aprovada: "bg-green-500/10 text-green-700 dark:text-green-300",
  recusada: "bg-red-500/10 text-red-700 dark:text-red-300",
  cancelada: "bg-muted text-muted-foreground",
};

export default function DpMeuAtestados() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ data_alvo: "", dias: 1, motivo: "" });
  const [file, setFile] = useState<File | null>(null);
  const [force, setForce] = useState(false);

  const ctx = useQuery({
    queryKey: ["dp_meu_ctx_atest", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return null;
      const { data: colab } = await supabase
        .from("dp_colaboradores").select("id, company_id, nome").eq("id", cid as string).single();
      return colab;
    },
  });

  const list = useQuery({
    queryKey: ["dp_meu_atestados", ctx.data?.id],
    enabled: !!ctx.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes").select("*")
        .eq("colaborador_id", ctx.data!.id)
        .eq("tipo", "atestado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!ctx.data) throw new Error("Colaborador não encontrado");
      if (!form.data_alvo) throw new Error("Informe a data do atestado");

      let arquivo_path: string | undefined;
      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${ctx.data.company_id}/atestados/${ctx.data.id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        arquivo_path = path;
      }

      const { data, error } = await supabase.functions.invoke("dp-notify-atestado", {
        body: {
          company_id: ctx.data.company_id,
          colaborador_id: ctx.data.id,
          data_alvo: form.data_alvo,
          dias: form.dias,
          arquivo_path,
          force,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Atestado enviado");
      qc.invalidateQueries({ queryKey: ["dp_meu_atestados"] });
      setOpen(false);
      setForm({ data_alvo: "", dias: 1, motivo: "" });
      setFile(null);
      setForce(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar"),
  });

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <DpPage>
      <Helmet><title>Meus atestados — Portal</title></Helmet>
      <DpPageHeader
        icon={HeartPulse}
        title="Meus atestados"
        actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Upload className="h-4 w-4 mr-1" /> Enviar atestado</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Novo atestado</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={form.data_alvo}
                    onChange={(e) => setForm({ ...form, data_alvo: e.target.value })} />
                </div>
                <div>
                  <Label>Dias</Label>
                  <Input type="number" min={1} max={365} value={form.dias}
                    onChange={(e) => setForm({ ...form, dias: Number(e.target.value) || 1 })} />
                </div>
              </div>
              <div>
                <Label>Arquivo (PDF ou imagem)</Label>
                <Input type="file" accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea rows={2} value={form.motivo}
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                Forçar envio (mesmo se houver atestado duplicado nas últimas 48h)
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

      {list.isLoading ? (
        <DpContentCard contentClassName="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></DpContentCard>
      ) : (list.data?.length ?? 0) === 0 ? (
        <DpContentCard><DpEmptyState icon={HeartPulse}>Nenhum atestado enviado.</DpEmptyState></DpContentCard>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((s: any) => (
            <Card key={s.id} className="dp-content-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    Atestado — {s.data_alvo && format(new Date(s.data_alvo), "dd/MM/yyyy")}
                    {s.data_fim && s.data_fim !== s.data_alvo && ` a ${format(new Date(s.data_fim), "dd/MM/yyyy")}`}
                  </CardTitle>
                  <Badge className={statusColor[s.status]}>{s.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.arquivo_path && (
                  <Button size="sm" variant="outline" onClick={() => openFile(s.arquivo_path)}>
                    <FileText className="h-4 w-4 mr-1" /> Ver arquivo
                  </Button>
                )}
                {s.resposta_admin && (
                  <p className="text-xs text-muted-foreground">Resposta: {s.resposta_admin}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DpPage>
  );
}

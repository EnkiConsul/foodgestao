import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Save, X, User } from "lucide-react";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";

export default function DpMeuPerfil() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const perfil = useQuery({
    queryKey: ["dp_meu_perfil", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("*, dp_unidades(nome), dp_cargos(nome), dp_sindicatos(nome)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    telefone: "", whatsapp: "", email_contato: "",
    endereco: { logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "" },
  });

  useEffect(() => {
    const p = perfil.data as any;
    if (!p) return;
    setForm({
      telefone: p.telefone ?? "",
      whatsapp: p.whatsapp ?? "",
      email_contato: p.email_contato ?? "",
      endereco: {
        logradouro: p.endereco?.logradouro ?? "",
        numero: p.endereco?.numero ?? "",
        complemento: p.endereco?.complemento ?? "",
        bairro: p.endereco?.bairro ?? "",
        cidade: p.endereco?.cidade ?? "",
        uf: p.endereco?.uf ?? "",
        cep: p.endereco?.cep ?? "",
      },
    });
  }, [perfil.data]);

  const save = useMutation({
    mutationFn: async () => {
      const p = perfil.data as any;
      if (!p) throw new Error("Perfil não encontrado");
      const { error } = await supabase.from("dp_colaboradores").update({
        telefone: form.telefone || null,
        whatsapp: form.whatsapp || null,
        email_contato: form.email_contato || null,
        endereco: form.endereco,
      }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["dp_meu_perfil"] });
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const p = perfil.data as any;

  return (
    <DpPage>
      <Helmet><title>Meu Cadastro — Portal</title></Helmet>
      <DpPageHeader
        icon={User}
        title="Meu Cadastro"
        actions={p && !editing ? (
          <Button variant="outline" onClick={() => setEditing(true)} className="min-h-10 w-full sm:w-auto">
            <Pencil className="h-4 w-4 mr-1" /> Editar contato/endereço
          </Button>
        ) : undefined}
      />
      {!p ? (
        <DpContentCard contentClassName="p-6"><p className="text-muted-foreground">Perfil não encontrado.</p></DpContentCard>
      ) : (
        <>
          <Card className="dp-content-card">
            <CardHeader><CardTitle>{p.nome}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <Field label="Matrícula" value={p.matricula} />
              <Field label="CPF" value={p.cpf} />
              <Field label="Cargo" value={p.dp_cargos?.nome ?? p.cargo} />
              <Field label="Unidade" value={p.dp_unidades?.nome} />
              <Field label="Regime" value={p.regime} />
              <Field label="Perfil de acesso" value={p.perfil_acesso} />
              <Field label="Sindicato" value={p.dp_sindicatos?.nome} />
              <Field label="Admissão" value={p.data_admissao} />
              <Field label="Nascimento" value={p.data_nascimento} />
              <Field label="E-mail corporativo" value={p.email} />
              <Field label="E-mail do portal" value={p.email_portal} />
            </CardContent>
          </Card>

          <Card className="dp-content-card">
            <CardHeader><CardTitle className="text-base">Contato & Endereço</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                    <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
                  </div>
                  <div><Label>E-mail pessoal</Label><Input type="email" value={form.email_contato} onChange={(e) => setForm({ ...form, email_contato: e.target.value })} /></div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2"><Label>Logradouro</Label><Input value={form.endereco.logradouro} onChange={(e) => setForm({ ...form, endereco: { ...form.endereco, logradouro: e.target.value } })} /></div>
                    <div><Label>Nº</Label><Input value={form.endereco.numero} onChange={(e) => setForm({ ...form, endereco: { ...form.endereco, numero: e.target.value } })} /></div>
                  </div>
                  <div><Label>Complemento</Label><Input value={form.endereco.complemento} onChange={(e) => setForm({ ...form, endereco: { ...form.endereco, complemento: e.target.value } })} /></div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div><Label>Bairro</Label><Input value={form.endereco.bairro} onChange={(e) => setForm({ ...form, endereco: { ...form.endereco, bairro: e.target.value } })} /></div>
                    <div><Label>Cidade</Label><Input value={form.endereco.cidade} onChange={(e) => setForm({ ...form, endereco: { ...form.endereco, cidade: e.target.value } })} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>UF</Label><Input maxLength={2} value={form.endereco.uf} onChange={(e) => setForm({ ...form, endereco: { ...form.endereco, uf: e.target.value.toUpperCase() } })} /></div>
                      <div><Label>CEP</Label><Input value={form.endereco.cep} onChange={(e) => setForm({ ...form, endereco: { ...form.endereco, cep: e.target.value } })} /></div>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
                    <Button variant="outline" onClick={() => setEditing(false)} className="min-h-10 w-full sm:w-auto"><X className="h-4 w-4 mr-1" /> Cancelar</Button>
                    <Button disabled={save.isPending} onClick={() => save.mutate()} className="min-h-10 w-full sm:w-auto"><Save className="h-4 w-4 mr-1" /> Salvar</Button>
                  </div>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <Field label="Telefone" value={p.telefone} />
                  <Field label="WhatsApp" value={p.whatsapp} />
                  <Field label="E-mail pessoal" value={p.email_contato} />
                  <Field label="Endereço" value={
                    p.endereco ? [p.endereco.logradouro, p.endereco.numero, p.endereco.complemento, p.endereco.bairro, p.endereco.cidade, p.endereco.uf, p.endereco.cep].filter(Boolean).join(", ") : null
                  } />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </DpPage>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  );
}

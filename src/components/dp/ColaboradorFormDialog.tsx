import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpsertDpColaborador, type DpColaborador } from "@/hooks/useDpColaboradores";
import { useDpUnidades, useDpCargos, useDpSindicatos } from "@/hooks/useDpCadastros";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Regime = Database["public"]["Enums"]["dp_regime_trabalho"];

const REGIMES: { value: Regime; label: string }[] = [
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "estagio", label: "Estágio" },
  { value: "temporario", label: "Temporário" },
  { value: "mei", label: "MEI" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  colaborador?: DpColaborador | null;
}

export function ColaboradorFormDialog({ open, onOpenChange, colaborador }: Props) {
  const upsert = useUpsertDpColaborador();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const sindicatos = useDpSindicatos();
  const [form, setForm] = useState({
    nome: "", cpf: "", matricula: "", cargo: "",
    regime: "clt" as Regime, data_admissao: "", data_desligamento: "",
    email: "", telefone: "", whatsapp: "",
    ativo: true, observacoes: "",
    unidade_id: "" as string, cargo_id: "" as string, sindicato_id: "" as string,
    email_portal: "", email_contato: "",
    data_nascimento: "",
    perfil_acesso: "colaborador" as "colaborador" | "gestor" | "admin",
    folga_fixa_semana: "" as string,
    possui_folha_ponto: false,
    optante_adiantamento: false,
  });

  useEffect(() => {
    if (open) {
      const c = (colaborador ?? {}) as any;
      setForm({
        nome: c.nome ?? "",
        cpf: c.cpf ?? "",
        matricula: c.matricula ?? "",
        cargo: c.cargo ?? "",
        regime: (c.regime as Regime) ?? "clt",
        data_admissao: c.data_admissao ?? "",
        data_desligamento: c.data_desligamento ?? "",
        email: c.email ?? "",
        telefone: c.telefone ?? "",
        whatsapp: c.whatsapp ?? "",
        ativo: c.ativo ?? true,
        observacoes: c.observacoes ?? "",
        unidade_id: c.unidade_id ?? "",
        cargo_id: c.cargo_id ?? "",
        sindicato_id: c.sindicato_id ?? "",
        email_portal: c.email_portal ?? "",
        email_contato: c.email_contato ?? "",
        data_nascimento: c.data_nascimento ?? "",
        perfil_acesso: c.perfil_acesso ?? "colaborador",
        folga_fixa_semana: c.folga_fixa_semana != null ? String(c.folga_fixa_semana) : "",
        possui_folha_ponto: c.possui_folha_ponto ?? false,
        optante_adiantamento: c.optante_adiantamento ?? false,
      });
    }
  }, [open, colaborador]);

  const submit = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    try {
      await upsert.mutateAsync({
        id: colaborador?.id,
        nome: form.nome.trim(),
        cpf: form.cpf.trim() || null,
        matricula: form.matricula.trim() || null,
        cargo: form.cargo.trim() || null,
        regime: form.regime,
        data_admissao: form.data_admissao || null,
        data_desligamento: form.data_desligamento || null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        ativo: form.ativo,
        observacoes: form.observacoes.trim() || null,
        unidade_id: form.unidade_id || null,
        cargo_id: form.cargo_id || null,
        sindicato_id: form.sindicato_id || null,
        email_portal: form.email_portal.trim() || null,
        email_contato: form.email_contato.trim() || null,
        data_nascimento: form.data_nascimento || null,
        perfil_acesso: form.perfil_acesso,
        folga_fixa_semana: form.folga_fixa_semana ? Number(form.folga_fixa_semana) : null,
        possui_folha_ponto: form.possui_folha_ponto,
        optante_adiantamento: form.optante_adiantamento,
      } as any);
      toast.success(colaborador ? "Colaborador atualizado" : "Colaborador cadastrado");
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{colaborador ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Matrícula</Label>
              <Input value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Regime</Label>
              <Select value={form.regime} onValueChange={(v) => setForm({ ...form, regime: v as Regime })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Data de admissão</Label>
              <Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Nascimento</Label>
              <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Data de demissão</Label>
              <Input type="date" value={form.data_desligamento} onChange={(e) => setForm({ ...form, data_desligamento: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(62) 9..." />
            </div>
            <div className="grid gap-1.5">
              <Label>E-mail (corporativo)</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>E-mail de contato pessoal</Label>
              <Input type="email" value={form.email_contato} onChange={(e) => setForm({ ...form, email_contato: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Folga fixa (dia da semana)</Label>
              <Select value={form.folga_fixa_semana || "__none"} onValueChange={(v) => setForm({ ...form, folga_fixa_semana: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nenhum —</SelectItem>
                  {["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"].map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Perfil de acesso</Label>
              <Select value={form.perfil_acesso} onValueChange={(v: any) => setForm({ ...form, perfil_acesso: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="admin">Admin DP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <div className="flex items-center gap-2">
                <Switch id="ponto" checked={form.possui_folha_ponto} onCheckedChange={(v) => setForm({ ...form, possui_folha_ponto: v })} />
                <Label htmlFor="ponto" className="text-sm">Possui folha de ponto</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="adto" checked={form.optante_adiantamento} onCheckedChange={(v) => setForm({ ...form, optante_adiantamento: v })} />
                <Label htmlFor="adto" className="text-sm">Optante por adiantamento</Label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Unidade</Label>
              <Select value={form.unidade_id || "__none"} onValueChange={(v) => setForm({ ...form, unidade_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nenhuma —</SelectItem>
                  {(unidades.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Cargo (catálogo)</Label>
              <Select value={form.cargo_id || "__none"} onValueChange={(v) => setForm({ ...form, cargo_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nenhum —</SelectItem>
                  {(cargos.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Sindicato</Label>
              <Select value={form.sindicato_id || "__none"} onValueChange={(v) => setForm({ ...form, sindicato_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nenhum —</SelectItem>
                  {(sindicatos.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div>
              <Label>Acesso ao Portal do Colaborador</Label>
              <p className="text-xs text-muted-foreground">
                {(colaborador as any)?.user_id
                  ? "Este colaborador já possui acesso ao portal."
                  : "Ao enviar convite, o colaborador recebe um e-mail para criar senha e acessar apenas o Portal do DP."}
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                value={form.email_portal}
                onChange={(e) => setForm({ ...form, email_portal: e.target.value })}
                placeholder="colaborador@empresa.com"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!colaborador?.id || !form.email_portal.trim()}
                onClick={async () => {
                  if (!colaborador?.id) return;
                  const { data, error } = await supabase.functions.invoke("dp-invite-colaborador", {
                    body: { colaborador_id: colaborador.id, email: form.email_portal.trim() },
                  });
                  if (error || (data as any)?.error) {
                    toast.error((data as any)?.error ?? error?.message ?? "Erro ao enviar convite");
                  } else {
                    toast.success((data as any)?.reused ? "Usuário existente vinculado" : "Convite enviado");
                  }
                }}
              >
                <Send className="h-4 w-4 mr-1" /> Convidar
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Ativo</Label>
              <p className="text-xs text-muted-foreground">Colaboradores inativos não recebem novas solicitações.</p>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

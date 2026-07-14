import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpsertDpColaborador, type DpColaborador } from "@/hooks/useDpColaboradores";
import { useDpUnidades, useDpCargos, useDpSindicatos } from "@/hooks/useDpCadastros";
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
    regime: "clt" as Regime, data_admissao: "", email: "", telefone: "",
    ativo: true, observacoes: "",
    unidade_id: "" as string, cargo_id: "" as string, sindicato_id: "" as string,
    email_portal: "",
    data_nascimento: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        nome: colaborador?.nome ?? "",
        cpf: colaborador?.cpf ?? "",
        matricula: colaborador?.matricula ?? "",
        cargo: colaborador?.cargo ?? "",
        regime: (colaborador?.regime as Regime) ?? "clt",
        data_admissao: colaborador?.data_admissao ?? "",
        email: colaborador?.email ?? "",
        telefone: colaborador?.telefone ?? "",
        ativo: colaborador?.ativo ?? true,
        observacoes: colaborador?.observacoes ?? "",
        unidade_id: colaborador?.unidade_id ?? "",
        cargo_id: colaborador?.cargo_id ?? "",
        sindicato_id: colaborador?.sindicato_id ?? "",
        email_portal: colaborador?.email_portal ?? "",
        data_nascimento: (colaborador as any)?.data_nascimento ?? "",
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
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        ativo: form.ativo,
        observacoes: form.observacoes.trim() || null,
        unidade_id: form.unidade_id || null,
        cargo_id: form.cargo_id || null,
        sindicato_id: form.sindicato_id || null,
        email_portal: form.email_portal.trim() || null,
        data_nascimento: form.data_nascimento || null,
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
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Data de admissão</Label>
              <Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Data de nascimento</Label>
              <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Telefone</Label>
            <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
              <Label>E-mail do portal do colaborador</Label>
              <p className="text-xs text-muted-foreground">Guarde o e-mail que dará acesso ao portal. O envio de convite é habilitado na Fase 8.</p>
            </div>
            <Input type="email" value={form.email_portal} onChange={(e) => setForm({ ...form, email_portal: e.target.value })} placeholder="colaborador@empresa.com" />
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

import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsertDpColaborador } from "@/hooks/useDpColaboradores";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface NovoColaboradorInlineDialogProps {
  defaultNome?: string;
  defaultCpf?: string;
  onCreated?: (id: string, nome: string) => void;
  trigger?: React.ReactNode;
}

export function NovoColaboradorInlineDialog({
  defaultNome = "",
  defaultCpf = "",
  onCreated,
  trigger,
}: NovoColaboradorInlineDialogProps) {
  const { selectedCompanyId } = useCompanyContext();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(defaultNome);
  const [cpf, setCpf] = useState(defaultCpf);
  const [cargo, setCargo] = useState<string>("");
  const [unidade, setUnidade] = useState<string>("");
  const upsert = useUpsertDpColaborador();

  const cargos = useQuery({
    queryKey: ["dp_cargos_min", selectedCompanyId],
    enabled: !!selectedCompanyId && open,
    queryFn: async () => {
      const { data } = await supabase.from("dp_cargos").select("id, nome").eq("company_id", selectedCompanyId!).order("nome");
      return data ?? [];
    },
  });
  const unidades = useQuery({
    queryKey: ["dp_unidades_min", selectedCompanyId],
    enabled: !!selectedCompanyId && open,
    queryFn: async () => {
      const { data } = await supabase.from("dp_unidades").select("id, nome").eq("company_id", selectedCompanyId!).order("nome");
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!nome.trim()) return toast.error("Informe o nome");
    try {
      const payload: any = {
        nome: nome.trim(),
        cpf: cpf.trim() || null,
        cargo_id: cargo || null,
        unidade_id: unidade || null,
        ativo: true,
      };
      // Insert and fetch the new id
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      const { data, error } = await (supabase.from("dp_colaboradores") as any)
        .insert({ ...payload, company_id: selectedCompanyId, created_by: uid })
        .select("id, nome")
        .single();
      if (error) throw error;
      toast.success("Colaborador cadastrado");
      onCreated?.(data.id as string, data.nome as string);
      setOpen(false);
      setNome(""); setCpf(""); setCargo(""); setUnidade("");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cadastrar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" type="button">
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Novo colaborador
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar colaborador</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label>CPF</Label>
            <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Select value={cargo} onValueChange={setCargo}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(cargos.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(unidades.data ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

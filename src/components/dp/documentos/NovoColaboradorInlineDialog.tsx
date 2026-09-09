import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UserPlus, Loader2, FileUp } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toProperName } from "@/lib/text/properName";
import { cargoSugereVinculoSocio } from "@/lib/dp/cargos";

export interface NovoColaboradorInlineDialogProps {
  defaultNome?: string;
  defaultCpf?: string;
  defaultUnidadeId?: string | null;
  onCreated?: (id: string, nome: string) => void;
  trigger?: React.ReactNode;
}

export function NovoColaboradorInlineDialog({
  defaultNome = "",
  defaultCpf = "",
  defaultUnidadeId = null,
  onCreated,
  trigger,
}: NovoColaboradorInlineDialogProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [nome, setNome] = useState(() => toProperName(defaultNome));
  const [cpf, setCpf] = useState(() => defaultCpf.replace(/\D/g, ""));
  const [cargo, setCargo] = useState<string>("");
  const [unidade, setUnidade] = useState<string>(defaultUnidadeId ?? "");
  const [vinculo, setVinculo] = useState("CLT");
  const [socioRemuneracao, setSocioRemuneracao] = useState("pro_labore");
  // Só sugere vínculo pelo cargo enquanto o usuário não escolher o vínculo à mão.
  const [vinculoTocado, setVinculoTocado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<{ id: string; nome: string; ativo: boolean } | null>(null);

  useEffect(() => {
    if (!formOpen) return;
    setNome(toProperName(defaultNome));
    setCpf(defaultCpf.replace(/\D/g, ""));
    setUnidade(defaultUnidadeId ?? "");
    setExisting(null);
    setVinculoTocado(false);
  }, [defaultCpf, defaultNome, defaultUnidadeId, formOpen]);

  /** Cargo de sócio sugere o vínculo Sócio com pró-labore. */
  const escolherCargo = (id: string) => {
    setCargo(id);
    const nomeCargo = (cargos.data ?? []).find((c: any) => c.id === id)?.nome;
    if (!vinculoTocado && cargoSugereVinculoSocio(nomeCargo)) {
      setVinculo("Socio");
      setSocioRemuneracao("pro_labore");
    }
  };

  const cargos = useQuery({
    queryKey: ["dp_cargos_min", selectedCompanyId],
    enabled: !!selectedCompanyId && formOpen,
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data } = await supabase.from("dp_cargos").select("id, nome").eq("company_id", selectedCompanyId).order("nome");
      return data ?? [];
    },
  });
  const unidades = useQuery({
    queryKey: ["dp_unidades_min", selectedCompanyId],
    enabled: !!selectedCompanyId && formOpen,
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data } = await supabase.from("dp_unidades").select("id, nome").eq("company_id", selectedCompanyId).order("nome");
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!nome.trim()) return toast.error("Informe o nome");
    if (!selectedCompanyId) return toast.error("Selecione uma empresa antes de cadastrar");
    const cpfNormalizado = cpf.replace(/\D/g, "");
    try {
      setSaving(true);
      setExisting(null);
      if (cpfNormalizado) {
        const { data: found, error: findError } = await (supabase.from("dp_colaboradores") as any)
          .select("id,nome,ativo")
          .eq("company_id", selectedCompanyId)
          .eq("cpf", cpfNormalizado)
          .maybeSingle();
        if (findError) throw findError;
        if (found) {
          setExisting(found as { id: string; nome: string; ativo: boolean });
          return;
        }
      }
      const payload: any = {
        nome: toProperName(nome),
        cpf: cpfNormalizado || null,
        cargo_id: cargo || null,
        unidade_id: unidade || null,
        vinculo_label: vinculo,
        socio_remuneracao: vinculo === "Socio" ? socioRemuneracao : null,
        ativo: true,
      };
      const { data, error } = await (supabase.from("dp_colaboradores") as any)
        .insert({ ...payload, company_id: selectedCompanyId })
        .select("id, nome")
        .single();
      if (error) throw error;
      toast.success("Colaborador cadastrado");
      onCreated?.(data.id as string, data.nome as string);
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e?.code === "23505" ? "Já existe um cadastro com este CPF nesta empresa" : (e?.message ?? "Falha ao cadastrar"));
    } finally {
      setSaving(false);
    }
  };

  const vincularExistente = () => {
    if (!existing) return;
    onCreated?.(existing.id, existing.nome);
    toast.success("Página vinculada ao cadastro existente");
    setFormOpen(false);
  };

  return (
    <>
      <Dialog open={choiceOpen} onOpenChange={setChoiceOpen}>
        <DialogTrigger asChild>{trigger ?? <Button size="sm" variant="outline" type="button"><UserPlus className="h-3.5 w-3.5 mr-1" /> Novo colaborador</Button>}</DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Como deseja cadastrar?</DialogTitle><DialogDescription>A conferência atual ficará salva.</DialogDescription></DialogHeader>
          <div className="grid gap-3 pt-2">
            <Button variant="outline" className="h-auto justify-start px-4 py-4 text-left whitespace-normal" onClick={() => { setChoiceOpen(false); setFormOpen(true); }}>
              <UserPlus className="mr-3 h-6 w-6 shrink-0 text-primary" />
              <span><span className="block font-semibold">Cadastro rápido</span><span className="block text-xs font-normal text-muted-foreground">Use os dados já lidos desta página.</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start px-4 py-4 text-left whitespace-normal" onClick={() => navigate("/dp/colaboradores/importar-ficha")}>
              <FileUp className="mr-3 h-6 w-6 shrink-0 text-primary" />
              <span><span className="block font-semibold">Importar ficha de registro</span><span className="block text-xs font-normal text-muted-foreground">Leia o cadastro completo em outro PDF.</span></span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
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
            {!cpf && (
              <p className="text-xs text-muted-foreground">
                O documento não informa o CPF. Você pode preencher agora ou depois, na ficha.
              </p>
            )}
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
          <div className="space-y-1">
            <Label>Vínculo</Label>
            <Select value={vinculo} onValueChange={setVinculo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CLT">CLT efetivo</SelectItem><SelectItem value="Intermitente">CLT intermitente</SelectItem>
                <SelectItem value="Estagiario">Estagiário</SelectItem><SelectItem value="Temporario">Temporário</SelectItem>
                <SelectItem value="PJ">PJ</SelectItem><SelectItem value="Socio">Sócio</SelectItem><SelectItem value="Freelancer">Freelancer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {vinculo === "Socio" && <div className="space-y-1"><Label>Remuneração do sócio</Label><Select value={socioRemuneracao} onValueChange={setSocioRemuneracao}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pro_labore">Pró-labore</SelectItem><SelectItem value="somente_lucros">Somente participação nos lucros</SelectItem></SelectContent></Select></div>}
          {existing && <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"><p className="font-medium">Já existe cadastro com este CPF</p><p className="text-muted-foreground">{existing.nome}{existing.ativo ? "" : " · Inativo"}</p><Button className="mt-2 w-full" variant="outline" onClick={vincularExistente}>Vincular a este cadastro</Button></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}

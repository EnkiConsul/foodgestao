import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Landmark, ShieldAlert, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useUpsertDpCargo, useDpSindicatos, useDpLaboralPorCargo, useSetDpSindicatoLaboralCargo,
  usePropagarRiscosCargo, type DpCargo,
} from "@/hooks/useDpCadastros";
import { numeroBR } from "@/components/dp/RemuneracaoFields";
import { CargoRiscosFields } from "@/components/dp/cargos/CargoRiscosFields";
import { CargoSalariosUnidadePanel } from "@/components/dp/CargoSalariosUnidadePanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cargo em edição (null = novo). */
  cargo: (DpCargo & Record<string, any>) | null;
  /** Quantidade de colaboradores vinculados (para propagar riscos). */
  colaboradoresCount?: number;
  onSaved?: (cargo: DpCargo) => void;
}

interface FormState {
  nome: string;
  descricao: string;
  cbo: string;
  ativo: boolean;
  insalubre_periculoso: boolean;
  insalubre: boolean;
  perigoso: boolean;
  insalubridade_percentual: string;
  periculosidade_percentual: string;
  base_horas_mes: string;
  base_dias_mes: string;
  exige_cnh: boolean;
  cnh_categoria_minima: string;
  exige_epi: boolean;
  sindicato_laboral_id: string;
}

const SEM_LABORAL = "__nenhum__";

const blank: FormState = {
  nome: "", descricao: "", cbo: "", ativo: true,
  insalubre_periculoso: false, insalubre: false, perigoso: false,
  insalubridade_percentual: "", periculosidade_percentual: "",
  base_horas_mes: "220", base_dias_mes: "30",
  exige_cnh: false, cnh_categoria_minima: "", exige_epi: false,
  sindicato_laboral_id: SEM_LABORAL,
};

const CNH = ["A", "B", "AB", "C", "D", "E"];

/**
 * Cadastro do cargo com cabeçalho e rodapé fixos e abas internas — os mesmos
 * campos de cargo que aparecem na ficha do colaborador (riscos, base de cálculo,
 * requisitos e sindicato laboral) ficam disponíveis aqui.
 */
export function CargoFormDialog({ open, onOpenChange, cargo, colaboradoresCount = 0, onSaved }: Props) {
  const upsert = useUpsertDpCargo();
  const sindicatos = useDpSindicatos();
  const laboralPorCargo = useDpLaboralPorCargo();
  const setLaboral = useSetDpSindicatoLaboralCargo();
  const propagar = usePropagarRiscosCargo();

  const [aba, setAba] = useState("dados");
  const [form, setForm] = useState<FormState>(blank);
  const [propagarRiscos, setPropagarRiscos] = useState(false);

  const laborais = useMemo(
    () => (sindicatos.data ?? []).filter((s) => s.tipo === "laboral"),
    [sindicatos.data],
  );

  useEffect(() => {
    if (!open) return;
    setAba("dados");
    setPropagarRiscos(false);
    if (!cargo) { setForm(blank); return; }
    setForm({
      nome: cargo.nome ?? "",
      descricao: cargo.descricao ?? "",
      cbo: cargo.cbo ?? "",
      ativo: cargo.ativo ?? true,
      insalubre_periculoso: !!cargo.insalubre_periculoso,
      insalubre: !!cargo.insalubre,
      perigoso: !!cargo.perigoso,
      insalubridade_percentual: cargo.insalubridade_percentual ? String(cargo.insalubridade_percentual) : "",
      periculosidade_percentual: cargo.periculosidade_percentual ? String(cargo.periculosidade_percentual) : "",
      base_horas_mes: String(cargo.base_horas_mes ?? 220),
      base_dias_mes: String(cargo.base_dias_mes ?? 30),
      exige_cnh: !!cargo.exige_cnh,
      cnh_categoria_minima: cargo.cnh_categoria_minima ?? "",
      exige_epi: !!cargo.exige_epi,
      sindicato_laboral_id: laboralPorCargo.data?.[cargo.id] ?? SEM_LABORAL,
    });
  }, [open, cargo, laboralPorCargo.data]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error("O nome do cargo é obrigatório."); setAba("dados"); return; }
    const insal = numeroBR(form.insalubridade_percentual);
    const peric = numeroBR(form.periculosidade_percentual);
    try {
      const salvo = await upsert.mutateAsync({
        id: cargo?.id,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        cbo: form.cbo.trim() || null,
        ativo: form.ativo,
        insalubre_periculoso: form.insalubre_periculoso,
        insalubre: form.insalubre_periculoso ? form.insalubre || insal > 0 : false,
        perigoso: form.insalubre_periculoso ? form.perigoso || peric > 0 : false,
        insalubridade_percentual: form.insalubre_periculoso ? insal : 0,
        periculosidade_percentual: form.insalubre_periculoso ? peric : 0,
        base_horas_mes: numeroBR(form.base_horas_mes) || 220,
        base_dias_mes: numeroBR(form.base_dias_mes) || 30,
        exige_cnh: form.exige_cnh,
        cnh_categoria_minima: form.exige_cnh ? form.cnh_categoria_minima || null : null,
        exige_epi: form.exige_epi,
      } as Parameters<typeof upsert.mutateAsync>[0]);

      const laboralAtual = cargo ? laboralPorCargo.data?.[cargo.id] ?? null : null;
      const laboralNovo = form.sindicato_laboral_id === SEM_LABORAL ? null : form.sindicato_laboral_id;
      if (laboralNovo !== laboralAtual) {
        await setLaboral.mutateAsync({ cargoId: salvo.id, sindicatoId: laboralNovo });
      }

      if (propagarRiscos && colaboradoresCount > 0) {
        await propagar.mutateAsync({
          cargoId: salvo.id,
          insalubridade_percentual: form.insalubre_periculoso ? insal : 0,
          periculosidade_percentual: form.insalubre_periculoso ? peric : 0,
        });
      }

      toast.success(cargo ? "Cargo atualizado." : "Cargo cadastrado.");
      onSaved?.(salvo);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao salvar", {
        description: msg.includes("23505") ? "Já existe um cargo com este nome." : msg,
      });
    }
  };

  const salvando = upsert.isPending || setLaboral.isPending || propagar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-4rem)]"
      >
        {/* Cabeçalho fixo com o nome do cargo em edição */}
        <div className="shrink-0 border-b bg-card px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Briefcase className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate uppercase">{form.nome || (cargo ? cargo.nome : "Novo cargo")}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {cargo
              ? `${colaboradoresCount} colaborador(es) neste cargo`
              : "Depois de salvar, cadastre o piso do sindicato patronal na aba Salários."}
          </DialogDescription>
        </div>

        <Tabs value={aba} onValueChange={setAba} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 overflow-x-auto border-b px-4 py-2 sm:px-6">
            <TabsList className="w-max">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="salarios">Salários</TabsTrigger>
              <TabsTrigger value="riscos">Riscos e base</TabsTrigger>
              <TabsTrigger value="requisitos">Requisitos</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
            <TabsContent value="dados" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cargo-nome">Nome do cargo *</Label>
                <Input
                  id="cargo-nome" maxLength={120} placeholder="Ex: Pizzaiolo Sênior"
                  value={form.nome} onChange={(e) => set({ nome: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cargo-cbo">CBO</Label>
                  <Input
                    id="cargo-cbo" placeholder="Opcional"
                    value={form.cbo} onChange={(e) => set({ cbo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sindicato laboral</Label>
                  <Select
                    value={form.sindicato_laboral_id}
                    onValueChange={(v) => set({ sindicato_laboral_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_LABORAL}>Nenhum</SelectItem>
                      {laborais.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    O laboral vem do cargo; o patronal vem da unidade.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cargo-descricao">Descrição</Label>
                <Textarea
                  id="cargo-descricao" rows={3} placeholder="Breve descrição das responsabilidades."
                  value={form.descricao} onChange={(e) => set({ descricao: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                <Switch checked={form.ativo} onCheckedChange={(v) => set({ ativo: v })} />
                Cargo ativo (disponível para novos cadastros)
              </label>
            </TabsContent>

            <TabsContent value="salarios" className="mt-0">
              {cargo ? (
                <CargoSalariosUnidadePanel cargoId={cargo.id} />
              ) : (
                <p className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                  <Landmark className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Salve o cargo para cadastrar o piso do sindicato patronal e os ajustes por unidade.
                </p>
              )}
            </TabsContent>

            <TabsContent value="riscos" className="mt-0 space-y-4">
              <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                <Switch
                  checked={form.insalubre_periculoso}
                  onCheckedChange={(v) => set({ insalubre_periculoso: v })}
                />
                Cargo insalubre ou perigoso
              </label>

              {form.insalubre_periculoso && (
                <>
                  <CargoRiscosFields
                    insalubridade={form.insalubridade_percentual}
                    periculosidade={form.periculosidade_percentual}
                    cargoInsalubre={form.insalubre_periculoso}
                    cargoPerigoso={form.insalubre_periculoso}
                    onChange={(patch) =>
                      set({
                        insalubridade_percentual: patch.insalubridade ?? form.insalubridade_percentual,
                        periculosidade_percentual: patch.periculosidade ?? form.periculosidade_percentual,
                      })
                    }
                  />
                  {colaboradoresCount > 0 && (
                    <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                      <Switch checked={propagarRiscos} onCheckedChange={setPropagarRiscos} />
                      <span>
                        Aplicar estes percentuais aos {colaboradoresCount} colaborador(es) deste cargo
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          Os mesmos campos existem na ficha do colaborador; sem marcar, cada ficha
                          mantém o percentual atual.
                        </span>
                      </span>
                    </label>
                  )}
                </>
              )}

              <div className="space-y-3 rounded-xl border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="size-4 text-primary" aria-hidden="true" /> Base de cálculo
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cargo-horas">Base de horas por mês</Label>
                    <Input
                      id="cargo-horas" inputMode="decimal" placeholder="220"
                      value={form.base_horas_mes} onChange={(e) => set({ base_horas_mes: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cargo-dias">Base de dias por mês</Label>
                    <Input
                      id="cargo-dias" inputMode="decimal" placeholder="30"
                      value={form.base_dias_mes} onChange={(e) => set({ base_dias_mes: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Usada como padrão do valor-hora e do valor-dia na remuneração do colaborador.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="requisitos" className="mt-0 space-y-4">
              <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                <Switch checked={form.exige_cnh} onCheckedChange={(v) => set({ exige_cnh: v })} />
                Exige CNH
              </label>
              {form.exige_cnh && (
                <div className="space-y-2">
                  <Label>Categoria mínima</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CNH.map((c) => (
                      <Button
                        key={c} type="button" size="sm"
                        variant={form.cnh_categoria_minima === c ? "secondary" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => set({ cnh_categoria_minima: c })}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                <Switch checked={form.exige_epi} onCheckedChange={(v) => set({ exige_epi: v })} />
                Exige entrega de EPI
              </label>
              <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Requisitos do cargo entram como pendência na ficha de quem for admitido nele.
              </p>
              {cargo && colaboradoresCount > 0 && (
                <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Users className="size-3.5" aria-hidden="true" /> {colaboradoresCount} colaborador(es)
                  serão avaliados por estes requisitos.
                </p>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {/* Rodapé fixo */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-card px-4 py-3 sm:px-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando..." : cargo ? "Salvar" : "Cadastrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

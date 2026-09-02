import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { costCenterSchema, validateWithToast } from "@/lib/validations";

interface FormValues {
  name: string;
  description: string;
  is_active: boolean;
}

export interface CostCenterEditItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  visible_pf?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (newId?: string) => void;
  editItem?: CostCenterEditItem | null;
}

export function CostCenterFormDialog({ open, onOpenChange, onSaved, editItem }: Props) {
  const { user } = useAuth();
  const { companies } = useCompanyContext();
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: "", description: "", is_active: true },
  });

  const visiblePf = false;
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const isActive = watch("is_active");

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (!open) return;
    if (editItem) {
      setValue("name", editItem.name);
      setValue("description", editItem.description ?? "");
      setValue("is_active", editItem.is_active);
      supabase
        .from("cost_center_companies" as any)
        .select("company_id")
        .eq("cost_center_id", editItem.id)
        .then(({ data }) => {
          setSelectedCompanyIds(((data ?? []) as any[]).map((r) => r.company_id));
        });
    } else {
      reset({ name: "", description: "", is_active: true });
      setSelectedCompanyIds([]);
    }
  }, [open, editItem, setValue, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;

    if (!visiblePf && selectedCompanyIds.length === 0) {
      toast.error("Selecione pelo menos uma vinculação (Pessoa Física ou empresa)");
      return;
    }

    const validated = validateWithToast(costCenterSchema, values, toast.error);
    if (!validated) return;

    const payload = {
      name: validated.name,
      description: validated.description ? validated.description : null,
      is_active: values.is_active,
      visible_pf: visiblePf,
    };

    let costCenterId = editItem?.id;

    if (editItem) {
      const { error } = await supabase
        .from("cost_centers")
        .update(payload as any)
        .eq("id", editItem.id);
      if (error) {
        toast.error("Erro ao atualizar", { description: error.message });
        return;
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("cost_centers")
        .insert({ ...payload, user_id: user.id } as any)
        .select("id")
        .single();
      if (error || !inserted) {
        toast.error("Erro ao criar", { description: error?.message });
        return;
      }
      costCenterId = (inserted as any).id;
    }

    if (costCenterId) {
      await (supabase.from("cost_center_companies" as any) as any)
        .delete()
        .eq("cost_center_id", costCenterId);
      if (selectedCompanyIds.length > 0) {
        await (supabase.from("cost_center_companies" as any) as any).insert(
          selectedCompanyIds.map((cid) => ({ cost_center_id: costCenterId, company_id: cid }))
        );
      }
    }

    toast.success(editItem ? "Centro de custo atualizado" : "Centro de custo criado");
    onSaved(costCenterId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Centro de Custo" : "Novo Centro de Custo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cc-name">Nome</Label>
            <Input
              id="cc-name"
              placeholder="Ex: Cozinha, Delivery, Administrativo..."
              {...register("name")}
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cc-description">Descrição (opcional)</Label>
            <Textarea
              id="cc-description"
              placeholder="Detalhe o que este centro de custo agrupa"
              {...register("description")}
              maxLength={200}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="cc-active">Ativo</Label>
            <Switch
              id="cc-active"
              checked={isActive}
              onCheckedChange={(v) => setValue("is_active", v)}
            />
          </div>

          <div className="space-y-3">
            <Label>Vinculado a *</Label>
            <div className="space-y-2">
              {companies.map((company) => (
                <label key={company.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedCompanyIds.includes(company.id)}
                    onCheckedChange={() => toggleCompany(company.id)}
                  />
                  <span className="text-sm">{company.trade_name || company.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {editItem ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { paymentMethodSchema, validateWithToast } from "@/lib/validations";

interface FormValues {
  name: string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (newId?: string) => void;
  editItem?: { id: string; name: string; is_active: boolean; visible_pf?: boolean } | null;
}

export function PaymentMethodFormDialog({ open, onOpenChange, onSaved, editItem }: Props) {
  const { user } = useAuth();
  const { companies } = useCompanyContext();
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: "", is_active: true },
  });

  const [visiblePf, setVisiblePf] = useState(true);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const isActive = watch("is_active");

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (open) {
      if (editItem) {
        setValue("name", editItem.name);
        setValue("is_active", editItem.is_active);
        setVisiblePf(editItem.visible_pf ?? true);
        // Load existing company links
        supabase
          .from("payment_method_companies" as any)
          .select("company_id")
          .eq("payment_method_id", editItem.id)
          .then(({ data }) => {
            setSelectedCompanyIds((data ?? []).map((r: any) => r.company_id));
          });
      } else {
        reset({ name: "", is_active: true });
        setVisiblePf(true);
        setSelectedCompanyIds([]);
      }
    }
  }, [open, editItem, setValue, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;

    if (!visiblePf && selectedCompanyIds.length === 0) {
      toast.error("Selecione pelo menos uma vinculação (Pessoa Física ou empresa)");
      return;
    }

    const validated = validateWithToast(paymentMethodSchema, values, toast.error);
    if (!validated) return;
    const trimmed = validated.name;

    if (editItem) {
      const { error } = await supabase
        .from("payment_methods")
        .update({ name: trimmed, is_active: values.is_active, visible_pf: visiblePf } as any)
        .eq("id", editItem.id);
      if (error) { toast.error("Erro ao atualizar", { description: error.message }); return; }

      // Sync junction table
      await (supabase.from("payment_method_companies" as any) as any).delete().eq("payment_method_id", editItem.id);
      if (selectedCompanyIds.length > 0) {
        await supabase.from("payment_method_companies" as any).insert(
          selectedCompanyIds.map((cid) => ({ payment_method_id: editItem.id, company_id: cid }))
        );
      }
      toast.success("Forma de pagamento atualizada");
    } else {
      const { data: inserted, error } = await supabase
        .from("payment_methods")
        .insert({ name: trimmed, is_active: values.is_active, user_id: user.id, visible_pf: visiblePf } as any)
        .select("id")
        .single();
      if (error || !inserted) { toast.error("Erro ao criar", { description: error?.message }); return; }

      if (selectedCompanyIds.length > 0) {
        await supabase.from("payment_method_companies" as any).insert(
          selectedCompanyIds.map((cid) => ({ payment_method_id: (inserted as any).id, company_id: cid }))
        );
      }
      toast.success("Forma de pagamento criada");
      onSaved((inserted as any).id);
      onOpenChange(false);
      return;
    }
  const formId = "payment-method-form";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editItem ? "Editar Forma de Pagamento" : "Nova Forma de Pagamento"}
      size="md"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {editItem ? "Salvar" : "Criar"}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pm-name">Nome</Label>
          <Input id="pm-name" placeholder="Ex: PIX, Cartão de Crédito, Boleto..." {...register("name")} maxLength={60} autoFocus />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="pm-active">Ativa</Label>
          <Switch
            id="pm-active"
            checked={isActive}
            onCheckedChange={(v) => setValue("is_active", v)}
          />
        </div>

        <div className="space-y-3">
          <Label>Vinculado a *</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={visiblePf} onCheckedChange={(v) => setVisiblePf(!!v)} />
              <span className="text-sm">Pessoa Física (Pessoal)</span>
            </label>
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
      </form>
    </ResponsiveDialog>
  );
}

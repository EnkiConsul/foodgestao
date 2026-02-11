import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { paymentMethodSchema, validateWithToast } from "@/lib/validations";

interface FormValues {
  name: string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editItem: { id: string; name: string; is_active: boolean } | null;
}

export function PaymentMethodFormDialog({ open, onOpenChange, onSaved, editItem }: Props) {
  const { user } = useAuth();
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: "", is_active: true },
  });

  const isActive = watch("is_active");

  useEffect(() => {
    if (open) {
      if (editItem) {
        setValue("name", editItem.name);
        setValue("is_active", editItem.is_active);
      } else {
        reset({ name: "", is_active: true });
      }
    }
  }, [open, editItem, setValue, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    const validated = validateWithToast(paymentMethodSchema, values, toast.error);
    if (!validated) return;
    const trimmed = validated.name;

    if (editItem) {
      const { error } = await supabase
        .from("payment_methods")
        .update({ name: trimmed, is_active: values.is_active })
        .eq("id", editItem.id);
      if (error) { toast.error("Erro ao atualizar", { description: error.message }); return; }
      toast.success("Forma de pagamento atualizada");
    } else {
      const { error } = await supabase
        .from("payment_methods")
        .insert({ name: trimmed, is_active: values.is_active, user_id: user.id });
      if (error) { toast.error("Erro ao criar", { description: error.message }); return; }
      toast.success("Forma de pagamento criada");
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Forma de Pagamento" : "Nova Forma de Pagamento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

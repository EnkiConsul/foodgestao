import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { companySchema, validateWithToast } from "@/lib/validations";
import type { Database } from "@/integrations/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface CompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  company: Company | null;
}

export function CompanyFormDialog({ open, onOpenChange, onSaved, company }: CompanyFormDialogProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (company) {
      setName(company.name);
      setTradeName(company.trade_name ?? "");
      setCnpj(company.cnpj ?? "");
      setEmail(company.email ?? "");
      setPhone(company.phone ?? "");
      setAddress(company.address ?? "");
    } else {
      setName("");
      setTradeName("");
      setCnpj("");
      setEmail("");
      setPhone("");
      setAddress("");
    }
  }, [company, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const validated = validateWithToast(companySchema, {
      name, trade_name: tradeName || null, cnpj: cnpj || null,
      email: email || null, phone: phone || null, address: address || null,
    }, toast.error);
    if (!validated) return;

    setSaving(true);

    const payload = { ...validated, user_id: user.id };

    let error;
    if (company) {
      const { user_id, ...updatePayload } = payload;
      ({ error } = await supabase.from("companies").update(updatePayload).eq("id", company.id));
    } else {
      ({ error } = await supabase.from("companies").insert(payload as any));
    }

    if (error) {
      toast.error(company ? "Erro ao atualizar empresa" : "Erro ao criar empresa", { description: error.message });
    } else {
      toast.success(company ? "Empresa atualizada!" : "Empresa criada!");
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
          <DialogDescription>
            {company ? "Atualize os dados da empresa." : "Preencha os dados para cadastrar uma nova empresa."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Razão Social *</Label>
            <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Razão social da empresa" required maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-trade">Nome Fantasia</Label>
            <Input id="company-trade" value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="Nome fantasia" maxLength={200} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company-cnpj">CNPJ</Label>
              <Input id="company-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-phone">Telefone</Label>
              <Input id="company-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" maxLength={20} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-email">E-mail</Label>
            <Input id="company-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="empresa@exemplo.com" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-address">Endereço</Label>
            <Input id="company-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, cidade - UF" maxLength={300} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : company ? "Salvar" : "Criar Empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { companySchema, validateWithToast } from "@/lib/validations";
import { CnpjInput } from "@/components/shared/CnpjInput";
import type { CnpjLookupResult } from "@/hooks/useCnpjLookup";
import { isValidCnpj } from "@/lib/cnpj";
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
  const [cnpjLookupPending, setCnpjLookupPending] = useState(false);
  const [profileType, setProfileType] = useState<"pessoal" | "empresarial">("empresarial");
  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (company) {
      setProfileType((company as any).profile_type === "pessoal" ? "pessoal" : "empresarial");
      setName(company.name);
      setTradeName(company.trade_name ?? "");
      setCnpj(company.cnpj ?? "");
      setEmail(company.email ?? "");
      setPhone(company.phone ?? "");
      setAddress(company.address ?? "");
    } else {
      setProfileType("empresarial");
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
    if (cnpjLookupPending) {
      toast.error("Aguarde a consulta do CNPJ finalizar.");
      return;
    }

    const isPessoal = profileType === "pessoal";
    const cnpjDigits = cnpj.replace(/\D/g, "");
    if (!isPessoal && cnpjDigits.length > 0) {
      if (cnpjDigits.length !== 14) {
        toast.error("CNPJ deve conter 14 dígitos.");
        return;
      }
      if (!isValidCnpj(cnpjDigits)) {
        toast.error("CNPJ inválido — dígitos verificadores incorretos.");
        return;
      }
    }

    const validated = validateWithToast(companySchema, {
      name,
      trade_name: isPessoal ? null : (tradeName || null),
      cnpj: cnpj || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
    }, toast.error);
    if (!validated) return;

    setSaving(true);

    const payload = { ...validated, user_id: user.id, profile_type: profileType };

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
      await supabase.rpc("insert_audit_log", {
        _action: company ? "company_updated" : "company_created",
        _entity_type: "company",
        _entity_id: company?.id ?? undefined,
        _details: { target_name: name },
      });
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
          <DialogTitle>{company ? "Editar Perfil" : "Novo Perfil"}</DialogTitle>
          <DialogDescription>
            {company ? "Atualize os dados do perfil." : "Preencha os dados para cadastrar um novo perfil."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Perfil *</Label>
            <RadioGroup value={profileType} onValueChange={(v) => setProfileType(v as "pessoal" | "empresarial")} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pessoal" id="profile-pessoal" />
                <Label htmlFor="profile-pessoal" className="font-normal cursor-pointer">Pessoal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="empresarial" id="profile-empresarial" />
                <Label htmlFor="profile-empresarial" className="font-normal cursor-pointer">Empresarial</Label>
              </div>
            </RadioGroup>
          </div>
          {profileType === "pessoal" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="company-name">Nome Completo *</Label>
                <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" required maxLength={200} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company-cnpj">CPF</Label>
                  <Input id="company-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="000.000.000-00" maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-phone">Telefone</Label>
                  <Input id="company-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" maxLength={20} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-email">E-mail</Label>
                <Input id="company-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-address">Endereço</Label>
                <Input id="company-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, cidade - UF" maxLength={300} />
              </div>
            </>
          ) : (
            <>
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
                  <CnpjInput
                    id="company-cnpj"
                    value={cnpj}
                    onChange={setCnpj}
                    onLookup={(d: CnpjLookupResult) => {
                      if (d.razao_social) setName(d.razao_social);
                      if (d.nome_fantasia) setTradeName(d.nome_fantasia);
                      if (d.email && !email) setEmail(d.email);
                      if (d.telefone && !phone) setPhone(d.telefone);
                      if (d.endereco_formatado) setAddress(d.endereco_formatado);
                    }}
                  />
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
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : company ? "Salvar" : "Criar Perfil"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

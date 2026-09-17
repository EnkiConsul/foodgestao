import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { companySchema, validateWithToast } from "@/lib/validations";
import { CnpjInput } from "@/components/shared/CnpjInput";
import { EnderecoFields, type EnderecoValor } from "@/components/shared/EnderecoFields";
import { maskCep } from "@/lib/endereco";
import { parseEnderecoTexto } from "@/lib/dp/ficha-registro/endereco-parse";
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
  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [endereco, setEndereco] = useState<EnderecoValor>({});

  useEffect(() => {
    if (company) {
      setName(company.name);
      setTradeName(company.trade_name ?? "");
      setCnpj(company.cnpj ?? "");
      setEmail(company.email ?? "");
      setPhone(company.phone ?? "");
      setWhatsapp((company as any).whatsapp ?? "");
      const c = company as any;
      const temPartes = [c.cep, c.logradouro, c.numero, c.bairro, c.cidade, c.uf].some(Boolean);
      if (temPartes) {
        setEndereco({
          cep: c.cep ?? "",
          logradouro: c.logradouro ?? "",
          numero: c.numero ?? "",
          complemento: c.complemento ?? "",
          bairro: c.bairro ?? "",
          cidade: c.cidade ?? "",
          uf: c.uf ?? "",
        });
      } else {
        // Endereço antigo gravado em uma linha só: aproveita o que der para ler.
        const lido = parseEnderecoTexto(company.address);
        setEndereco({
          cep: lido.cep ?? "",
          logradouro: lido.logradouro ?? "",
          numero: lido.numero ?? "",
          complemento: "",
          bairro: lido.bairro ?? "",
          cidade: lido.cidade ?? "",
          uf: lido.uf ?? "",
        });
      }
    } else {
      setName("");
      setTradeName("");
      setCnpj("");
      setEmail("");
      setPhone("");
      setWhatsapp("");
      setEndereco({});
    }
  }, [company, open]);

  /** Linha única mantida para as telas que já mostram o endereço em texto. */
  const enderecoTexto = () => {
    const linha1 = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
    const linha2 = [endereco.complemento, endereco.bairro].filter(Boolean).join(" - ");
    const linha3 = [endereco.cidade, endereco.uf].filter(Boolean).join(" - ");
    return [linha1, linha2, linha3, endereco.cep].filter(Boolean).join(", ").slice(0, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (cnpjLookupPending) {
      toast.error("Aguarde a consulta do CNPJ finalizar.");
      return;
    }

    const cnpjDigits = cnpj.replace(/\D/g, "");
    if (cnpjDigits.length > 0) {
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
      trade_name: tradeName || null,
      cnpj: cnpj || null,
      email: email || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      address: enderecoTexto() || null,
    }, toast.error);
    if (!validated) return;

    setSaving(true);

    const limpar = (v?: string | null) => {
      const t = String(v ?? "").trim();
      return t ? t : null;
    };
    const payload = {
      ...validated,
      user_id: user.id,
      profile_type: "empresarial",
      cep: limpar(endereco.cep),
      logradouro: limpar(endereco.logradouro),
      numero: limpar(endereco.numero),
      complemento: limpar(endereco.complemento),
      bairro: limpar(endereco.bairro),
      cidade: limpar(endereco.cidade),
      uf: limpar(endereco.uf),
    };

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
                  <CnpjInput
                    id="company-cnpj"
                    value={cnpj}
                    onChange={setCnpj}
                    onLookup={(d: CnpjLookupResult) => {
                      if (d.razao_social) setName(d.razao_social);
                      if (d.nome_fantasia) setTradeName(d.nome_fantasia);
                      if (d.email && !email) setEmail(d.email);
                      if (d.telefone && !phone) setPhone(d.telefone);
                      setEndereco((atual) => ({
                        cep: d.cep ? maskCep(d.cep) : atual.cep,
                        logradouro: d.logradouro ?? atual.logradouro,
                        numero: d.numero ?? atual.numero,
                        complemento: d.complemento ?? atual.complemento,
                        bairro: d.bairro ?? atual.bairro,
                        cidade: d.municipio ?? atual.cidade,
                        uf: (d.uf ?? atual.uf ?? "").toUpperCase().slice(0, 2),
                      }));
                    }}
                    onPendingChange={setCnpjLookupPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-phone">Telefone</Label>
                  <Input id="company-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" maxLength={20} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company-whatsapp">WhatsApp Cadastrado</Label>
                  <Input id="company-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000" maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-email">E-mail</Label>
                  <Input id="company-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="empresa@exemplo.com" maxLength={100} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <EnderecoFields
                  idPrefix="company"
                  valor={endereco}
                  onChange={(patch) => setEndereco((e) => ({ ...e, ...patch }))}
                />
              </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || cnpjLookupPending || !name.trim()}>
              {saving ? "Salvando..." : cnpjLookupPending ? "Consultando CNPJ..." : company ? "Salvar" : "Criar Empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

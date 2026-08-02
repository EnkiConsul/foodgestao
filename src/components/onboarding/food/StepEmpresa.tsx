import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CnpjInput } from "@/components/shared/CnpjInput";
import { SegmentoSelect } from "./SegmentoSelect";
import { maskPhone } from "@/lib/phone";
import { AlertCircle } from "lucide-react";
import type { EmpresaFormData } from "@/pages/Onboarding";
import type { CnpjLookupResult } from "@/hooks/useCnpjLookup";

interface Props {
  data: EmpresaFormData;
  update: (patch: Partial<EmpresaFormData>) => void;
  errors: Partial<Record<keyof EmpresaFormData, string>>;
  setCnpjPending: (v: boolean) => void;
  cnpjInactive: boolean;
  setCnpjInactive: (v: boolean) => void;
}

function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function StepEmpresa({ data, update, errors, setCnpjPending, cnpjInactive, setCnpjInactive }: Props) {
  const handleCnpjLookup = (d: CnpjLookupResult) => {
    update({
      razaoSocial: d.razao_social ?? data.razaoSocial,
      nomeFantasia: d.nome_fantasia ?? data.nomeFantasia,
      cep: d.cep ? maskCep(d.cep) : data.cep,
      logradouro: d.logradouro ?? data.logradouro,
      numero: d.numero ?? data.numero,
      complemento: d.complemento ?? data.complemento,
      bairro: d.bairro ?? data.bairro,
      cidade: d.municipio ?? data.cidade,
      uf: (d.uf ?? data.uf).toUpperCase().slice(0, 2),
      telefoneEmpresa: d.telefone ? maskPhone(d.telefone) : data.telefoneEmpresa,
      emailEmpresa: d.email && !data.emailEmpresa ? d.email : data.emailEmpresa,
    });
    const situ = (d.situacao ?? "").toLowerCase();
    setCnpjInactive(situ.includes("baix") || situ.includes("inap") || situ.includes("suspens"));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Dados da Empresa</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Informe seu CNPJ para preencher os dados automaticamente.
        </p>
      </div>

      {/* Responsável */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Responsável pelo Cadastro
        </legend>
        <Field label="Nome Completo *" error={errors.nomeCompleto}>
          <Input
            value={data.nomeCompleto}
            onChange={(e) => update({ nomeCompleto: e.target.value })}
            placeholder="Seu nome completo"
            maxLength={120}
          />
        </Field>
      </fieldset>

      {/* Empresa */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Empresa
        </legend>

        <Field label="CNPJ *" error={data.cnpj.trim() ? undefined : errors.cnpj}>
          <CnpjInput
            value={data.cnpj}
            onChange={(v) => update({ cnpj: v })}
            onLookup={handleCnpjLookup}
            onPendingChange={setCnpjPending}
          />
        </Field>

        {cnpjInactive && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
            <span>
              Este CNPJ consta como <strong>inativo</strong> na Receita Federal. Verifique antes de continuar — o cadastro não será bloqueado.
            </span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Razão Social *" error={errors.razaoSocial}>
            <Input
              value={data.razaoSocial}
              onChange={(e) => update({ razaoSocial: e.target.value })}
              maxLength={200}
            />
          </Field>
          <Field label="Nome Fantasia" error={errors.nomeFantasia}>
            <Input
              value={data.nomeFantasia}
              onChange={(e) => update({ nomeFantasia: e.target.value })}
              maxLength={200}
            />
          </Field>
        </div>

        <Field label="Segmento *" error={errors.segmentoId}>
          <SegmentoSelect value={data.segmentoId} onChange={(v) => update({ segmentoId: v })} />
        </Field>
      </fieldset>

      {/* Endereço */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Endereço
        </legend>
        <div className="grid gap-4 md:grid-cols-[140px_1fr_120px]">
          <Field label="CEP *" error={errors.cep}>
            <Input
              value={data.cep}
              onChange={(e) => update({ cep: maskCep(e.target.value) })}
              placeholder="00000-000"
              maxLength={9}
              inputMode="numeric"
            />
          </Field>
          <Field label="Logradouro *" error={errors.logradouro}>
            <Input value={data.logradouro} onChange={(e) => update({ logradouro: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Número *" error={errors.numero}>
            <Input value={data.numero} onChange={(e) => update({ numero: e.target.value })} maxLength={20} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Complemento" error={errors.complemento}>
            <Input value={data.complemento} onChange={(e) => update({ complemento: e.target.value })} maxLength={100} />
          </Field>
          <Field label="Bairro *" error={errors.bairro}>
            <Input value={data.bairro} onChange={(e) => update({ bairro: e.target.value })} maxLength={100} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_120px]">
          <Field label="Cidade *" error={errors.cidade}>
            <Input value={data.cidade} onChange={(e) => update({ cidade: e.target.value })} maxLength={100} />
          </Field>
          <Field label="UF *" error={errors.uf}>
            <Input
              value={data.uf}
              onChange={(e) => update({ uf: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })}
              maxLength={2}
              placeholder="SP"
            />
          </Field>
        </div>
      </fieldset>

      {/* Contato */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contato
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Telefone" error={errors.telefoneEmpresa}>
            <Input
              value={data.telefoneEmpresa}
              onChange={(e) => update({ telefoneEmpresa: maskPhone(e.target.value) })}
              placeholder="(00) 0000-0000"
              maxLength={16}
              inputMode="numeric"
            />
          </Field>
          <Field label="WhatsApp *" error={errors.whatsappEmpresa}>
            <Input
              value={data.whatsappEmpresa}
              onChange={(e) => update({ whatsappEmpresa: maskPhone(e.target.value) })}
              placeholder="(00) 90000-0000"
              maxLength={16}
              inputMode="numeric"
            />
          </Field>
        </div>
        <Field label="E-mail *" error={errors.emailEmpresa}>
          <Input
            type="email"
            value={data.emailEmpresa}
            onChange={(e) => update({ emailEmpresa: e.target.value })}
            placeholder="contato@empresa.com"
            maxLength={150}
          />
        </Field>
      </fieldset>

      {/* LGPD */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
        <Checkbox
          id="lgpd-accept"
          checked={data.aceitouLgpd}
          onCheckedChange={(v) => update({ aceitouLgpd: v === true })}
          className="mt-0.5"
        />
        <label htmlFor="lgpd-accept" className="text-xs leading-relaxed cursor-pointer text-muted-foreground">
          Li e concordo com os{" "}
          <a href="/legal/termos" target="_blank" className="text-primary underline hover:no-underline">
            Termos de Uso
          </a>{" "}
          e com a{" "}
          <a href="/legal/privacidade" target="_blank" className="text-primary underline hover:no-underline">
            Política de Privacidade
          </a>{" "}
          do 360°FOOD.
        </label>
      </div>
      {errors.aceitouLgpd && <p className="text-xs text-destructive">{errors.aceitouLgpd}</p>}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

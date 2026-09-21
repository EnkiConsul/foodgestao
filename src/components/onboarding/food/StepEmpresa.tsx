import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CnpjInput } from "@/components/shared/CnpjInput";
import { EnderecoFields } from "@/components/shared/EnderecoFields";
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
        <Field id="onb-nome" label="Nome Completo" required error={errors.nomeCompleto}>
          <Input
            id="onb-nome"
            value={data.nomeCompleto}
            onChange={(e) => update({ nomeCompleto: e.target.value })}
            placeholder="Seu nome completo"
            maxLength={120}
            autoComplete="name"
            aria-required="true"
            aria-invalid={errors.nomeCompleto ? true : undefined}
            aria-describedby={errors.nomeCompleto ? "onb-nome-erro" : undefined}
          />
        </Field>
      </fieldset>

      {/* Empresa */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Empresa
        </legend>

        <Field id="onb-cnpj" label="CNPJ" required error={errors.cnpj}>
          <CnpjInput
            id="onb-cnpj"
            value={data.cnpj}
            onChange={(v) => update({ cnpj: v })}
            onLookup={handleCnpjLookup}
            onPendingChange={setCnpjPending}
            required
            invalid={Boolean(errors.cnpj)}
            describedBy={errors.cnpj ? "onb-cnpj-erro" : undefined}
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
          <Field id="onb-razao" label="Razão Social" required error={errors.razaoSocial}>
            <Input
              id="onb-razao"
              value={data.razaoSocial}
              onChange={(e) => update({ razaoSocial: e.target.value })}
              maxLength={200}
              aria-required="true"
              aria-invalid={errors.razaoSocial ? true : undefined}
              aria-describedby={errors.razaoSocial ? "onb-razao-erro" : undefined}
            />
          </Field>
          <Field id="onb-fantasia" label="Nome Fantasia" error={errors.nomeFantasia}>
            <Input
              id="onb-fantasia"
              value={data.nomeFantasia}
              onChange={(e) => update({ nomeFantasia: e.target.value })}
              maxLength={200}
              aria-invalid={errors.nomeFantasia ? true : undefined}
              aria-describedby={errors.nomeFantasia ? "onb-fantasia-erro" : undefined}
            />
          </Field>
        </div>

        <Field id="onb-segmento" label="Segmento" required error={errors.segmentoId}>
          <SegmentoSelect
            id="onb-segmento"
            value={data.segmentoId}
            onChange={(v) => update({ segmentoId: v })}
            required
            invalid={Boolean(errors.segmentoId)}
            describedBy={errors.segmentoId ? "onb-segmento-erro" : undefined}
          />
        </Field>
      </fieldset>

      {/* Endereço */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Endereço
        </legend>
        <EnderecoFields
          idPrefix="empresa"
          valor={{
            cep: data.cep,
            logradouro: data.logradouro,
            numero: data.numero,
            complemento: data.complemento,
            cidade: data.cidade,
            bairro: data.bairro,
            uf: data.uf,
          }}
          onChange={(patch) => update(patch as Partial<EmpresaFormData>)}
          erros={errors as Record<string, string>}
          obrigatorios={["cep", "logradouro", "numero", "bairro", "cidade", "uf"]}
        />
      </fieldset>

      {/* Contato */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contato
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="onb-telefone" label="Telefone" error={errors.telefoneEmpresa}>
            <Input
              id="onb-telefone"
              value={data.telefoneEmpresa}
              onChange={(e) => update({ telefoneEmpresa: maskPhone(e.target.value) })}
              placeholder="(00) 0000-0000"
              maxLength={16}
              inputMode="numeric"
              autoComplete="tel"
              aria-invalid={errors.telefoneEmpresa ? true : undefined}
              aria-describedby={errors.telefoneEmpresa ? "onb-telefone-erro" : undefined}
            />
          </Field>
          <Field id="onb-whatsapp" label="WhatsApp" required error={errors.whatsappEmpresa}>
            <Input
              id="onb-whatsapp"
              value={data.whatsappEmpresa}
              onChange={(e) => update({ whatsappEmpresa: maskPhone(e.target.value) })}
              placeholder="(00) 90000-0000"
              maxLength={16}
              inputMode="numeric"
              aria-required="true"
              aria-invalid={errors.whatsappEmpresa ? true : undefined}
              aria-describedby={errors.whatsappEmpresa ? "onb-whatsapp-erro" : undefined}
            />
          </Field>
        </div>
        <Field id="onb-email" label="E-mail" required error={errors.emailEmpresa}>
          <Input
            id="onb-email"
            type="email"
            value={data.emailEmpresa}
            onChange={(e) => update({ emailEmpresa: e.target.value })}
            placeholder="contato@empresa.com"
            maxLength={150}
            autoComplete="email"
            aria-required="true"
            aria-invalid={errors.emailEmpresa ? true : undefined}
            aria-describedby={errors.emailEmpresa ? "onb-email-erro" : undefined}
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
          aria-required="true"
          aria-invalid={errors.aceitouLgpd ? true : undefined}
          aria-describedby={errors.aceitouLgpd ? "lgpd-accept-erro" : undefined}
        />
        <label htmlFor="lgpd-accept" className="text-xs leading-relaxed cursor-pointer text-muted-foreground">
          Li e concordo com os{" "}
          <a href="/legal/termos" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
            Termos de Uso
          </a>{" "}
          e com a{" "}
          <a href="/legal/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
            Política de Privacidade
          </a>{" "}
          do Aveto 360.
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

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OnboardingData } from "@/pages/Onboarding";

interface Props {
  data: OnboardingData;
  update: (d: Partial<OnboardingData>) => void;
}

export function StepProfileData({ data, update }: Props) {
  const showCompany = ["mei", "microempresa", "hibrido"].includes(data.profileType);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Preencha seus dados básicos:</p>

      <div className="space-y-2">
        <Label>Nome completo</Label>
        <Input
          value={data.fullName}
          onChange={(e) => update({ fullName: e.target.value })}
          placeholder="Seu nome"
          maxLength={100}
        />
      </div>

      <div className="space-y-2">
        <Label>{showCompany ? "CPF" : "CPF (opcional)"}</Label>
        <Input
          value={data.document}
          onChange={(e) => update({ document: e.target.value })}
          placeholder="000.000.000-00"
          maxLength={18}
        />
      </div>

      <div className="space-y-2">
        <Label>Telefone (opcional)</Label>
        <Input
          value={data.phone}
          onChange={(e) => update({ phone: e.target.value })}
          placeholder="(11) 99999-9999"
          maxLength={20}
        />
      </div>

      {showCompany && (
        <>
          <div className="space-y-2">
            <Label>Nome da Empresa</Label>
            <Input
              value={data.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              placeholder="Nome da sua empresa"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label>CNPJ (opcional)</Label>
            <Input
              value={data.companyCnpj}
              onChange={(e) => update({ companyCnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
          </div>
        </>
      )}
    </div>
  );
}

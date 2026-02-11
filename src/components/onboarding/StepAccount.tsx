import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OnboardingData } from "@/pages/Onboarding";

const accountTypes = [
  { value: "corrente", label: "Conta Corrente" },
  { value: "poupanca", label: "Poupança" },
  { value: "investimento", label: "Investimento" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" },
];

interface Props {
  data: OnboardingData;
  update: (d: Partial<OnboardingData>) => void;
}

export function StepAccount({ data, update }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Crie sua primeira conta financeira:</p>

      <div className="space-y-2">
        <Label>Nome da conta</Label>
        <Input
          value={data.accountName}
          onChange={(e) => update({ accountName: e.target.value })}
          placeholder="Ex: Nubank, Itaú, Caixa"
          maxLength={60}
        />
      </div>

      <div className="space-y-2">
        <Label>Tipo</Label>
        <Select value={data.accountType} onValueChange={(v) => update({ accountType: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accountTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Saldo inicial (R$)</Label>
        <Input
          value={data.initialBalance}
          onChange={(e) => update({ initialBalance: e.target.value })}
          placeholder="0,00"
          maxLength={15}
        />
      </div>
    </div>
  );
}

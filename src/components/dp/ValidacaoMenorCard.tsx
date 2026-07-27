import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { DpContentCard } from "@/components/dp/DpPage";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDpConfigDp } from "@/hooks/useDpConfigDp";

/**
 * Trava legal para menores de 18 anos aplicada ao vincular jornadas/escalas:
 * bloqueia turno noturno (22h–5h), cargos insalubres/perigosos e carga horária
 * acima do permitido. Configuração da empresa (padrão).
 */
export function ValidacaoMenorCard() {
  const { config, save, saving, isLoading } = useDpConfigDp();

  const alternar = async (v: boolean) => {
    try {
      await save({ patch: { exige_validacao_menor: v }, unidadeId: null });
      toast.success(v ? "Validação de menores ativada" : "Validação de menores desativada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    }
  };

  return (
    <DpContentCard contentClassName="p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="valida-menor" className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Validar restrições para menores de 18 anos
          </Label>
          <p className="text-xs text-muted-foreground">
            Ao vincular uma jornada a um colaborador menor de idade, bloqueia turno noturno (22h–5h),
            cargos insalubres/perigosos e carga horária acima do permitido.
          </p>
        </div>
        <Switch
          id="valida-menor"
          checked={config.exige_validacao_menor}
          disabled={saving || isLoading}
          onCheckedChange={(v) => void alternar(v)}
        />
      </div>
    </DpContentCard>
  );
}

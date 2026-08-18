import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDpAdicionaisTempoServico } from "@/hooks/useDpAdicionaisTempoServico";
import { useDpSalarioFamiliaConfig } from "@/hooks/useDpSalarioFamiliaConfig";
import { moedaBR } from "@/lib/dp/cargos";
import {
  calcularAdicionalTempoServico,
  descreverAdicional,
  selecionarRegraTempoServico,
} from "@/lib/dp/tempoServico";

interface Props {
  admissao: string | null;
  cargoId: string | null;
  unidadeId: string | null;
  /** Sindicato laboral do colaborador. */
  sindicatoId: string | null;
  /** Base mensal informada na remuneração. */
  base: number;
  /** Piso do cargo resolvido para a unidade. */
  pisoCargo: number | null;
}

/**
 * Mostra o adicional por tempo de serviço adquirido pelo colaborador,
 * conforme a regra vigente (anuênio, triênio, quinquênio…).
 */
export function AdicionalTempoServicoCard({
  admissao,
  cargoId,
  unidadeId,
  sindicatoId,
  base,
  pisoCargo,
}: Props) {
  const { regras } = useDpAdicionaisTempoServico();
  const { config } = useDpSalarioFamiliaConfig();
  const referencia = new Date().toISOString().slice(0, 10);

  const regra = useMemo(
    () => selecionarRegraTempoServico(regras, { cargoId, unidadeId, sindicatoId }, referencia),
    [regras, cargoId, unidadeId, sindicatoId, referencia],
  );

  const calculo = useMemo(() => {
    const baseValor = regra?.base === "piso_cargo" ? pisoCargo ?? base : base;
    return calcularAdicionalTempoServico({
      regra,
      admissao,
      referencia,
      base: baseValor,
    });
  }, [regra, admissao, referencia, base, pisoCargo]);

  if (regras.length === 0) {
    return (
      <div className="col-span-2 mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Adicional por tempo de serviço não configurado.</span>{" "}
        Se a convenção prevê anuênio, triênio ou quinquênio, cadastre a regra em Cadastros →
        Adicionais e salário-família.
      </div>
    );
  }

  if (!regra) {
    return (
      <div className="col-span-2 mt-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Nenhuma regra de adicional por tempo de serviço se aplica a este cargo/unidade/sindicato.
      </div>
    );
  }

  return (
    <div className="col-span-2 mt-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">{regra.nome}</span>
        {calculo && calculo.valor > 0 && (
          <Badge variant="secondary">
            +{calculo.percentual}% · {moedaBR(calculo.valor)}/mês
          </Badge>
        )}
        {!config.adicionalAtivo && <Badge variant="outline">Não aplicado na folha</Badge>}
      </div>
      <p className="mt-1">
        {descreverAdicional(calculo)}
        {calculo?.mesesParaProximo != null
          ? ` · próximo ciclo em ${calculo.mesesParaProximo} mês(es)`
          : ""}
        {calculo ? ` · ${calculo.meses} mês(es) de casa` : ""}
      </p>
      {!config.adicionalAtivo && (
        <p className="mt-1">
          Ative "Aplicar na folha" em Cadastros → Adicionais e salário-família para o valor entrar
          no contracheque.
        </p>
      )}
    </div>
  );
}

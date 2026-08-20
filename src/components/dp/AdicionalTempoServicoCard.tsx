import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDpAdicionaisTempoServico } from "@/hooks/useDpAdicionaisTempoServico";
import { useDpSalarioFamiliaConfig } from "@/hooks/useDpSalarioFamiliaConfig";
import { moedaBR } from "@/lib/dp/cargos";
import {
  BASE_ADICIONAL_LABEL,
  ESCOPO_ADICIONAL_LABEL,
  calcularAdicionalTempoServico,
  descreverAdicional,
  rotuloCiclo,
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
  /** Executado antes de navegar para o cadastro de regras (fecha o diálogo). */
  onBeforeNavigate?: () => void;
}

/**
 * Mostra o adicional por tempo de serviço adquirido pelo colaborador,
 * conforme a regra vigente (anuênio, triênio, quinquênio…), com atalho
 * para o cadastro das regras coletivas.
 */
export function AdicionalTempoServicoCard({
  admissao,
  cargoId,
  unidadeId,
  sindicatoId,
  base,
  pisoCargo,
  onBeforeNavigate,
}: Props) {
  const navigate = useNavigate();
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

  const irParaCadastro = () => {
    onBeforeNavigate?.();
    navigate("/dp/cadastros/adicionais");
  };

  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
        Adicional por tempo de serviço
      </div>
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={irParaCadastro}>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Configurar regras
      </Button>
    </div>
  );

  if (regras.length === 0) {
    return (
      <div className="col-span-2 mt-4 space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        {cabecalho}
        <p>
          Nenhuma regra cadastrada. Se a convenção prevê anuênio, triênio ou quinquênio,
          cadastre a regra uma vez e ela vale para todo o grupo.
        </p>
      </div>
    );
  }

  if (!regra) {
    return (
      <div className="col-span-2 mt-4 space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {cabecalho}
        <p>Nenhuma regra de adicional por tempo de serviço se aplica a este cargo/unidade/sindicato.</p>
      </div>
    );
  }

  return (
    <div className="col-span-2 mt-4 space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      {cabecalho}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{regra.nome}</span>
        <Badge variant="outline">
          {rotuloCiclo(regra.ciclo_meses)} · {regra.percentual_por_ciclo}%
        </Badge>
        {calculo && calculo.valor > 0 && (
          <Badge variant="secondary">
            +{calculo.percentual}% · {moedaBR(calculo.valor)}/mês
          </Badge>
        )}
        {!config.adicionalAtivo && <Badge variant="outline">Não aplicado na folha</Badge>}
      </div>
      <p>
        {ESCOPO_ADICIONAL_LABEL[regra.escopo]} · base: {BASE_ADICIONAL_LABEL[regra.base]}
        {regra.acumula ? " · acumula por ciclo" : " · não acumula"}
      </p>
      <p>
        {descreverAdicional(calculo)}
        {calculo?.mesesParaProximo != null
          ? ` · próximo ciclo em ${calculo.mesesParaProximo} mês(es)`
          : ""}
        {calculo ? ` · ${calculo.meses} mês(es) de casa` : ""}
      </p>
      {!config.adicionalAtivo && (
        <p>
          Ative "Aplicar na folha" em Cadastros → Adicionais e salário-família para o valor entrar
          no contracheque.
        </p>
      )}
    </div>
  );
}

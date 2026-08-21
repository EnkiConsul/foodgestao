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
  calcularAdicionalPorModo,
  descreverAdicional,
  rotuloCiclo,
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

  const total = useMemo(
    () =>
      calcularAdicionalPorModo({
        regras,
        alvo: { cargoId, unidadeId, sindicatoId },
        admissao,
        referencia,
        base,
        pisoCargo,
        modo: config.adicionalModo,
      }),
    [regras, cargoId, unidadeId, sindicatoId, admissao, referencia, base, pisoCargo, config.adicionalModo],
  );

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
      <div className="md:col-span-2 mt-4 space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        {cabecalho}
        <p>
          Nenhuma regra cadastrada. Se a convenção prevê anuênio, triênio ou quinquênio,
          cadastre a regra uma vez e ela vale para todo o grupo.
        </p>
      </div>
    );
  }

  // Sem ciclo adquirido: versão enxuta, sem citar triênio/quinquênio,
  // apenas informando que o critério ainda não foi atendido.
  if (total.itens.length === 0) {
    return (
      <div className="md:col-span-2 mt-4 space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {cabecalho}
        <p>
          A empresa possui adicional por tempo de serviço, mas este colaborador ainda não atende
          aos critérios ({total.meses} mês(es) de casa).
        </p>
      </div>
    );
  }

  return (
    <div className="md:col-span-2 mt-4 space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      {cabecalho}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          +{total.percentual}% · {moedaBR(total.valor)}/mês
        </Badge>
        <Badge variant="outline">
          {config.adicionalModo === "cumulativo" ? "Regras cumulativas" : "Escada"}
        </Badge>
        {!config.adicionalAtivo && <Badge variant="outline">Não aplicado na folha</Badge>}
      </div>
      {total.itens.map((item) => (
        <div key={item.regra.id} className="space-y-0.5">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{item.regra.nome}</span>
            <Badge variant="outline">
              {rotuloCiclo(item.regra.ciclo_meses)} · {item.regra.percentual_por_ciclo}%
            </Badge>
          </p>
          <p>
            {ESCOPO_ADICIONAL_LABEL[item.regra.escopo]} · base:{" "}
            {BASE_ADICIONAL_LABEL[item.regra.base]}
            {item.regra.acumula ? " · acumula por ciclo" : " · não acumula"}
          </p>
          <p>
            {descreverAdicional(item)}
            {item.mesesParaProximo != null
              ? ` · próximo ciclo em ${item.mesesParaProximo} mês(es)`
              : ""}
          </p>
        </div>
      ))}
      <p>{total.meses} mês(es) de casa</p>
      {!config.adicionalAtivo && (
        <p>
          Ative "Aplicar na folha" em Cadastros → Adicionais e salário-família para o valor entrar
          no contracheque.
        </p>
      )}
    </div>
  );
}



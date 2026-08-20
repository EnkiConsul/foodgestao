import { useNavigate } from "react-router-dom";
import { CalendarClock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDpAdicionaisTempoServico } from "@/hooks/useDpAdicionaisTempoServico";
import { useSindicatoDoCargo } from "@/hooks/useSindicatoDoCargo";
import {
  BASE_ADICIONAL_LABEL,
  ESCOPO_ADICIONAL_LABEL,
  calcularAdicionalTempoServico,
  rotuloCiclo,
  selecionarRegraTempoServico,
} from "@/lib/dp/tempoServico";
import { formatarBRL } from "@/lib/dp/folha";

interface Props {
  cargoId: string | null;
  unidadeId: string | null;
  /** Data de admissão do colaborador (ISO). */
  admissao: string | null;
  /** Base mensal já resolvida pela tela (salário do colaborador ou piso). */
  base: number | null;
  /** Executado antes de navegar para o cadastro de regras. */
  onBeforeNavigate?: () => void;
}

/**
 * Bloco somente leitura na aba Remuneração: mostra a regra coletiva de
 * adicional por tempo de serviço que se aplica ao colaborador e o valor
 * estimado hoje. O adicional é regra coletiva — não se digita na ficha.
 */
export function AdicionalTempoServicoAviso({
  cargoId,
  unidadeId,
  admissao,
  base,
  onBeforeNavigate,
}: Props) {
  const navigate = useNavigate();
  const { regras } = useDpAdicionaisTempoServico();
  const sindicato = useSindicatoDoCargo(cargoId, unidadeId);

  const hoje = new Date().toISOString().slice(0, 10);
  const regra = selecionarRegraTempoServico(regras ?? [], {
    cargoId,
    unidadeId,
    sindicatoId: sindicato.data?.laboral?.id ?? null,
  }, hoje);

  const calc = calcularAdicionalTempoServico({
    regra,
    admissao,
    referencia: hoje,
    base: base ?? 0,
  });

  const irParaCadastro = () => {
    onBeforeNavigate?.();
    navigate("/dp/cadastros/adicionais");
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          Adicional por tempo de serviço
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={irParaCadastro}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Configurar regras
        </Button>
      </div>

      {!regra ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma regra cadastrada para este cargo/unidade. Anuênio, triênio e afins são
          regra coletiva — cadastre uma vez e vale para todo o grupo.
        </p>
      ) : (
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="text-foreground">
            {regra.nome} — {rotuloCiclo(regra.ciclo_meses)} de {regra.percentual_por_ciclo}%
            {regra.max_ciclos ? ` (até ${regra.max_ciclos} ciclos)` : ""}
          </div>
          <div>
            {ESCOPO_ADICIONAL_LABEL[regra.escopo]} · base: {BASE_ADICIONAL_LABEL[regra.base]}
            {regra.acumula ? " · acumula por ciclo" : " · não acumula"}
          </div>
          <div>
            {calc && calc.ciclos > 0 ? (
              <>
                Hoje:{" "}
                <strong className="text-foreground">
                  {calc.percentual}% = {formatarBRL(calc.valor)}/mês
                </strong>
                {calc.mesesParaProximo != null
                  ? ` · próximo ciclo em ${calc.mesesParaProximo} mês(es)`
                  : " · limite de ciclos atingido"}
              </>
            ) : admissao ? (
              <>
                Sem adicional adquirido ainda
                {calc?.mesesParaProximo != null
                  ? ` · faltam ${calc.mesesParaProximo} mês(es) para o primeiro ciclo`
                  : ""}
              </>
            ) : (
              "Informe a data de admissão para estimar o adicional."
            )}
          </div>
        </div>
      )}
    </div>
  );
}

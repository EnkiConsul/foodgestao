// ------------------------------------------------------------------
// Domínio: DP → orientação jurídica do tipo de vínculo.
//
// O sistema é orientador do empreendedor: sinaliza o risco de vínculos
// que a lei trabalhista não reconhece (freelancer) ou que costumam ser
// descaracterizados na Justiça (PJ/MEI), sempre sem bloquear o cadastro.
// Função pura — sem React, sem Supabase.
// ------------------------------------------------------------------

export type RegimeRiscoTipo = "freelancer" | "pj" | "socio" | "autonomo";

export interface RegimeRiscoAtalho {
  /** Regime de destino ao aceitar a sugestão. */
  regime: "clt" | "intermitente";
  label: string;
}

export interface RegimeRisco {
  tipo: RegimeRiscoTipo;
  titulo: string;
  mensagem: string;
  /** Linha extra quando o próprio cadastro contradiz a tese de autonomia. */
  reforco: string | null;
  atalhos: RegimeRiscoAtalho[];
  verMaisLabel?: string;
}

export interface EntradaRegimeRisco {
  regime?: string | null;
  /**
   * Rótulo do vínculo escolhido no cadastro (`PJ`, `Socio`, `Autonomo`…).
   * Necessário porque PJ, Sócio e Autônomo compartilham o regime `pj` no banco.
   */
  vinculo?: string | null;
  /** O cadastro define horário/dias fixos ou participa de escala e ponto. */
  temHorarioDefinido?: boolean;
}

const REFORCO_PEJOTIZACAO =
  "Este cadastro tem horário e escala definidos, o que reforça a caracterização de vínculo.";

/**
 * Risco jurídico do vínculo escolhido. Retorna null para vínculos formais
 * (CLT, intermitente, estágio, temporário), que não exigem orientação.
 */
export function regimeRisco(input: EntradaRegimeRisco): RegimeRisco | null {
  const regime = (input.regime ?? "").toLowerCase();
  const vinculo = (input.vinculo ?? "").toLowerCase();

  if (regime === "freelancer" || vinculo === "freelancer") {
    return {
      tipo: "freelancer",
      titulo: "Freelancer não é um vínculo previsto na lei trabalhista.",
      mensagem:
        "Se essa pessoa trabalha com habitualidade, cumpre horário e recebe ordens da sua equipe, a Justiça do Trabalho tende a reconhecer vínculo de emprego — com registro retroativo, férias, 13º, FGTS e multa. Para chamar quando precisa, com segurança, o caminho legal é o contrato intermitente.",
      reforco: input.temHorarioDefinido ? REFORCO_PEJOTIZACAO : null,
      atalhos: [{ regime: "intermitente", label: "Mudar para Intermitente" }],
      verMaisLabel: "Ver como funciona o intermitente",
    };
  }

  // Sócio não é caso de pejotização: a remuneração é pró-labore/lucros e ele
  // não entra na folha CLT. O ponto de atenção é o "sócio só no papel".
  if (vinculo === "socio") {
    return {
      tipo: "socio",
      titulo: "Sócio é remunerado por pró-labore, não por folha CLT.",
      mensagem:
        "Este cadastro serve para controle interno de escala e operação: o sócio recebe pró-labore e distribuição de lucros, sem férias, 13º ou FGTS. Atenção ao “sócio só no papel” — pessoa sem poder de gestão nem participação real nos resultados, cumprindo horário e ordens como empregada: nesse caso a Justiça do Trabalho pode reconhecer vínculo de emprego. Se ela atua como empregada, o registro correto é CLT.",
      reforco: input.temHorarioDefinido
        ? "Este cadastro tem horário e escala definidos — verifique se há de fato autonomia de gestão."
        : null,
      atalhos: [],
    };
  }

  if (vinculo === "autonomo") {
    return {
      tipo: "autonomo",
      titulo: "Autônomo só se sustenta com autonomia real.",
      mensagem:
        "O trabalho autônomo pressupõe que a pessoa decide como e quando executa o serviço, atende outros clientes e não se submete a escala nem a ordens diretas. Se houver pessoalidade, subordinação e habitualidade, a Justiça do Trabalho pode reconhecer vínculo de emprego — com registro retroativo, férias, 13º, FGTS + 40% e INSS. Para quem trabalha em escala na sua operação, o caminho seguro é CLT (fixo) ou intermitente (por convocação).",
      reforco: input.temHorarioDefinido ? REFORCO_PEJOTIZACAO : null,
      atalhos: [
        { regime: "intermitente", label: "Mudar para Intermitente" },
        { regime: "clt", label: "Mudar para CLT" },
      ],
      verMaisLabel: "Ver os riscos e alternativas",
    };
  }

  if (regime === "pj" || regime === "mei") {
    return {
      tipo: "pj",
      titulo: "Atenção ao risco de pejotização.",
      mensagem:
        "PJ/MEI só se sustenta quando não há pessoalidade, subordinação, horário imposto nem habitualidade. Se essa pessoa cumpre escala, bate ponto, recebe ordens diretas e presta serviço só para você, a Justiça do Trabalho pode reconhecer vínculo de emprego — com registro retroativo, férias, 13º, FGTS + 40%, INSS e multa; o MEI ainda pode ser desenquadrado. Para quem trabalha em escala na sua operação, o caminho seguro é CLT (fixo) ou intermitente (por convocação).",
      reforco: input.temHorarioDefinido ? REFORCO_PEJOTIZACAO : null,
      atalhos: [
        { regime: "intermitente", label: "Mudar para Intermitente" },
        { regime: "clt", label: "Mudar para CLT" },
      ],
      verMaisLabel: "Ver os riscos e alternativas",
    };
  }

  return null;
}


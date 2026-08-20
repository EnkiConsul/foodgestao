# Adicional por tempo de serviço: por que a Cristiane caiu no triênio

## O que está acontecendo (confirmado nos dados)

Existem **duas regras cadastradas com o mesmo escopo (toda a empresa) e a mesma vigência (01/01/2026)**:

- Ciclo de 36 meses (triênio), 3% por ciclo, não acumula
- Ciclo de 60 meses (quinquênio), 5% por ciclo, não acumula

A Cristiane foi admitida em 01/04/2017 (mais de 9 anos de casa), então ela atende às duas.

O sistema, hoje, escolhe **uma única regra**: a mais específica e, em caso de empate, a de vigência mais recente. Como as duas têm escopo e vigência idênticos, o empate não tem critério de desempate — vence a que vier primeiro na lista, que por acaso é o triênio. Não é erro de cálculo de tempo de casa: é ambiguidade entre duas regras concorrentes.

## Como resolver

Primeiro é preciso decidir a intenção do cadastro, porque as duas leituras são legítimas:

1. **Escada única (mais comum em CCT):** o quinquênio substitui o triênio a partir de 5 anos. Nesse caso as duas regras são degraus de uma mesma escada e o sistema deve aplicar o degrau mais alto que o colaborador já alcançou.
2. **Regras cumulativas:** triênio e quinquênio somam (3% por triênio + 5% por quinquênio).

Correção proposta (assumindo a leitura 1, a escada):

- Quando houver várias regras vigentes no mesmo escopo, o desempate passa a ser **o maior ciclo já completado pelo colaborador**. Cristiane com 9 anos passa a cair no quinquênio (5%); alguém com 4 anos continua no triênio; alguém com 2 anos segue sem adicional.
- Se nenhuma regra tiver ciclo completo, mantém a mensagem atual de "não atende aos critérios".
- Na tela de cadastro das regras, mostrar um aviso quando existirem duas regras vigentes de mesmo escopo, explicando que elas serão tratadas como degraus (a maior alcançada vence) — para o gestor não achar que somam.
- Na ficha do colaborador, o card passa a dizer qual regra foi aplicada e por quê ("Quinquênio — 1x 5% (9 anos de casa)").

Se a intenção for a leitura 2 (somar), o ajuste é diferente: o cálculo passa a somar todas as regras vigentes do escopo, e o card mostra a composição.

## Detalhes técnicos

- `src/lib/dp/tempoServico.ts`: em `selecionarRegraTempoServico`, adicionar critério de desempate por ciclos completos — filtrar candidatas pelas que o colaborador já completou ao menos 1 ciclo (usando `mesesDeCasa` e `ciclo_meses`) e preferir a de maior `ciclo_meses`; sem nenhuma completa, cair na de menor `ciclo_meses` (para a mensagem de "ainda não atende"). A função passa a receber a admissão junto do alvo.
- Atualizar chamadas: `src/components/dp/AdicionalTempoServicoCard.tsx` e qualquer uso em folha/apuração (buscar por `selecionarRegraTempoServico`).
- Testes em `src/lib/dp/__tests__/tempoServico.test.ts`: duas regras de mesmo escopo/vigência com 36 e 60 meses → 9 anos de casa escolhe a de 60; 4 anos escolhe a de 36; 1 ano não gera adicional.
- Aviso de regras concorrentes em `src/pages/dp/DpAdicionaisTempoServico.tsx`.
- Nada muda no banco.

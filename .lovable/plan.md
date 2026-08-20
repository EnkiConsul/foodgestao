# Ficha resumo: horários mais limpos, base de dias do VA e adicional em Remuneração

## 1. Sem "horário do turno" na lista de dias

A lista de horários por dia da semana passa a mostrar apenas o horário e o intervalo (ex.: "17:00 às 00:00 · 30 min de intervalo"). O sufixo "horário do turno" sai da tela resumo — a informação de qual é o turno padrão continua no bloco acima (Turno padrão), sem repetir em cada linha.

## 2. Base de dias do vale-alimentação pela jornada

Hoje a ficha mostra sempre o número gravado em "dias base" (22). Quando a origem dos dias do colaborador é a jornada — como no caso da Cristiane —, a ficha passa a calcular os dias do mês corrente a partir dos dias da semana marcados na configuração de trabalho (a mesma regra já usada no cadastro), mostrando por exemplo "base 25 dias no mês (pela jornada)".

- Origem "jornada": dias calculados do mês atual, com a indicação de que vêm da jornada.
- Origem "fixo": mantém o número cadastrado, indicado como "fixo".
- Jornada ainda não cadastrada: mantém o número de referência e avisa que a jornada não está configurada.

## 3. Adicional por tempo de serviço em Remuneração

O card de adicional por tempo de serviço sai de Benefícios e passa para o final do card Remuneração, junto do salário e dos adicionais de risco.

## 4. Adicional só aparece quando o colaborador tem direito

Quando existe regra aplicável mas o colaborador ainda não completou nenhum ciclo, a ficha deixa de exibir o nome/percentual do ciclo (triênio, quinquênio etc.). Passa a mostrar apenas uma linha discreta: existe adicional por tempo de serviço na empresa e o colaborador ainda não atende aos critérios, com o tempo de casa atual. Quando já há ciclo adquirido, o card continua completo (regra, percentual, valor e próximo ciclo).

O mesmo comportamento reduzido vale para quando não há regra aplicável ao cargo/unidade/sindicato.

## Detalhes técnicos

- `src/components/dp/ColaboradorFichaDialog.tsx`: remover o sufixo `d.origem === "base"` da lista de dias; calcular a base de dias do VA com `diasTrabalhaveisNoMes` (`src/lib/dp/beneficios-regras.ts`) a partir de `configDominio.dias` quando `vale_alimentacao_dias_origem === "jornada"`; mover `<AdicionalTempoServicoCard>` para dentro da `Section` de Remuneração.
- `src/components/dp/AdicionalTempoServicoCard.tsx`: quando `calculo` for nulo ou `calculo.ciclos === 0`, renderizar a versão enxuta (sem nome da regra, sem badge de ciclo/percentual), mantendo o atalho "Configurar regras".
- Sem mudanças de banco, RLS ou lógica de folha.

# Vale-alimentação: simulação padronizada em mês de 30 dias

Hoje, quando o VA é "por dia", o sistema conta as ocorrências reais de cada dia da semana marcado no Horário de Trabalho dentro do mês corrente. Ou seja, ele já desconta a folga (inclusive a dominical), mas o número oscila conforme o calendário do mês (26 em agosto, 27 em outro mês) e a tela apresenta o total como se fosse valor fechado.

## O que muda

1. **Base de cálculo da simulação**: mês comercial de 30 dias, menos as folgas semanais multiplicadas por 4 semanas.
   - 6x1 (folga domingo): 30 − (1 × 4) = **26 dias**
   - 5x2 (folga sábado e domingo): 30 − (2 × 4) = **22 dias**
   - 7 dias trabalhados: 30 dias
   - Sem jornada cadastrada: mantém 22 como referência provisória, com o aviso atual.
2. **A folga dominical entra na conta**: se domingo estiver marcado como folga na jornada, ele é uma das folgas semanais descontadas (comportamento explicitado no texto da tela, hoje implícito).
3. **Deixar claro que é simulação**: quando o VA é por dia, o bloco de prévia passa a se chamar "Simulação do mês" e mostra:
   - a conta: `valor por dia × 26 dias (base 30 dias − 1 folga semanal × 4)`;
   - a nota de que o valor total é uma **simulação** e que o valor efetivo sai na folha, pelos dias realmente trabalhados no ponto.
   - O campo de leitura "Quantidade de dias" ganha o rótulo de dias simulados e o resumo da jornada ("seg a sáb — folga dom").
4. **Quantidade fixa (acordo/CCT)** continua igual: número editável, e a prévia indica origem "quantidade fixa" — também marcada como simulação.
5. A precedência no cálculo real da folha não muda: dias apurados no ponto > jornada > quantidade fixa > 22.

## Detalhes técnicos

- `src/lib/dp/beneficios-regras.ts`: `diasTrabalhaveisNoMes` passa a ser substituída (na simulação) por `diasSimuladosMesComercial(dias)` — `30 − folgasSemanais × 4`, retornando `null` quando a jornada não tem nenhum dia marcado. Novo helper `descreverBaseSimulacao(dias)` gera o texto "base 30 dias − 1 folga semanal × 4". `diasTrabalhaveisNoMes` permanece exportada para usos por competência real (apuração), sem alteração de assinatura.
- `src/components/dp/RemuneracaoFields.tsx`: usa `diasSimuladosMesComercial` em vez de `diasTrabalhaveisNoMes`, renomeia o bloco de prévia para "Simulação do mês", inclui a conta detalhada e o aviso de simulação.
- `src/test/unit/dpHorarioBeneficios.test.ts`: casos 6x1 → 26, 5x2 → 22, 7x0 → 30, jornada vazia → null, e o texto da base.
- Sem mudança de banco de dados; `vale_alimentacao_dias_origem` e `vale_alimentacao_dias_base` seguem como estão.

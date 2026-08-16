# Vale-alimentação: simulação em mês de 30 dias, com folgas semanais + folga de fim de semana

Hoje, quando o VA é "por dia", o sistema conta as ocorrências reais de cada dia da semana marcado no Horário de Trabalho dentro do mês corrente. Ele desconta as folgas semanais, mas o número oscila conforme o calendário e a tela apresenta o total como se fosse valor fechado. Também não considera a folga de fim de semana extra, que na configuração de DSR desta empresa está cadastrada como 1 por mês (`folgas_fds_por_mes = 1`) e pode cair no sábado ou no domingo.

## O que muda

1. **Base de cálculo da simulação**: mês comercial de 30 dias, menos:
   - a quantidade de dias da semana marcados como folga no cadastro do colaborador × 4 semanas — não importa em qual dia da semana caem;
   - a quantidade de folgas de fim de semana por mês configurada no DSR da unidade/empresa (`folgas_fds_por_mes`), que pode ser sábado ou domingo.
   - Exemplo Pakerê (6x1 com 1 folga de fds/mês): 30 − (1 × 4) − 1 = **25 dias**
   - 5x2 com 1 folga de fds/mês: 30 − (2 × 4) − 1 = **21 dias**
   - Sem jornada cadastrada: mantém 22 como referência provisória, com o aviso atual.
2. **Deixar claro que é simulação**: quando o VA é por dia, o bloco de prévia passa a se chamar "Simulação do mês" e mostra:
   - a conta aberta: `valor por dia × 25 dias (30 dias − 1 folga semanal × 4 − 1 folga de fim de semana)`;
   - a nota de que o total é uma **simulação** e que o valor efetivo sai na folha, pelos dias realmente trabalhados no ponto.
   - O campo de leitura "Quantidade de dias" mostra os dias simulados e o resumo da jornada do colaborador com os dias de folga cadastrados.
3. **Quantidade fixa (acordo/CCT)** continua igual: número editável, prévia indicando origem "quantidade fixa" — também marcada como simulação.
4. A precedência no cálculo real da folha não muda: dias apurados no ponto > jornada > quantidade fixa > 22.

## Detalhes técnicos

- `src/lib/dp/beneficios-regras.ts`: nova função `diasSimuladosMesComercial({ dias, folgasFimDeSemanaMes })` — `30 − (nº de dias marcados como folga) × 4 − folgasFimDeSemanaMes`, com piso de 0 e `null` quando a jornada não tem nenhum dia marcado. Novo helper `descreverBaseSimulacao(...)` gera o texto da conta.
- `src/components/dp/RemuneracaoFields.tsx`: usa `diasSimuladosMesComercial` em vez de `diasTrabalhaveisNoMes`, recebe `folgasFimDeSemanaMes` por prop, renomeia o bloco de prévia para "Simulação do mês" e mostra a conta aberta + aviso de simulação.
- `src/components/dp/ColaboradorFormDialog.tsx`: lê `folgas_fds_por_mes` da configuração de DSR resolvida da unidade do colaborador (com fallback para a configuração da empresa) e repassa ao `RemuneracaoFields`.
- `src/test/unit/dpHorarioBeneficios.test.ts`: casos 6x1 + 1 fds → 25, 5x2 + 1 fds → 21, 6x1 sem folga de fds → 26, sem folga nenhuma → 30, jornada vazia → null, e o texto da base.
- `diasTrabalhaveisNoMes` permanece exportada para usos por competência real (apuração), sem alteração.
- Sem mudança de banco de dados.

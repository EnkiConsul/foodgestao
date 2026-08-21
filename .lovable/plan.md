# Benefícios: simulação com folgas, férias e ajuste do mês anterior

## O que está acontecendo hoje

Existem duas contas diferentes na tela de Benefícios:

1. **Abas "Calculadora de VA / VT"** — já usam o motor completo: escala publicada ou jornada, folgas marcadas no calendário (dominicais e extras), férias gozadas, faltas pelo ponto e o período de conferência do mês anterior (corte de X dias antes do pagamento).
2. **Aba "Por colaborador"** (a simulação da lista, com selo "Do cadastro") — usa apenas a contagem de dias da semana da jornada no mês. Ela não olha folgas, não olha férias e não abate os dias pagos e não trabalhados no período anterior. É por isso que a simulação divergiu do esperado.

Para **intermitentes** há dois problemas confirmados:

- na lista, quando não há convocação aceita no mês, o total de dias é 0 e a regra de dias cai no fallback de 22 dias (`diasConsideradosBeneficio` só respeita valores maiores que zero);
- nas abas de calculadora, quem não tem configuração de dias de trabalho recebe o padrão seg–sex, ou seja, também não usa as convocações.

## O que será feito

1. **Uma única fonte de cálculo.** A aba "Por colaborador" passa a exibir os números do motor de vales (o mesmo das calculadoras) para o Vale-Alimentação e o Vale-Transporte de origem "cadastro": dias previstos no período de cobertura, folgas descontadas, dias descontados por falta/folga extra/atestado/férias do período de conferência e o valor a depositar.
2. **Detalhe transparente por linha.** Cada item de VA/VT mostrará algo como "26 dias previstos − 3 do mês anterior (2 folgas extras, 1 falta)" e um aviso quando houver folga pendente de aprovação no período.
3. **Intermitentes sem fallback de 22 dias.** Para regime intermitente os dias passam a vir das convocações aceitas dentro do período de cobertura. Sem convocação aceita, a simulação mostra 0 dias e "aguardando convocações", nunca 22. Isso vale tanto na lista quanto nas abas de calculadora.
4. **Jornada sem configuração.** Quem não tem horário de trabalho cadastrado continua sinalizado com aviso, mas sem inventar dias trabalhados nas calculadoras (hoje assume seg–sex silenciosamente).
5. **KPIs** (custo bruto, líquido, colaboradores atendidos) passam a somar os valores já ajustados por folgas, férias e diferença do mês anterior.

## Detalhes técnicos

- `src/hooks/useDpValeCalculadora.tsx`:
  - incluir `regime` nas colunas do colaborador e uma query de `dp_convocacoes` (`status = 'aceita'`) na janela conferência→cobertura;
  - para `regime = 'intermitente'`, os dias previstos e os previstos da conferência vêm das datas convocadas, não de `dowTrabalhados`;
  - remover o fallback silencioso `[1,2,3,4,5]`: sem configuração e sem escala, expor `semJornada: true` na linha e zerar previstos;
  - expor na `LinhaVale` a origem dos dias (`escala | jornada | convocacao`) e `semJornada`.
- `src/hooks/useDpBeneficiosCadastro.tsx`: deixar de calcular dias por conta própria; consumir as linhas de `useDpValeCalculadora` (VA e VT) para a competência atual e montar os itens de origem "cadastro" com `bruto`/`desconto`/`liquido`/`dias` já vindos do motor, mantendo o formato de `BeneficioCadastroItem` (com `diasOrigem` e `detalhe`/`aviso` novos).
- `src/pages/dp/DpBeneficios.tsx`: exibir o novo detalhe e o aviso de folga pendente / sem convocação nos itens de cadastro, sem alterar o layout mobile já ajustado.
- Testes em `src/test/unit/vaCalculo.test.ts` e `src/test/unit/dpHorarioBeneficios.test.ts`: intermitente com 18 convocações aceitas → 18 dias; intermitente sem convocação → 0 dias e sinalização; folga dominical e folga extra no período de cobertura reduzem os dias; férias e falta do período anterior reduzem o depósito.
- Nenhuma mudança de banco.

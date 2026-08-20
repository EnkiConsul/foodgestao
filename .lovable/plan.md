# Ficha resumo do colaborador: cabeçalho enxuto e dados completos

## 1. Selos junto ao nome

- Os selos **Ativo/Desligado** e **Perfil** (Colaborador/Gestor/Admin) saem da coluna à direita e passam a ficar na mesma linha do nome, logo depois dele, em tamanho menor.
- O canto direito do cabeçalho fica só com **Editar** e o **X** de fechar, sem a pilha de selos que hoje briga com os botões.
- Em telas estreitas os selos quebram para a linha de baixo do nome.

## 2. Rodapé removido

- O rodapé com "Fechar" e "Editar" sai da ficha: as duas ações já existem no cabeçalho fixo, que fica visível durante toda a rolagem. Isso devolve espaço de leitura ao conteúdo.

## 3. Horário de trabalho completo

Hoje a ficha mostra "Carga semanal —" e dias como "— às —". Verificado o motivo:

- Não existe campo de carga semanal no cadastro do colaborador: a carga é calculada a partir dos dias configurados. A ficha passa a calcular e exibir a carga semanal (horas por semana) e a quantidade de dias trabalhados na semana.
- Dias marcados como trabalhados sem horário próprio herdam o horário do **turno padrão** da configuração — a ficha não resolvia esse turno, por isso aparecia "— às —". Passa a resolver o turno e mostrar o horário efetivo, indicando quando ele vem do turno.
- Passam a aparecer também: unidade da configuração, turno padrão, tipo de folga (fixa ou conforme escala), início da vigência e observações da configuração, além de um resumo curto da semana em faixas (ex.: "Seg–Qui 17:00–00:00 · Sex–Dom 16:30–00:35").

## 4. Remuneração completa

- **Valor da hora e valor do dia**: hoje ficam em branco porque só são gravados quando digitados manualmente. Passam a ser calculados a partir do salário e da base (ex.: R$ 1.750,00 / 220h), com indicação de que é valor calculado.
- **Base de cálculo** deixa de aparecer vazia: mostra sempre salário base, base de horas e base de dias em uso.
- Novos campos exibidos: PIS/NIT, adicional por tempo de serviço (valor vigente e se há override manual) e o percentual de insalubridade/periculosidade com o valor em reais correspondente.
- **Prêmio de assiduidade** fica aqui, em Remuneração (não em Benefícios): valor, tipo do prêmio, critério, tolerância de atraso, máximo de atrasos e regra de atestado, agrupados em um bloco próprio.

## 5. Benefícios completos

O card hoje diz "Nenhum benefício ativo" mesmo com vale-alimentação de R$ 24,00/dia configurado, porque só lê os benefícios do catálogo, e os vales ficam no próprio cadastro do colaborador. O card passa a reunir tudo:

- **Vale-alimentação**: valor por dia/mês, dias-base, dia de pagamento, dias de corte, descontos aplicados (falta, folga extra, atestado, férias) e desconto do colaborador.
- **Vale-transporte**: valor por dia, dia de pagamento, dias de corte e os mesmos descontos.
- **Prêmio de assiduidade** e **adicional por tempo de serviço** como itens de benefício.
- **Benefícios do catálogo** atribuídos ao colaborador continuam listados.
- A mensagem "Nenhum benefício ativo" só aparece quando realmente não há nada, em nenhuma dessas fontes.

Para não duplicar informação, os detalhes de VA/VT saem do card Remuneração e ficam concentrados em Benefícios; Remuneração mantém apenas a indicação de que o colaborador recebe cada vale.

## Detalhes técnicos

- Alterações concentradas em `src/components/dp/ColaboradorFichaDialog.tsx` (apresentação): reorganização do `DialogHeader`, remoção do `DialogFooter` e reestruturação dos cards Horário/Remuneração/Benefícios.
- Reuso de helpers já existentes, sem nova lógica de negócio: `cargaSemanalConfig`, `diasTrabalhados`, `turnoDoDia`, `resumoSemanaPorFaixas` (`src/lib/dp/config-trabalho.ts`), `valorHoraPorBase`, `valorDiaPorBase`, `valorAdicional`, `salarioBaseEfetivo` (`src/lib/dp/remuneracao.ts`).
- Novas leituras na ficha: `useDpTurnos` (para resolver o turno padrão dos dias sem horário próprio) e o hook de adicional por tempo de serviço já usado no cadastro.
- Sem mudanças de banco de dados, RLS ou hooks de escrita.

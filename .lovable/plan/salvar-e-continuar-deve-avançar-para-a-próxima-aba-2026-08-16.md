# Salvar e continuar deve avançar para a próxima aba

Hoje, ao clicar em **Salvar e continuar** em um colaborador já existente, o sistema grava os dados e permanece na mesma aba (só o cadastro novo avança). O botão passa a fazer o que o nome sugere: salvar e ir para a aba seguinte.

## Comportamento novo

- **Dados** → salva e abre **Horário De Trabalho**.
- **Horário De Trabalho** → salva e abre **Remuneração**.
- **Remuneração** (última aba) → salva e permanece na aba, com o toast de confirmação. O rótulo do botão nessa aba passa a ser **Salvar**, para não prometer avanço.
- Se a validação da aba falhar (ou faltar ciência legal no horário), nada avança: continua na aba com o erro, campo destacado, como já acontece hoje.
- **Concluir** segue validando todas as abas e fechando a tela; **Fechar** segue avisando de alterações não salvas.
- O indicador "Etapa X de 3" acompanha a nova aba automaticamente.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`:
  - No caminho de edição (bloco que hoje chama `finalizar()` após `setBaseline(snapshot)`), quando a intenção for `"stay"`, chamar `setTab(abaSeguinte(tab))` caso exista aba seguinte.
  - Centralizar isso em `finalizar()`, que já lê `intencaoRef`, para valer também no caminho de cadastro novo (que hoje duplica a lógica com `abaSeguinte`).
  - Rodapé: rótulo do botão secundário condicional — "Salvar e continuar" quando há aba seguinte, "Salvar" na última.
- Sem mudanças de banco, validação ou regras de cálculo.

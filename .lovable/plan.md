# Calculadora opcional no campo Valor do lançamento

Permitir que o usuário faça contas rápidas ao lançar um valor manualmente, sem sair do formulário.

## Como vai funcionar

Dois caminhos para o mesmo resultado, no campo "Valor" do formulário de lançamento:

1. **Digitar a expressão direto no campo**
   - O usuário pode digitar `12,50*3+8` ou `250-19,90`.
   - Ao sair do campo (ou apertar Enter), o campo passa a mostrar o resultado formatado (`45,50`).
   - Abaixo do campo aparece uma linha discreta com a conta feita: `12,50 × 3 + 8 = 45,50`, com um botão "desfazer" que volta à expressão para ajuste.
   - Se a expressão for inválida, o campo fica com borda de erro e a mensagem "Expressão inválida" — nada é gravado.

2. **Ícone de calculadora dentro do campo**
   - Botão discreto à direita do campo (visível sempre, com `aria-label`), abre um popover ancorado.
   - Popover contém: visor com a expressão atual, teclado numérico, `+ − × ÷ ( ) , %`, `C`, `⌫` e botão "Usar valor".
   - "Usar valor" fecha o popover e preenche o campo com o resultado; "Esc" cancela sem alterar nada.
   - No mobile o popover ocupa largura confortável e as teclas têm alvo mínimo de 44px.

Regras de comportamento:
- O campo continua funcionando exatamente como hoje para quem só digita número — nada muda no fluxo atual.
- Vírgula é decimal e ponto é aceito como decimal também; sem separador de milhar na expressão.
- Resultado sempre arredondado a 2 casas; negativo é rejeitado (valor de lançamento é sempre positivo).
- Vale para o campo Valor do lançamento manual (inclusive quando é "Valor total"/"Valor da parcela" no parcelado). Os demais campos de moeda do sistema ficam como estão.

## Detalhes técnicos

- Nova função pura `src/lib/calc-expression.ts`: tokeniza e avalia `+ − × ÷ ( ) %` com precedência, sem `eval`. Retorna `{ ok, value, normalized }`. Coberta por testes unitários em `src/test/unit/calcExpression.test.ts` (casos: precedência, parênteses, vírgula decimal, percentual, expressão inválida, divisão por zero).
- Novo componente `src/components/transactions/AmountCalculator.tsx`: o popover com visor + teclado, controlado, sem estado global; usa Popover/Button do shadcn e apenas tokens semânticos (sem cores literais).
- `src/components/transactions/TransactionFormDialog.tsx`: envolve o `CurrencyInput` do campo Valor em um wrapper relativo, adiciona o botão de calculadora e a linha de expressão resolvida; a avaliação da expressão digitada roda no `onBlur`/Enter antes do parse atual. `CurrencyInput` não é alterado.
- Sem mudanças de banco, de validação de submissão ou de lógica financeira: o formulário continua recebendo apenas um número no `amount`.

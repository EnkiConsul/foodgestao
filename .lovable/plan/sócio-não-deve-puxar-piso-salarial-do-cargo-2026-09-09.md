# Sócio não deve puxar piso salarial do cargo

## O que está acontecendo (confirmado no código)

No cadastro do colaborador, ao salvar, o sistema sempre compara o valor de remuneração digitado com o piso do cargo ("um cargo = um salário"). Essa comparação não tem nenhuma exceção para sócio: como o cargo do Gabriel não tem piso cadastrado, o sistema abriu a pergunta "Cadastrar o piso salarial deste cargo?" com os R$ 4.000 que ainda estavam no campo de valor.

Dois problemas somados:

1. Sócio entra na regra de piso, mesmo com "Somente participação de lucros" escolhida — nesse caso não existe remuneração fixa nem piso a definir.
2. O valor de 4 mil continuou guardado no campo depois da troca para participação nos lucros, então foi ele que apareceu como sugestão de piso.
3. O texto da pergunta citava "esta unidade" mesmo quando o sócio está marcado como "Geral (todas as unidades)", o que soa como se fosse gravar piso de uma unidade específica.

## Como vai ficar

- Sócio nunca aciona a pergunta de piso do cargo nem a de divergência de salário do cargo: piso é regra de convenção patronal para empregados, e a retirada do sócio (pró-labore ou lucros) não é piso.
- Ao escolher "Somente participação de lucros", o valor de remuneração fixa é limpo, para não sobrar resíduo de valor anterior no cadastro nem nos cálculos.
- Quando o colaborador está sem unidade específica (Geral), a pergunta de piso também não aparece, já que sem unidade não há sindicato patronal para vincular o piso.
- Nada muda para os demais vínculos: empregados continuam com a reconciliação de piso, o alerta de divergência e a opção de definir o piso do patronal exatamente como hoje.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: no `submit`, o bloco de reconciliação (`compararSalarioCargo` → `setCargoSemSalario` / `setConflitoCargo`) passa a ser ignorado quando `socioSelecionado` é verdadeiro ou quando não há `form.unidade_id`; nesses casos `cargoResolvido.current` é marcado como resolvido para o salvamento seguir normalmente.
- Ao alternar `socioRem` para `somente_lucros`, limpar `rem.salario_base` (e `base_salarial`, se preenchido) no estado do formulário; a UI de sócio em `RemuneracaoFields.tsx` já esconde o campo nesse caso.
- Ajustar o texto do `AlertDialog` de piso para só citar unidade/patronal quando existirem, evitando "esta unidade" genérico.
- Sem migração e sem mudança em RLS, permissões ou multiempresa. Teste unitário do guard de sócio/sem-unidade em `src/lib/dp/__tests__/`, extraindo a decisão para um helper puro (ex.: `deveReconciliarPisoCargo`) em `src/lib/dp/cargoSalarios.ts`.

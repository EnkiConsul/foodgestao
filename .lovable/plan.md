# CLT sempre mensalista — corrigir o adiantamento do Herick

## O que está acontecendo

O Herick já está gravado como CLT efetivo, mas a forma de pagamento dele continua "horista" (herança do contrato intermitente anterior). O adiantamento salarial só é oferecido a quem recebe salário mensal, então a tela segue dizendo que o adiantamento não se aplica — e sem explicar o motivo real.

Confirmado no cadastro dele: vínculo CLT, forma de pagamento por hora, opção de adiantamento desmarcada, sem salário mensal preenchido.

## Regra que passa a valer

Contrato CLT com registro em carteira (CLT efetivo, estagiário e temporário) tem apenas **Mensalista** como forma de pagamento. Horista e diarista deixam de aparecer para esses vínculos.

- CLT intermitente continua horista/diarista (pago por convocação).
- Freelancer, PJ, MEI e Sócio seguem como estão hoje.
- Jornada parcial (como as 30h do Herick) continua sendo mensalista, com salário mensal proporcional e valor-hora calculado a partir dele.
- Ao trocar o vínculo para CLT efetivo, a forma de pagamento passa automaticamente para mensalista, avisando na tela.

Com isso, o adiantamento volta a ser oferecido normalmente ao Herick e a qualquer CLT registrado.

## Correção do cadastro do Herick

Converter a forma de pagamento para mensalista mantendo o que já foi definido para ele: salário mensal proporcional de R$ 1.193,18 (30h semanais), com o valor-hora derivado desse salário. A opção de adiantamento fica disponível para o gestor marcar — não será marcada automaticamente na edição.

## Detalhes técnicos

- `src/lib/dp/contrato-policy.ts`: `formasPagamento` de CLT/estágio/temporário passa a `["mensalista"]`; intermitente inalterado. Ajustar testes em `__tests__/contrato-policy.test.ts`.
- `src/lib/dp/remuneracao.ts`: `permiteAdiantamento` continua exigindo mensalista (agora coerente, já que CLT só é mensalista); `formaPagamentoValida` já normaliza formas inválidas para o padrão do vínculo, o que corrige cadastros antigos ao abrir a ficha.
- `src/components/dp/ColaboradorFormDialog.tsx` / `RemuneracaoFields.tsx`: seletor mostra só as formas permitidas e exibe nota curta quando a forma anterior foi ajustada.
- Mensagem de "não se aplica" passa a usar um motivo específico quando a causa é a forma de pagamento, em vez do texto genérico do vínculo.
- Dados: atualizar `dp_colaboradores` do Herick (`forma_pagamento = 'mensalista'`, `salario_base = 1193.18`). Verificar se há outros CLT/estágio/temporário com forma horista/diarista e listar antes de qualquer conversão — nenhum outro registro é alterado sem confirmação.

## Verificação

- `bunx tsgo --noEmit` e testes de `contrato-policy`/`remuneracao`.
- Abrir a ficha do Herick e conferir forma Mensalista e o bloco de adiantamento disponível.

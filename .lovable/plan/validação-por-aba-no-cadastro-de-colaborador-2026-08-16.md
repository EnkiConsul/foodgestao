# Validação por aba no cadastro de colaborador

Hoje o botão **Salvar e continuar** valida o formulário inteiro, então salvar a aba **Dados** é bloqueado por campos de **Remuneração** ainda vazios. A regra passa a depender da intenção do clique.

## Comportamento novo

**Salvar e continuar** (checkpoint parcial) — valida apenas a aba aberta:
- **Dados**: nome, CPF (formato/validade/duplicidade), cargo, unidade, datas de admissão/nascimento, idade mínima, dados de desligamento.
- **Horário De Trabalho**: regras de jornada/turno e folgas já existentes nessa aba.
- **Remuneração**: forma de pagamento com salário/valor-hora, adicional, vale-transporte, vale-alimentação, prêmio de assiduidade, reconciliação cargo/salário.

**Concluir** (fechamento do cadastro) — valida todas as abas:
- Se houver pendência, mostra o erro, muda para a aba com problema e não fecha o diálogo.
- Exceção: colaborador já existente com remuneração legada incompleta não é travado — exibe aviso de que a folha só será gerada após completar a remuneração.

**Sinalização visual**: as abas com pendência recebem um indicador (ponto/badge) para o usuário saber o que falta antes de clicar em Concluir.

Alertas jurídicos/compliance (dispensas, regime, cargo sem salário) continuam sendo acionados quando a aba correspondente é validada.

## Detalhes técnicos

- Em `src/components/dp/ColaboradorFormDialog.tsx`, quebrar o `submit` em validadores por aba (`validarDados`, `validarJornada`, `validarRemuneracao`), cada um retornando a primeira mensagem de erro.
- `intencao === "stay"` executa só o validador da aba corrente; `intencao === "close"` executa os três em ordem e navega para a primeira aba com erro.
- Manter o payload de gravação completo (nada se perde), mudando só o gate de validação.
- Reaproveitar `remuneracaoPendente` de `@/lib/dp/remuneracao` para o aviso não bloqueante em edição.
- Derivar o estado de pendência por aba desses mesmos validadores para alimentar os badges no `TabsTrigger`.

# Validação por aba no cadastro de colaborador

Hoje o botão **Salvar e continuar** valida o formulário inteiro, então salvar a aba **Dados** é bloqueado por campos de **Remuneração** ainda vazios. A validação passa a ser escopada à aba aberta.

## Comportamento novo

- Ao clicar em **Salvar e continuar** ou **Concluir**, só são validados os campos da aba ativa:
  - **Dados**: nome, CPF (formato/validade/duplicidade), cargo, unidade, datas de admissão/nascimento, idade mínima, dados de desligamento.
  - **Horário De Trabalho**: regras de jornada/turno e folgas já existentes nessa aba.
  - **Remuneração**: forma de pagamento com salário/valor-hora, adicional, vale-transporte, vale-alimentação, prêmio de assiduidade, reconciliação de cargo/salário.
- A pendência de remuneração deixa de travar as outras abas: vira aviso (toast de atenção) informando que a folha só é gerada após completar a remuneração.
- Em **Concluir**, além da aba ativa, o sistema avisa (sem bloquear) se restarem pendências em outras abas, indicando quais.
- Alertas jurídicos/compliance (dispensas, regime, cargo sem salário) continuam sendo acionados apenas quando a aba correspondente é salva.

## Detalhes técnicos

- Em `src/components/dp/ColaboradorFormDialog.tsx`, quebrar o `submit` em validadores por aba (`validarDados`, `validarJornada`, `validarRemuneracao`) e executar apenas o da aba corrente antes do upsert.
- Manter o payload de gravação completo (nada se perde), mudando só o gate de validação.
- Reaproveitar `remuneracaoPendente` de `@/lib/dp/remuneracao` como aviso quando a aba ativa não for Remuneração.

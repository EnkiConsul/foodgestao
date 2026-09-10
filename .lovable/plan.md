# Salvar e continuar nas Condições de Trabalho

## Objetivo

Deixar a alteração de condições de trabalho com o mesmo fluxo por etapas do cadastro do colaborador: salvar a aba atual, avançar automaticamente para a próxima e manter a janela aberta até a conclusão.

## Mudanças na tela

- Adicionar no rodapé da janela o botão secundário **Salvar e continuar** nas abas editáveis:
  1. Contrato
  2. Jornada
  3. Pagamento
  4. Benefícios
- Ao clicar em **Salvar e continuar**:
  - validar a data de início e o motivo da mudança;
  - salvar as condições preenchidas;
  - avançar automaticamente para a próxima aba;
  - manter a janela aberta.
- Na aba **Benefícios**, o botão salva e leva para **Histórico**.
- Na aba **Histórico**, não haverá ação de salvar; ficará apenas a opção de voltar/fechar.
- Manter o botão principal **Aplicar mudança** para salvar e fechar em qualquer aba editável.
- Adaptar o rodapé para celular, com botões grandes e empilhados, seguindo o padrão do cadastro do colaborador.

## Proteção contra histórico duplicado

Como o novo botão permite salvar mais de uma vez durante a mesma alteração, a rotina será ajustada para não criar vários registros idênticos no histórico:

- Se a pessoa clicar em **Salvar e continuar** sem alterar nada desde o último salvamento, a tela apenas avança.
- Se houver novas alterações para a mesma data de início, o registro dessa vigência será atualizado/consolidado, em vez de gerar várias linhas repetidas para a mesma mudança.
- O histórico continuará preservando vigências anteriores normalmente.

## Detalhes técnicos

- Arquivo principal: `src/components/dp/ColaboradorCondicoesDialog.tsx`.
- Reaproveitar o padrão de intenção de salvamento usado em `src/components/dp/ColaboradorFormDialog.tsx` (`stay` para continuar e `close` para concluir).
- Ajustar `dp_colaborador_aplicar_condicao` para tratar a mesma combinação de colaborador + data de início como uma única vigência consolidada.
- Manter dados pessoais e preferências do colaborador fora dessa alteração, como já ocorre hoje.

## Verificação

- Rodar verificação de tipos e testes existentes.
- Testar no navegador:
  - salvar em Contrato e avançar para Jornada;
  - alterar carga horária/horário e avançar para Pagamento;
  - revisar Pagamento e avançar para Benefícios;
  - salvar Benefícios e abrir Histórico;
  - confirmar que não aparecem registros duplicados para a mesma data de início;
  - confirmar que **Aplicar mudança** continua salvando e fechando.

Simplificar o rodapé do formulário de colaborador para manter apenas duas ações principais: **Salvar e continuar** e **Concluir**. A navegação entre abas continua sendo feita pelas próprias abas clicáveis.

Escopo
- Ajustar `src/components/dp/ColaboradorFormDialog.tsx`.
- Remover os botões **Voltar** e **Próximo** do rodapé.
- Renomear/ajustar o botão à esquerda para comportamento de cancelar quando for colaborador novo e ainda não foi criado (`Cancelar`); manter `Concluir` quando já houver colaborador salvo ou em edição.
- Fazer com que **Concluir** salve e feche o diálogo (`submit("close")`) em vez de apenas fechar sem salvar.
- Manter o diálogo de confirmação de saída quando houver alterações não salvas e o usuário tentar fechar pelo "X" ou tecla Esc.
- Preservar o indicador "Etapa X de 3" e o aviso de "alterações não salvas".

Detalhes técnicos
- O botão **Salvar e continuar** continua com `submit("stay")` — persiste sem fechar o diálogo e atualiza o `baseline` para detectar alterações pendentes.
- O botão **Concluir** usa `submit("close")` — salva e dispara o fechamento. Se houver erro de validação, o salvamento falha e o diálogo permanece aberto.
- Em colaborador novo que ainda não foi salvo, o botão à esquerda continua como **Cancelar** e usa `tentarFechar`, permitindo descartar sem salvar.
- Remover as funções/helpers `abaSeguinte`, `abaAnterior` e o tipo `IntencaoSalvar` se não forem mais utilizados em outras partes do componente.
- Garantir que as abas `TabsList` continuem habilitadas para navegação direta entre Dados, Horário de Trabalho e Remuneração.

Simplificar o rodapé do formulário de colaborador para três ações claras: **Salvar e continuar**, **Concluir** e **Fechar**. A navegação entre abas continua sendo feita pelas próprias abas clicáveis, eliminando a necessidade dos botões Voltar/Próximo.

Decisão de design
- O botão **Concluir (salvar e fechar)** será o botão primário, destacado na cor laranja da marca (`variant="default"`).
- **Salvar e continuar** ficará em tom secundário (`variant="secondary"`).
- **Fechar** ficará em estilo ghost/outline, sem destaque, para evitar cliques acidentais na ação de saída.

Escopo
- Ajustar `src/components/dp/ColaboradorFormDialog.tsx`.
- Remover os botões **Voltar** e **Próximo** do rodapé.
- Adicionar botão **Fechar** no lado esquerdo do rodapé, com comportamento de cancelar/descartar quando for colaborador novo e ainda não foi salvo; quando já houver colaborador salvo ou em edição, oferece a opção de sair sem salvar caso existam alterações pendentes.
- Fazer com que **Concluir** salve e feche o diálogo (`submit("close")`) em vez de apenas fechar sem salvar.
- Manter o botão **Salvar e continuar** no centro/direita, com `submit("stay")`, persistindo sem fechar o diálogo.
- Manter o diálogo de confirmação de saída quando houver alterações não salvas e o usuário tentar fechar pelo "Fechar", pelo "X" ou pela tecla Esc.
- Preservar o indicador "Etapa X de 3" e o aviso de "alterações não salvas".

Justificativa de UX
- Botões Voltar/Próximo são redundantes quando as abas são clicáveis.
- Um botão **Fechar** explícito no rodapé melhora a descoberta da saída e deixa a ação de cancelar sem salvar sempre visível.
- **Concluir** como primário comunica claramente a finalização do fluxo e reduz a chance de o usuário perder dados ao clicar no X.
- **Salvar e continuar** mantém a possibilidade de preencher todas as abas antes de finalizar, sem competir visualmente com a ação principal.

Detalhes técnicos
- **Salvar e continuar**: `submit("stay")` — persiste sem fechar o diálogo e atualiza o `baseline` para detectar alterações pendentes.
- **Concluir**: `submit("close")` — salva e dispara o fechamento. Se houver erro de validação, o salvamento falha e o diálogo permanece aberto.
- **Fechar**: `tentarFechar` — em colaborador novo sem `criadoId`, fecha sem perguntar; em edição ou após primeiro salvamento, abre o `AlertDialog` de confirmação se houver alterações pendentes.
- Remover as funções/helpers `abaSeguinte`, `abaAnterior` e o tipo `IntencaoSalvar` se não forem mais utilizados em outras partes do componente.
- Garantir que as abas `TabsList` continuem habilitadas para navegação direta entre Dados, Horário de Trabalho e Remuneração.

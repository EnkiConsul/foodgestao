# Revisão dos 6 pedidos: o que já está no ar e o que falta

Conferi cada item no código atual.

## Já implementado (verificado)

1. **Colaboradores — alinhamento e quebra de linha**: Cargo, Unidade, Status, Perfil e Ações estão centralizados; só Colaborador fica à esquerda. Unidade já quebra linha (`whitespace-normal break-words`).
2. **Desligados**: a ficha mostra apenas Data da Demissão e Observações — motivo do desligamento e elegibilidade de recontratação não aparecem mais.
3. **Isonomia do sócio**: na aba Remuneração as divergências de isonomia são zeradas para sócio e a exigência de ciência ao remover benefício não se aplica a ele.
4. **Texto de risco do pró-labore**: já está recolhido atrás de um "i" (popover), aparecendo só ao clicar/passar o mouse.
5. **Erro ao salvar sócio Gabriel**: corrigido — o cadastro de "GABRIEL CASTRO GUIMARÃES" (Sócio, unidade Geral) está salvo no banco, gravado hoje às 15:05 (horário de SP). Mensagens de erro agora trazem a descrição e o código retornado pelo backend.
6. **Regras de folgas**: botão "Salvar regras" está no canto superior direito do cabeçalho, e já existe pendência automática no painel inicial quando a empresa ou alguma unidade está sem regra de folgas.

## O que ainda falta

Apenas uma parte do item 6: o atalho na tela de **Horário de trabalho** do colaborador ("Ver Regras De Folgas") hoje abre a tela de Folgas em uma nova aba, sem perguntar nada. Falta o comportamento pedido:

- Ao clicar no atalho, o sistema pergunta: "Salvar as alterações do horário antes de ir para as Regras de Folgas?"
- Opções: **Salvar e ir**, **Ir sem salvar** e **Cancelar**.
- "Salvar e ir" grava a configuração de horário do colaborador e navega para `/dp/folgas?aba=regras` na mesma aba; "Ir sem salvar" navega direto; erro ao salvar mantém o usuário na tela com o aviso.
- Se não houver alteração pendente, navega direto sem perguntar.

## Detalhes técnicos

- `src/components/dp/ColaboradorJornadaPanel.tsx`: trocar o `window.open` por um `AlertDialog` de confirmação; reaproveitar a função de salvar já existente no painel e usar `useNavigate` para ir a `/dp/folgas?aba=regras`. Detectar alteração pendente pelo estado sujo já controlado no painel.

# Aviso de baixar o app como balão flutuante

## Como está hoje
- No início do portal, o aviso é um cartão dentro da página: empurra o conteúdo para baixo. Já tem o X para fechar.
- Na ativação de acesso, o aviso que aparece antes de criar a senha também fica dentro da página.
- No login, o botão "Baixar app" fica no canto de cima e não empurra nada.

## O que muda
1. **Portal e ativação:** o aviso vira um balão que flutua sobre a tela, perto da parte de baixo. Ele fica acima do menu inferior do celular e não mexe na página.
2. **Visual do balão:** sombra leve, cantos arredondados e entrada suave. O texto é curto: "Baixe o aplicativo" e o botão "Baixar aplicativo".
3. **Fechar:** um X grande e fácil de tocar. Depois de fechado, o balão some e só volta após 14 dias. Se a pessoa abrir pelo ícone do app, ele nunca aparece.
4. **Passo a passo:** ao tocar em "Baixar aplicativo", o passo a passo abre numa janela por cima da tela, com o botão Fechar. Assim nada da página se desloca.
5. **Um aviso por vez:** o balão espera a caixa de cookies ser respondida. Isso corrige o defeito em que a caixa cobria o aviso.
6. **Tela "Sua senha foi criada!":** o passo a passo continua na própria tela, porque é o próximo passo natural.
7. **Login:** continua igual.

## Testes
- Celular 360×740 e iPhone simulado, abrindo pelo WhatsApp e pelo Safari: o conteúdo não se move, o X fecha o balão e ele não volta ao recarregar a página.
- Teste automático: depois de fechado, o balão fica escondido por 14 dias.

## Detalhes técnicos
- `InstalarAppCard` passa a ser `fixed` (bottom com safe-area + altura do menu inferior, z acima do conteúdo e abaixo de diálogos) e é reaproveitado no aviso anterior à senha em `AtivarAcesso`.
- `GuiaInstalacaoApp` é aberto dentro de um Dialog/Drawer.
- A ordem do balão em relação ao consentimento de cookies é controlada por uma flag lida do armazenamento do consentimento.

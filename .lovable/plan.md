# Aviso de baixar o app como balão flutuante

## Como está hoje
- No início do portal, o aviso é um cartão dentro da página: empurra o conteúdo para baixo. Já tem o X para fechar.
- Na ativação de acesso, o aviso que aparece antes de criar a senha também fica dentro da página.
- No login, o botão "Baixar app" fica no canto de cima e não empurra nada.

## O que muda
1. **Portal:** o aviso vira um balão que flutua sobre a tela, logo acima do menu inferior. Não empurra nem cobre o menu, e aparece cerca de 2 segundos depois que a página carrega, para a pessoa ver o portal primeiro.
2. **Ativação de acesso:** o aviso sai do momento de criar a senha, para não atrapalhar a digitação nem cobrir os campos com o teclado aberto. O passo a passo entra só na tela "Sua senha foi criada!", que é o próximo passo natural.
3. **Fechar:** um X grande e fácil de tocar. Depois de fechado, o balão só volta 14 dias depois. Quem abre pelo ícone do app ou usa computador nunca vê o balão.
4. **Passo a passo:** ao tocar em "Baixar aplicativo", o passo a passo abre numa janela que sobe da parte de baixo da tela, com o botão Fechar. A página não se mexe. No Android dentro do WhatsApp, o Chrome continua abrindo direto.
5. **Um aviso por vez:** o balão espera a caixa de cookies ser respondida. Isso corrige o defeito em que a caixa cobria o aviso. O balão também some enquanto o teclado estiver aberto.
6. **Login:** continua igual, com o botão discreto no canto.

## Testes
- Celular 360×740 e iPhone simulado, abrindo pelo WhatsApp e pelo Safari: o conteúdo não se move, o menu inferior fica livre, o X fecha o balão e ele não volta ao recarregar a página.
- Teste automático: depois de fechado, o balão fica escondido por 14 dias. Também não aparece no app instalado nem enquanto a caixa de cookies estiver aberta.

## Detalhes técnicos
- `InstalarAppCard` passa a ser `fixed` (bottom com safe-area + altura da navegação inferior; z abaixo de diálogos), com `role="status"`, sem roubar o foco.
- `GuiaInstalacaoApp` é aberto num Drawer. Em `AtivarAcesso`, o aviso anterior à senha é removido e o guia pós-senha é mantido.
- Os bloqueios por consentimento de cookies e por teclado aberto (visualViewport) ficam num hook único de visibilidade.

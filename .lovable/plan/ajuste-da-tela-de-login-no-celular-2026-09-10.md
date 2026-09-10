# Ajuste da tela de login no celular

## Objetivo
Fazer o login principal caber integralmente na altura visível do celular, sem rolagem inicial e sem cortar a pessoa ou os elementos principais da arte.

## Alterações
- Trocar a altura mínima móvel baseada na largura da imagem por uma composição limitada à altura real disponível da tela.
- Manter a arte vertical inteira e proporcional, reposicionando-a dentro da área visível sem usar recorte.
- Compactar apenas no celular os espaçamentos verticais do formulário, preservando campos, CAPTCHA, recuperação de senha, cadastro e demais funções.
- Posicionar o formulário na área inferior livre da arte, com tamanho máximo calculado para não ultrapassar a tela.
- Quando algum estado naturalmente maior for aberto, como cadastro, recuperação, confirmação ou erro detalhado, permitir rolagem somente dentro do formulário, mantendo o fundo fixo.
- Considerar a área segura inferior do aparelho para evitar conteúdo atrás dos controles do navegador.

## Validação
- Conferir o login em celular com viewport de 407 × 748 e em uma altura menor.
- Confirmar que o botão Entrar e os textos inferiores aparecem sem rolar no estado padrão.
- Confirmar que a mulher, o celular e a comunicação principal da imagem continuam visíveis.
- Reexecutar os testes existentes de autenticação para garantir que nenhuma função ou regra de segurança mudou.

## Escopo
Somente apresentação mobile da tela de autenticação; tablet e desktop permanecem como estão, salvo algum ajuste estritamente necessário para preservar os pontos de quebra.
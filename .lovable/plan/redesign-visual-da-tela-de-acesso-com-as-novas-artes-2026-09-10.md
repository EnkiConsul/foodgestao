# Redesign visual da tela de acesso com as novas artes

## Objetivo
Transformar a tela de login em uma experiência mais profissional e alinhada à Aveto 360, usando exatamente as duas imagens enviadas e mantendo intactos autenticação, cadastro, recuperação de senha, MFA, captcha, convites, redirecionamentos e políticas de segurança.

## Direção visual
- **Computador:** composição em duas áreas. A arte horizontal ocupa a área visual principal, preservando a marca, a mensagem e a profissional de food service; o formulário fica em um painel claro, limpo e bem dimensionado ao lado, sem cobrir o conteúdo importante da imagem.
- **Tablet:** composição adaptável, usando a arte horizontal como faixa visual ampla e o formulário em primeiro plano, com leitura confortável e sem recortes agressivos.
- **Celular:** arte vertical como fundo imersivo, com o formulário em uma área clara elevada na parte inferior. A parte superior mantém marca, mensagem e fotografia visíveis; o formulário permanece legível e alcançável, inclusive com teclado aberto.
- Usar a paleta verde, grafite e branco já presente nas artes e nos estilos da Aveto 360.
- Manter campos e botões com contraste forte, foco visível, áreas de toque adequadas e leitura acessível.

## Implementação
1. Publicar as duas imagens no armazenamento de assets do projeto e referenciá-las pela versão correta para cada largura de tela.
2. Reorganizar somente a apresentação da página de acesso:
   - estrutura responsiva para celular, tablet e computador;
   - formulário mais destacado e proporcional;
   - espaçamentos, tipografia, bordas e sombras mais refinados;
   - estados de entrar, criar conta, recuperar senha, confirmar e-mail e MFA dentro da mesma composição visual.
3. Preservar todos os textos funcionais, mensagens de erro, links legais, captcha e controles atuais.
4. Garantir que o aviso de cookies não esconda os campos ou a ação principal no celular.
5. Corrigir a apresentação da marca no formulário caso a imagem atual falhe, sem alterar a identidade visual.

## Limites
- Nenhuma mudança em autenticação, permissões, banco de dados, funções, regras de cadastro ou políticas de segurança.
- Nenhuma mudança nas demais páginas do sistema.
- O texto e os elementos já incorporados às artes enviadas serão mantidos como parte das imagens.

## Verificação
- Conferir visualmente login, cadastro, recuperação de senha, confirmação de e-mail e MFA.
- Validar em celular (407×748), tablet e computador.
- Confirmar ausência de rolagem horizontal, sobreposição e conteúdo cortado.
- Executar as verificações de tipos e os testes existentes ligados ao fluxo de acesso.

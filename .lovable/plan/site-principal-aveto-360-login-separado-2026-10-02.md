# Site principal AVETO 360 + Login separado

Objetivo: `www.aveto360.com` passa a ser o site da marca (no mesmo visual dos posts do Instagram @aveto360), e `www.aveto360.com/login` fica só para entrar.

## 1. Identidade visual (igual aos posts)
- Fundo preto/verde profundo (#0B000B → #15803D), verde de destaque #27AE60, branco #F2F2F2, grafite #333333.
- Fonte Montserrat; títulos grandes, com a palavra-chave em verde e negrito (ex.: "Casa **cheia**", "**mensagem perdida**").
- Elementos dos posts: triângulos/linhas diagonais verdes, cantoneiras de moldura, pílulas com borda verde, logo AVETO 360 (triângulo verde + "360").
- A paleta laranja/marinho antiga será substituída nas páginas públicas (site e login). O sistema interno não muda agora.

## 2. Landing page (`/`) — conteúdo inspirado no carrossel
Seções em sequência, como os posts:
1. **Abertura:** logo + "O seu negócio acontece em 360°. Sua gestão também deveria." + botões **Entrar** e **Falar Conosco** (WhatsApp já usado no site).
2. **A dor:** "Sábado, oito da noite. Casa cheia. E o garçom avisa que não vem." com o celular mostrando a notificação.
3. **Folga no grupo:** "Alguém trocou a folga no grupo do WhatsApp. Ninguém registrou."
4. **Informação espalhada:** pílulas "Escala no caderno · Folga no WhatsApp · Férias na planilha · Documento na pasta".
5. **O problema real:** "O problema não é uma mensagem perdida. É depender de vários lugares diferentes…" (com as cantoneiras).
6. **A solução:** "Foi vivendo situações como essa que nasceu a Aveto 360" — gestão de pessoas e financeira de bares e restaurantes, com os módulos (Pessoas 360°, Financeiro, Escala).
7. **Fechamento:** "E no seu restaurante? Onde estão hoje as informações da sua equipe?" + botão Falar Conosco + link do Instagram.
8. **Rodapé:** "AVETO 360 · Gestão para bares e restaurantes", Termos, Privacidade, Cookies.

Sem preços por enquanto (seguindo a decisão já registrada); a contratação entra depois.
Imagens: uso os seus posts como referência e crio imagens novas no mesmo estilo (celular com notificação, garçom com bandeja, 360° verde). Se preferir, você me envia os arquivos originais das artes e eu uso eles.

Quem já estiver logado e abrir `/` continua indo direto para o sistema.

## 3. Página de login (`/login`)
- Mesmo visual verde/preto do site.
- Somente: E-mail ou CPF, senha, Esqueci minha senha, Entrar.
- "Primeiro acesso? Crie sua senha pelo CPF" em 1 linha.
- Remover "Não tem conta? Cadastre-se".
- Endereços antigos (`/auth`, `/dp/login`) levam para `/login`.

## 4. Mensagens e links
- Mensagem oficial do portal (Gerar Acessos e modelos das empresas): passo 1 com `https://www.aveto360.com/login`.
- Saídas, sessão expirada e redefinição de senha voltam para `/login`.
- Título e descrição do site (Google/WhatsApp) com o slogan da marca.

## Detalhes técnicos
- `RootGate` renderiza `LandingPage` quando não há sessão.
- Nova rota `/login` → `Auth` em `PublicOnlyRoute`; `Navigate` de `/auth` e `/dp/login`; trocar `navigate("/auth")` por `/login`.
- Tokens `--site-*` atualizados para a paleta verde; Montserrat via Google Fonts.
- Atualizar `dp_modelos_mensagem_padrao` (texto) e `AcessoMassaDialog`.
- Atualizar `index.html` (title/description/og) e a memória de identidade visual (verde substitui laranja/marinho no site).
- Freeze ativo: alterações ficam no preview, nada publicado sem seu pedido.

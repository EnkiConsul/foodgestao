# Corrigir erro do CAPTCHA no login (código 110200)

## O que está acontecendo

O código `110200` do Cloudflare Turnstile significa **hostname não autorizado**: o domínio de onde a tela de login foi aberta não está na lista de hostnames do widget no painel do Cloudflare. Não é bug de código — o widget carrega, o Cloudflare recusa o domínio.

Você vai liberar os hostnames no Cloudflare. O ajuste no app é só deixar a mensagem correta e útil (hoje ela cita `gestor360food.com`, que não é mais o domínio do projeto).

## Hostnames para adicionar no widget Turnstile

- `aveto360.com`
- `www.aveto360.com`
- `aveto360.lovable.app`
- `lovableproject.com` (preview do editor — onde o erro aconteceu)
- `lovable.app` (preview compartilhado)
- `localhost` (desenvolvimento)

O Turnstile aceita apenas o hostname exato; subdomínios de preview mudam, então usar o domínio-raiz `lovableproject.com` cobre as URLs de preview.

## Mudanças no app

1. Mensagem de erro do CAPTCHA reescrita:
   - Título continua "Verificação de segurança indisponível neste domínio."
   - Texto passa a citar o domínio oficial correto (`aveto360.com`) e mostrar o hostname atual em que a tela está rodando, para facilitar a liberação no painel.
   - Instrução clara: "peça ao administrador para adicionar o domínio `<hostname atual>` na lista de hostnames do widget Turnstile".
2. Mensagens específicas por código: distinguir `110200` (domínio não autorizado) de falha de carregamento do script / rede, em vez de um texto único.
3. Mesma mensagem aplicada nas duas telas que usam o CAPTCHA: login e recuperação de senha.
4. Manter o botão "Tentar novamente" e o bloqueio do botão Entrar (o backend continua exigindo o token, sem bypass).

## Detalhes técnicos

- `src/pages/Auth.tsx` e `src/pages/EsqueciSenha.tsx`: bloco de erro do Turnstile passa a usar um helper de texto por código.
- Novo helper (ex.: `src/lib/auth/turnstileErrors.ts`) mapeando `110200` e demais códigos para título/mensagem/dica em PT-BR, com `window.location.hostname` no texto.
- Teste unitário do helper cobrindo `110200`, `script-load-failed` e código desconhecido.
- Sem mudança de backend: `auth-login` continua validando `turnstile_token` com o segredo.

## Fora de escopo

- Não vou desativar nem contornar o CAPTCHA em nenhum domínio.
- Não há como cadastrar hostnames no Cloudflare pelo app; essa parte é feita por você no painel.

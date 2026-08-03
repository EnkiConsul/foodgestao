# Liberar os domínios no Cloudflare Turnstile (erro 300030)

## Causa
O widget de segurança da tela de login usa um site key do Cloudflare Turnstile que só autoriza `gestor360food.com`. O preview do Lovable roda em outro hostname, então o Cloudflare recusa o desafio e devolve o código **300030** — daí a mensagem "Verificação de segurança indisponível neste domínio". Não é um bug do código: a lista de hostnames do widget precisa incluir os domínios de preview.

## O que você faz no painel Cloudflare
1. Acesse o Cloudflare → **Turnstile** → o widget usado no login (o mesmo do site key `0x4AAAAAAD8Nerc...`).
2. Clique em **Settings** e vá até **Hostname management**.
3. Adicione, além de `gestor360food.com`:
   - `www.gestor360food.com`
   - `foodgestao.lovable.app`
   - `lovable.app`
   - `lovableproject.com`
   (o Turnstile aceita o domínio raiz e cobre os subdomínios, por isso os dois últimos liberam os previews)
4. Salve e aguarde ~1 minuto para propagar.

## Como validar
1. Recarregue a tela de login no preview.
2. O bloco vermelho deve desaparecer e o widget "Verifique que você é humano" aparecer.
3. Faça um login real: se o CAPTCHA resolver, a autenticação segue normalmente (o backend valida o token no login e na recuperação de senha).

## Nenhuma mudança de código
A tela já trata o erro corretamente (mensagem clara + botão "Tentar novamente"), e o backend continua exigindo o CAPTCHA em todos os ambientes. Nada será alterado no projeto por esta etapa. Se depois de liberar os hostnames o erro persistir, o próximo passo é conferir se o site key retornado por `auth-config` é o mesmo widget que você editou — aí sim eu investigo no código.

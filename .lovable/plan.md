# Cardápio público em produção: 404

## O que está acontecendo

O link não está quebrado no código — a rota do cardápio existe no app (`/c/:slug`) e a loja `figlia-pizzaria` já está publicada no banco. O problema é a versão publicada do site.

Verificação feita agora contra o site ao vivo:

- `https://www.gestor360food.com/c/figlia-pizzaria` responde 200 (o servidor entrega o app, não é erro de hospedagem).
- O pacote JavaScript que está no ar (`index-BiH72s9W.js`) **não contém a rota `/c/:slug`**, ou seja, a última publicação do site é anterior à criação da página de cardápio. Sem a rota, o app cai na tela "404 Oops! Page not found".

Detalhe secundário observado: `www.gestor360food.com` redireciona (302) para `gestor360food.com`, enquanto os links canônicos gerados pelo sistema usam `www`. Funciona, mas gera um salto extra.

## O que fazer

1. Publicar/atualizar o site (mudanças de frontend só vão ao ar após "Update" no diálogo de publicação). Isso leva a rota do cardápio para produção.
2. Após a publicação, reabrir `https://www.gestor360food.com/c/figlia-pizzaria` e confirmar que o cardápio carrega (logo, banner, horários e itens).
3. Opcional, se quiser evitar o redirecionamento: padronizar `PUBLIC_SITE_ORIGIN` para `https://gestor360food.com` (domínio que a hospedagem serve direto) em `src/lib/siteOrigin.ts`, alinhando canonical, og:url e o link/QR code da loja.

## Nota técnica

Nenhuma alteração de banco ou de RLS é necessária. O único item de código eventual é o passo 3 (uma constante em `src/lib/siteOrigin.ts`) — me diga se quer que eu aplique.

# Link da loja online no domínio correto (www.gestor360food.com)

## Por que aparecia errado

Duas coisas separadas:

1. **O link montado usava o endereço do preview.** A função que gera a URL da loja (usada no botão "copiar link", no QR code e no "abrir loja") monta o endereço a partir do host aberto no navegador. Aberto dentro do preview do Lovable, ela gera `id-preview--....lovable.app/c/...` em vez do domínio da loja.
2. **A página `/c/fligia` mostra "Cardápio não encontrado"** porque não existe nenhuma loja salva no banco: a tabela de lojas online está vazia, então o endereço `fligia` nunca foi publicado. As permissões e políticas da tabela estão corretas — a configuração da etapa 4 não chegou a ser salva/publicada.

## O que fazer

**1. Fixar o domínio público em um único lugar**

Criar uma constante única de origem pública (`https://www.gestor360food.com`) e usá-la para:
- o link da loja exibido, copiado, aberto e gravado no QR code;
- o `canonical`, `og:url` e o JSON-LD da página pública da loja.

Assim o lojista sempre recebe `www.gestor360food.com/c/minha-loja`, mesmo configurando pelo preview.

**2. Padronizar o site em um único domínio**

Hoje o restante do site aponta para `gestor360food.com` (sem `www`) em canonical, og:url, sitemap, robots e JSON-LD. Se o domínio principal é o `www`, manter dois formatos divide o sinal para o Google. A proposta é alinhar tudo para `https://www.gestor360food.com`: componente de canonical, `index.html`, `public/sitemap.xml`, `public/robots.txt` e a página de guia. O outro formato continua funcionando (redireciona para o principal).

Se você preferir manter o site em `gestor360food.com` sem `www` e só o link da loja em `www`, faço apenas o item 1 — é só dizer.

**3. Publicar a loja de teste**

Depois do ajuste, revisar a etapa 4 do onboarding: preencher o endereço `fligia`, salvar e publicar, confirmando que a linha é criada no banco e que a página pública carrega. Se o salvamento falhar, o erro exato aparecerá e será corrigido na mesma etapa.

## Detalhes técnicos

- `src/lib/orders/storefront.ts`: `storefrontPublicUrl` passa a usar a constante `PUBLIC_SITE_ORIGIN` em vez de `window.location.origin`.
- `src/pages/storefront/LojaOnline.tsx`: canonical, `og:url` e `url` do JSON-LD `Restaurant` passam a usar a mesma constante.
- `src/components/seo/CanonicalUrl.tsx`: `SITE_ORIGIN` para `https://www.gestor360food.com` (item 2).
- `index.html`, `public/sitemap.xml`, `public/robots.txt`, `src/pages/guias/DasMei.tsx`: trocar as URLs absolutas para o domínio com `www` (item 2).
- Sem mudança de banco, RPC ou Edge Function; a validação de imagens por slug continua igual.

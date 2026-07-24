## Objetivo

Conectar o projeto **360°FOOD** ao Google Search Console (GSC) usando o connector nativo da Lovable, permitindo:

- Verificar automaticamente a propriedade `https://gestor360food.com` (método META tag)
- Consultar dados de indexação, cliques, impressões e posição média
- Inspecionar URLs específicas
- Alimentar dashboards/relatórios internos (ex.: `/admin/seo-indexacao`)

## Passos

1. **Abrir card de conexão do Google Search Console**
   - Chamar o connector `google_search_console` para exibir o card in-chat.
   - Você escolhe a conta Google (deve ser a mesma que administra a propriedade no GSC) e autoriza os escopos de leitura + verificação.

2. **Verificar a propriedade `gestor360food.com`** (se ainda não estiver verificada)
   - Solicitar token META via `siteVerification/v1/token`.
   - Injetar `<meta name="google-site-verification" content="…" />` no `<head>` de `index.html`.
   - Publicar o site para o Google conseguir ler a tag.
   - Chamar `siteVerification/v1/webResource` para confirmar a propriedade.
   - Registrar o site em `webmasters/v3/sites` para aparecer na listagem.

3. **Testar leitura básica**
   - Listar propriedades verificadas (`GET /webmasters/v3/sites`).
   - Rodar uma URL Inspection na home (`gestor360food.com`) para validar credenciais e permissões.

4. **(Opcional, se você quiser)** ligar o painel existente `/admin/seo-indexacao` aos dados reais do GSC via Edge Function que consome o gateway do connector, com cache curto para evitar quota.

## Detalhes técnicos

- O connector expõe as credenciais como variáveis de ambiente do backend (nunca no frontend).
- Todas as chamadas passam pelo gateway Lovable:
  `https://connector-gateway.lovable.dev/google_search_console/…`
  com headers `Authorization: Bearer $LOVABLE_API_KEY` e `X-Connection-Api-Key: $GOOGLE_SEARCH_CONSOLE_API_KEY`.
- Método de verificação será **META tag** (único viável para app Lovable — DNS/arquivo exigem infra que não controlamos aqui).
- A meta tag entra em `index.html` (SSR estático), não via `react-helmet`, para o Googlebot conseguir ler no primeiro fetch.
- Domínio alvo: `https://gestor360food.com` (Published + Custom Domain ativo).

## Pré-requisitos que preciso confirmar com você

- A conta Google que você vai autorizar **já é proprietária/administradora** da propriedade `gestor360food.com` no GSC? Se ainda não tem a propriedade lá, faremos a verificação META tag como parte deste plano.
- Quer que eu já deixe o painel `/admin/seo-indexacao` puxando dados reais do GSC nesta mesma leva, ou apenas conectar por enquanto?

## O que NÃO faz parte deste plano

- Configurar Bing Webmaster Tools ou outros mecanismos.
- Enviar sitemap ao GSC (posso adicionar depois; o `public/sitemap.xml` já existe).
- Alterar `robots.txt` ou estrutura de rotas.

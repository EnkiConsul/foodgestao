# Migrar configurações de SEO para a nova conta Google (Aveto 360)

## Diagnóstico atual

- **Google Analytics 4**: a tag `G-S82MB9C11K` já está no `index.html` e em `usePageviewTracking.ts` — aparentemente atualizada para a nova conta.
- **Google Search Console**: a conexão vinculada ao projeto ainda é **"360°FOOD"** (conta antiga). Existe uma conexão não vinculada chamada **"Dra. Michelle Castro"**.
- **Edge Function `inspect-search-console`**: quando nenhum `siteUrl` é enviado, ela usa o fallback `https://360food.com/` — domínio antigo que não pertence mais à marca.
- **Verificação do site**: a meta tag `google-site-verification` no `index.html` tem o token `uEnZtdgnm96MGthMyV75OFy141liZeRAbfScjEd41Mg`. Precisa ser validado se pertence à propriedade correta (`www.aveto360.com` / `aveto360.com`).
- **Sitemap/robots**: já apontam para `https://www.aveto360.com`, estão corretos.

## O que será feito

1. **Trocar a conexão do Search Console** para a nova conta Google (`Dra. Michelle Castro` ou outra que você indicar), desvinculando a conta antiga "360°FOOD".
2. **Atualizar a Edge Function** `supabase/functions/inspect-search-console/index.ts` para usar `https://www.aveto360.com/` como fallback de `siteUrl`.
3. **Verificar a propriedade correta** no Search Console para `aveto360.com` / `www.aveto360.com` e, se necessário, atualizar a meta tag `google-site-verification` no `index.html`.
4. **Reenviar o sitemap** para a nova propriedade do Search Console.
5. **Reexecutar o SEO scan** e confirmar que não há findings pendentes relacionados à migração.

## Detalhes técnicos

- `supabase/functions/inspect-search-console/index.ts`: alterar `const siteUrl = body.siteUrl ?? "https://360food.com/";` para `https://www.aveto360.com/`.
- `index.html`: manter ou trocar a linha `<meta name="google-site-verification" content="..." />` conforme o token da nova propriedade verificada.
- Conector: usar `standard_connectors` para desvincular a conta antiga e vincular a nova.
- Sitemap: `https://www.aveto360.com/sitemap.xml` já está pronto; apenas reenviar via Search Console.

## Resultado esperado

- Painel admin **Indexação SEO** consulta a propriedade correta (`aveto360.com`).
- O Google Search Console recebe o sitemap da nova marca.
- Nenhuma referência a `360food.com` permanece no código de SEO/integrações Google.

## Por que aparece a logo antiga no Google

O favicon que o Google exibe na SERP é buscado em `https://gestorplin.com/favicon.ico`. Esse arquivo hoje ainda é o ícone genérico antigo (gradiente azul/laranja/rosa em forma de coração — herdado do template inicial), não a marca Gestor Plin. Além disso, o Google cacheia favicons por semanas, então mesmo após corrigir, a SERP só atualiza no próximo rastreio do `googlefavicon` bot.

## O que vou fazer

1. **Gerar um novo `favicon.ico` (multi-resolução: 16, 32, 48px)** a partir do asset oficial `src/assets/gestorplin-appicon.png` e substituir `public/favicon.ico`.
2. **Regerar `public/icon-192.png` e `public/icon-512.png`** a partir do mesmo asset oficial (caso ainda contenham a arte antiga), mantendo a versão maskable.
3. **Adicionar referências explícitas no `<head>` do `index.html`**:
   - `<link rel="icon" type="image/x-icon" href="/favicon.ico">`
   - `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`
   - `<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">`
   - manter `apple-touch-icon` já existente
4. **Republicar o site** via `preview_ui--publish` para propagar os novos ícones na CDN.
5. **Validar** que `https://gestorplin.com/favicon.ico` retorna a nova arte (via `curl` + comparação MD5 com o arquivo local).
6. **Orientar o usuário** sobre o cache do Google: pode levar de poucos dias a algumas semanas para a SERP atualizar. Não há botão de "forçar atualização" do favicon no Search Console — só rastreio orgânico. Verificar antes em `https://www.google.com/s2/favicons?domain=gestorplin.com&sz=64`, que atualiza mais rápido que a SERP.

## Observação técnica

Vou usar Python (Pillow) no sandbox para gerar o ICO multi-resolução a partir do PNG da marca — esse é o formato que o Google prefere. Não vou tocar em código de aplicação; é só asset + tags `<link>` no `index.html`.

## O que NÃO vou fazer

- Não vou alterar a logo dentro do app (sidebar/header) — já está correta.
- Não vou mexer no manifest PWA além do necessário para os ícones.
- Não vou prometer atualização imediata na SERP — isso depende do Google.

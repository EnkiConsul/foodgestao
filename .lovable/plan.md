## Diagnóstico

A SERP do Google na imagem mostra **dois sinais de cache desatualizado**, não bugs no site:

1. **Favicon antigo** (coração gradiente da Lovable) — o arquivo `public/favicon.ico` em produção já é o novo (MD5 confirmado em iterações anteriores). O Google mantém um índice próprio de favicons (`googlefavicon` bot) que atualiza em ciclos próprios — pode levar semanas.
2. **Descrição "Teste grátis por 14 dias"** — o `index.html` já está com "7 dias" há várias iterações. O snippet exibido vem do cache do índice do Google, anterior à última republicação.

Ou seja: **o site está correto**; o que aparece na SERP é cache do Google. Não há código para "consertar" — o que dá para fazer é **forçar/acelerar o recrawl**.

## O que vou fazer

1. **Verificar produção** (sem alterar nada): confirmar via `curl` que `https://gestorplin.com/favicon.ico` e o `<meta name="description">` do `index.html` em produção já refletem a marca Gestor Plin e "7 dias".
2. **Forçar reindexação no Google Search Console** via conector já conectado (`google_search_console`):
   - `urlInspection/index:inspect` em `https://gestorplin.com/` para ver o estado atual no índice e identificar a data do último crawl.
   - Submeter pedido de recrawl da home (equivalente ao botão "Solicitar indexação" do Search Console).
3. **Reaquecer o cache do favicon do Google**: bater no endpoint `s2/favicons?domain=gestorplin.com&sz=64` para validar que o índice de favicons já tem a arte nova (em iteração anterior já estava com paleta azul Gestor Plin — vou reconfirmar).
4. **Reportar ao usuário**:
   - Site está correto, é cache do Google.
   - Pedido de reindexação enviado.
   - Janela típica: SERP textual atualiza em poucos dias; favicon na SERP pode levar até algumas semanas (não há API para forçar).
   - Sugerir limpar o cache do próprio navegador dele (Ctrl+Shift+R) — às vezes o que ele vê é cache local, não do Google.

## O que NÃO vou fazer

- Não vou alterar `favicon.ico`, `index.html`, manifest ou qualquer asset — já estão corretos.
- Não vou republicar o site só por republicar; isso não acelera o recrawl do Google.
- Não vou prometer prazo exato de atualização da SERP — é controlado pelo Google.

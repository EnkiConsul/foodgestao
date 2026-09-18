# AUD-021 — Métricas de marketing desativadas temporariamente

Status: **desativado explicitamente** (frontend). Google Analytics (gtag.js) e
pixel da Meta não são carregados, inicializados, pré-conectados nem
enfileirados em nenhuma página deste aplicativo.

## Por que

Os SDKs leem a URL por conta própria (medição avançada / captura automática de
eventos). Por isso nenhuma sanitização feita pelo aplicativo consegue garantir
que uma credencial temporária presente no link não chegue ao terceiro:

- `withPageContext` espalhava os parâmetros do chamador sobre o contexto, então
  qualquer chamada podia injetar `page_location`, `page_path`, `page_title` ou
  `referrer` com token.
- O `PageView` da Meta lê a URL real internamente; o sanitizador do Google não
  alcança o pixel.
- `gtag('config', …, { send_page_view: false })` não desliga medição avançada
  nem eventos automáticos de um SDK já carregado, e o efeito do React roda
  depois de o histórico mudar — ou seja, a barreira no SPA não era previsível.

A contenção previsível é não haver tracker algum enquanto as páginas de
marketing não estiverem isoladas das páginas autenticadas e dos links com
credencial (ativação, recuperação, convite, autorização).

## O que foi removido

- `index.html`: tags de script do gtag.js e do pixel, imagem em `<noscript>`,
  qualquer pré-conexão/prefetch para domínios de tracker.
- `public/scripts/gtag-init.js`, `public/scripts/meta-pixel.js`,
  `public/scripts/tracking-privacy.js` (bootstrap dos trackers).
- `src/lib/analytics.ts`: `trackEvent` é no-op — não cria `dataLayer`, não
  chama `gtag`/`fbq` e **não mantém fila para reenvio futuro** (fila guardada
  seria vazamento adiado). A assinatura pública foi mantida para as telas não
  mudarem.
- `src/hooks/usePageviewTracking.ts`: no-op, sem leitura de URL.
- `src/pages/Auth.tsx`: não lê mais `document.referrer`.

## O que permanece

- `src/lib/security/trackingPrivacy.ts` (sanitizadores) fica para o trabalho de
  reativação. Nada o usa para enviar dados hoje.
- `src/lib/security/cspViolationLogger.ts` é **segurança**, não métrica: segue
  ativo, só console, sem coletor.
- `src/lib/security/csp.ts` e `docs/security/csp-headers-phase1.json` não foram
  alterados, para não mexer na regra já publicada na borda. As origens de
  Google/Meta continuam apenas permitidas (nada as usa) — remover exige
  atualizar a regra de produção junto.

## Perda temporária

Sem visualizações de página, sem funil de cadastro (`sign_up`,
`generate_lead`, cliques de CTA) e sem público/conversões da Meta enquanto a
desativação valer. Relatórios de Google Analytics e Gerenciador de Anúncios vão
mostrar queda a zero a partir da próxima publicação. As análises internas do
produto não dependem disso.

## Condição para reativar

1. Isolar as páginas de marketing (site público) das rotas autenticadas e de
   todas as rotas que recebem credencial temporária, de modo que o SDK nunca
   seja carregado nessas páginas — separação por documento/origem, não por
   verificação em tempo de execução dentro do mesmo SPA.
2. Enviar eventos por esquema fechado por evento (campos permitidos
   explicitamente), sem aceitar URL, título ou objeto arbitrário do chamador.
3. Desligar medição avançada / captura automática na configuração da
   propriedade, não apenas no código.
4. Rever a allowlist de CSP junto com a mudança.

## Consentimentos antigos não reativam coleta

O aviso de cookies registra apenas preferência (`plin_cookie_consent`). Nenhum
caminho do aplicativo lê esse valor para carregar SDK: aceitar, recusar ou
personalizar não cria fila nem dispara rede. Consentimentos guardados antes da
desativação **não** valem como base para religar nada.

Se qualquer finalidade, provedor ou escopo de dados mudar na reativação, é
necessário **revalidar o consentimento** (novo aviso, nova decisão explícita),
além dos itens da seção "Condição para reativar". O texto do aviso também deve
ser atualizado no mesmo commit, porque hoje ele afirma que a coleta está
desativada.

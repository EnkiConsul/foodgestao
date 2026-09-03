# Verificar ativação do Pixel da Meta

Objetivo: confirmar que o Pixel da Meta está instalado corretamente, respeitando o consentimento de cookies de marketing, e realizar ajustes mínimos se necessário.

## Tarefas

1. **Auditoria do código em `index.html`**
   - Confirmar que o script base do Pixel (`fbevents.js`, `fbq('init', '1575266947199692')`, `fbq('track', 'PageView')`) está presente no `<head>`.
   - Verificar que o fallback `<noscript><img ... /></noscript>` está no `<body>` (exigido pelo Meta e pela documentação de HTML5).
   - Garantir que não há duplicatas de script/pixel.

2. **Validar lógica de consentimento**
   - O Pixel deve disparar somente quando `plin_cookie_consent.marketing === true`.
   - Confirmar que o evento `plin:cookie-consent-change` também aciona o carregamento caso o usuário mude o consentimento depois da carga inicial.

3. **Validar no preview/navegador**
   - Abrir a página inicial, aceitar cookies de marketing (ou simular `localStorage` de consentimento) e confirmar que `fbq` está disponível e `fbevents.js` foi carregado.
   - Verificar no console de rede que o Pixel enviou o evento `PageView` para o endpoint do Meta.
   - Garantir que, antes do aceite, o Pixel não dispara.

4. **Correções mínimas (se necessário)**
   - Ajustar posição do `<noscript>` se estiver no `<head>` (mover para `<body>`, conforme HTML5).
   - Corrigir qualquer divergência entre o snippet fornecido e a implementação atual.

## Resultado esperado
Pixel ativo corretamente, disparando `PageView` após consentimento de marketing, sem duplicatas ou erros de carregamento.

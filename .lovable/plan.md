# Fazer o Meta detectar o Pixel sem abrir mão do consentimento

## Por que o Meta não detecta

Hoje o código do Pixel só é carregado depois que o visitante aceita cookies de marketing. O detector do Meta (e a ferramenta "Configurar eventos") abre o site sem aceitar nada, então `fbq` nunca existe e ele conclui que não há pixel instalado.

## Solução: Modo de Consentimento do Meta

Passar a usar o recurso oficial de consentimento do Pixel:

1. O script do Pixel carrega sempre e o pixel é inicializado imediatamente — assim o Meta consegue detectá-lo.
2. Antes do `init`, chamar `fbq('consent', 'revoked')` quando não houver consentimento de marketing. Nesse estado o Pixel fica carregado mas não envia eventos.
3. Quando o visitante aceita cookies de marketing, chamar `fbq('consent', 'grant')` e disparar o `PageView`.
4. Se o consentimento já estiver salvo na visita, conceder direto e disparar o `PageView` normalmente.

Resultado: privacidade preservada (nenhum evento enviado sem consentimento) e o Pixel visível para as ferramentas do Meta.

## Detalhes técnicos

- Arquivo: `index.html`, bloco "Meta Pixel Code".
- Ordem das chamadas: snippet base → `fbq('consent', 'revoked'|'grant')` → `fbq('init', '1575266947199692')` → `PageView` apenas com consentimento.
- Manter o listener `plin:cookie-consent-change` para conceder consentimento em tempo real (sem recarregar a página).
- O `<noscript>` permanece no `<body>`.

## Validação

- Playwright no preview: sem consentimento, o `fbevents.js` carrega e `fbq` existe, mas nenhuma requisição a `facebook.com/tr` de PageView é enviada.
- Após aceitar marketing: consentimento concedido e `PageView` enviado.
- Depois é preciso publicar para o site em `www.aveto360.com` refletir a mudança antes de repetir a detecção no painel do Meta.

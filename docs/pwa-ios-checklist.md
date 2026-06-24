# Checklist de validação — Banner PWA no iPhone

Use este checklist em um iPhone real (não simulador) para validar o componente `InstallPrompt`.

## Pré-requisitos

- iPhone com iOS 16.4+ (Safari)
- Acesso à URL publicada: `https://gestorplin.com`
- Limpar dados do site antes de cada cenário:
  Ajustes → Safari → Avançado → Dados de Sites → buscar `gestorplin` → Apagar.

## Cenários

### 1. iPhone Safari, app NÃO instalado → DEVE aparecer
1. Abrir Safari → `https://gestorplin.com` e fazer login.
2. Esperado: banner azul no rodapé com "Instalar Gestor Plin" + instruções "Compartilhar → Adicionar à Tela de Início".
3. Console (Web Inspector via Mac): `[PWA InstallPrompt] showing iOS Add to Home Screen instructions`.

### 2. iPhone Safari, app JÁ instalado → NÃO deve aparecer
1. Tocar Compartilhar → Adicionar à Tela de Início → Adicionar.
2. Abrir o app pelo ícone na home (modo standalone).
3. Esperado: nenhum banner.
4. Log esperado: `skipping: app already installed (standalone mode)`.

### 3. iPhone Chrome / Firefox / Edge → NÃO deve aparecer
1. Abrir o mesmo URL em Chrome (CriOS) ou Firefox (FxiOS) no iPhone.
2. Esperado: nenhum banner (esses navegadores não podem instalar PWA no iOS).
3. Log esperado: `skipping iOS prompt: only Safari can install PWA on iOS`.

### 4. Navegador in-app (Instagram/Facebook/TikTok) → NÃO deve aparecer
1. Postar o link no Instagram DM e abrir pelo app.
2. Esperado: nenhum banner.
3. Log esperado: `skipping iOS prompt: in-app browser cannot install PWA`.

### 5. Dismiss → não reaparece por 14 dias
1. Cenário 1 + tocar no X do banner.
2. Recarregar a página.
3. Esperado: banner permanece oculto.
4. Log esperado: `skipping: user dismissed recently`.
5. Voltar após 14 dias (ou limpar `localStorage['pwa-install-dismissed-at']`) → reaparece.

### 6. Android Chrome → comportamento nativo (controle)
1. Abrir no Android Chrome.
2. Esperado: banner com botão "Instalar app" (via `beforeinstallprompt`).
3. Log esperado: `captured beforeinstallprompt (Android/Chrome)`.

## Como ler os logs no iPhone

1. Mac → Safari → Preferências → Avançado → "Mostrar menu Desenvolvedor".
2. iPhone conectado via cabo → Desenvolvedor → [nome do iPhone] → aba do Gestor Plin.
3. Console mostra todos os logs com prefixo `[PWA InstallPrompt]`.

## Testes automatizados

Os cenários de detecção (UA, standalone, dismiss, in-app browser) estão cobertos por:

```
src/components/pwa/InstallPrompt.test.tsx
```

Rodar com `bunx vitest run src/components/pwa/InstallPrompt.test.tsx`.

Esses testes simulam User-Agents reais (iPhone Safari, iPhone Chrome, iPad, Instagram, Android, Desktop)
e validam o React tree, mas **não substituem o teste manual no dispositivo real** —
o evento `beforeinstallprompt` e o modo standalone do iOS só podem ser confirmados em hardware.

## Problema

No iPhone, o Safari **não dispara** o evento `beforeinstallprompt` (que é o que mostra o botão "Instalar" no Android/Chrome). No iOS, a instalação como PWA só acontece manualmente: o usuário precisa abrir o menu **Compartilhar** do Safari → **Adicionar à Tela de Início**.

Como o app hoje não tem nenhum componente de instalação (nem para Android nem para iOS), no iPhone simplesmente não aparece nada — é por isso que parece "não estar disponível".

## Solução

Criar um **banner/prompt de instalação** que:

1. **Detecta iOS Safari** (iPhone/iPad) e mostra um banner com instruções visuais:
   - "Para instalar o Gestor Plin no seu iPhone, toque em [ícone de compartilhar] e depois em **Adicionar à Tela de Início**."
   - Ícone ilustrativo do botão Share do iOS.
2. **Detecta Android/Chrome** e captura `beforeinstallprompt` para mostrar um botão "Instalar app" nativo (bônus, já resolve para Android também).
3. **Não aparece** se o app já está rodando em modo standalone (`display-mode: standalone` ou `navigator.standalone`).
4. **Pode ser fechado** pelo usuário e o estado fica salvo em `localStorage` (não incomoda quem dispensou).
5. Aparece como banner discreto no rodapé/topo apenas em telas mobile dentro do app autenticado.

## Onde colocar

- Novo componente: `src/components/pwa/InstallPrompt.tsx`
- Montado uma vez no `AppLayout.tsx` (já é o layout das telas internas mobile).

## Detalhes técnicos

- Detecção iOS: `/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream`.
- Detecção standalone: `window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone`.
- Manifest e `apple-touch-icon` já estão configurados corretamente no `index.html` — nada a mudar lá.
- Sem novas dependências.

## Fora de escopo

- Não vou mexer no service worker / `vite.config.ts` — o PWA já está configurado.
- Não vou mudar ícones ou manifest.

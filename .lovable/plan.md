# Botão de início no celular fica carregando

## O que foi verificado

Abri o Pessoas 360° em tela de celular (407x748), já com usuário conectado, e testei o botão redondo de início da barra de baixo:

- Quando o aviso de cookies ainda está na tela, ele fica exatamente por cima da barra de baixo e **rouba o toque**: o dedo acerta o aviso, não o botão de início. O sistema não sai do lugar.
- Depois de responder o aviso de cookies, o botão de início funciona: abre o Painel Administrativo em cerca de 1 segundo, sem bolinha girando.

Ou seja: a sobreposição do aviso está confirmada. A tela toda com a bolinha girando ainda **não foi reproduzida** aqui, então a causa exata dela segue sem confirmação.

## O que será feito

1. **Aviso de cookies fora da barra de baixo (correção confirmada)**
   No celular, o aviso passa a ficar acima da barra de navegação, com espaço reservado, para nunca cobrir os botões. No computador nada muda.

2. **Nunca mais ficar preso na bolinha girando (proteção)**
   As verificações de entrada (sessão, cadastro, segurança em duas etapas) hoje mostram a bolinha em tela cheia enquanto respondem. Se alguma delas não responder em poucos segundos, em vez de girar para sempre a tela mostrará uma mensagem curta com os botões "Tentar novamente" e "Ir para o Hub".

3. **Deixar rastro para achar a causa**
   Quando essa espera passar do tempo limite, será registrado um erro no painel de erros com a tela, o usuário e qual verificação travou. Assim, se acontecer de novo com você, eu vejo exatamente onde parou.

## Como validar

- No celular, com o aviso de cookies aberto: tocar no botão de início deve funcionar de primeira.
- Tocar no início de várias telas do Pessoas 360° e do Portal do Colaborador: deve abrir direto.
- Simular uma verificação lenta: a tela deve oferecer "Tentar novamente" em vez de girar sem fim.

## Detalhes técnicos

- `src/components/legal/CookieConsentBanner.tsx`: no mobile, trocar `bottom-3` por um deslocamento acima da `MobileBottomNav` (altura 64px + `env(safe-area-inset-bottom)`) e manter `z-[60]` apenas fora da área da barra.
- `src/routes/onboardingGuards.tsx`: em `ProtectedRoute`/`OnboardingGuard`, adicionar um timeout (~10s) para `loading | checkingOnboarding | mfaChecking | portal.checking`; ao estourar, renderizar um painel de recuperação (retry + link `/hub`) e chamar `reportError` com `scope` da verificação pendente.
- Sem mudanças de banco; guardas continuam fail-closed (nada de liberar rota por timeout).

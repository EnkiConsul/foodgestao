# Tela branca em todas as rotas — diagnóstico

## Estado verificado agora

- Dev server saudável (`/` responde, HMR ok, sem erros de compilação nos últimos 200 logs).
- Reproduzi `/admin/assinaturas` via navegador headless com sua sessão autenticada: **renderizou normalmente**, sem `pageerror` no console — só warnings do React Router v7.
- Nenhum log de erro no Edge Runtime desde 19:23.
- Console/network do seu preview no snapshot atual estão vazios — não chegou nenhum erro para mim.

Ou seja: o build atual está funcional no servidor. A tela branca é **client-side**, e o suspeito principal é cache — em especial o Service Worker do PWA.

## Suspeita principal: Service Worker com bundle antigo

`src/main.tsx` registra um Service Worker em produção (`virtual:pwa-register`, `immediate: true`). Se um deploy anterior gravou um `sw.js` que aponta para chunks JS que já não existem, o browser continua servindo o HTML antigo → JS 404 → **tela branca em toda rota**. Isso combina com o sintoma "branca em todas as rotas" mesmo com o servidor OK.

O código já desregistra SW quando detecta preview/iframe, mas **não** nos domínios publicados (`foodgestao.lovable.app`, `gestor360food.com`, `www.gestor360food.com`).

## Passos do plano

1. **Confirmar em qual URL a tela está branca** (preview `id-preview--...lovable.app`, publicado `foodgestao.lovable.app`, ou domínio custom `gestor360food.com`) — preciso disso para decidir se é SW ou outra coisa.
2. **Coletar sinal do browser**: pedir para abrir DevTools → Console e Network e me passar o primeiro erro vermelho + qualquer request em 404/500. Sem esse sinal estou adivinhando.
3. **Mitigação imediata** (você executa no browser afetado, sem código):
   - DevTools → Application → Service Workers → **Unregister**.
   - Application → Storage → **Clear site data**.
   - Recarregar com Ctrl+Shift+R.
4. **Se confirmar que era o SW** (passo 3 resolve): endurecer `src/main.tsx` para:
   - Publicar uma nova versão que, ao inicializar, faz `navigator.serviceWorker.getRegistrations()` e desregistra qualquer SW **cujo script não seja o `sw.js` do build atual** (self-healing anti-cache).
   - Adicionar `registerSW({ immediate: true, onNeedRefresh: () => location.reload() })` para forçar reload no próximo update.
5. **Se o passo 3 não resolver**: partir para a segunda hipótese — erro de runtime em algum provider global (`AuthProvider`, `CompanyContextProvider`, `QueryClientProvider`) que derruba a árvore inteira. Nesse caso preciso dos logs do passo 2 antes de mexer no código.

## Detalhes técnicos

- Não vou tocar em código no passo 1-3 (é diagnóstico + ação no seu browser).
- O passo 4 é uma proteção retroativa: só entra se o passo 3 comprovar a causa. Nunca faço "self-heal" cego porque um SW mal escrito pode entrar em loop de reload.
- O reset de SW só afeta o cache de assets do PWA — sessão de login e dados no Supabase permanecem.

## O que preciso de você antes de codar

- URL exata onde vê branco.
- Print/texto do primeiro erro no Console (F12) e da aba Network filtrando por status ≥ 400.

# Cardápio público fica "carregando" no celular

## O que foi verificado agora

- `https://www.gestor360food.com/c/figlia-pizzaria` responde 200 e, aberto em um navegador limpo (mobile 390px), **carrega completo**: capa, cartão da loja, horários e os 3 itens do cardápio. Sem erros de console e sem requisições falhando.
- A API pública do cardápio (`storefront_public_get`) responde normalmente com a loja publicada (`is_published = true`, tema `fresh`).
- A mesma rota também carrega no preview.

Conclusão: o servidor, o banco e o código atual estão OK. O "carregando infinito" acontece **só em navegadores que já visitaram o site antes** — ou seja, é cache/Service Worker antigo no aparelho.

## Causa mais provável

O `public/sw.js` atual (worker de limpeza) faz, ao ativar: apaga caches → assume o controle → **manda todas as abas navegarem de novo** → se desregistra. Se o navegador reinstala/reativa esse worker (ou a página recarrega antes da desinstalação concluir), a aba entra em ciclo de navegação e o usuário vê a tela em carregamento permanente.

## O que fazer

1. **Tornar o worker de limpeza inofensivo**: manter a limpeza de caches e o `unregister()`, mas remover o `client.navigate()` (que é o que causa o ciclo) e gravar uma marca para nunca repetir a ação mais de uma vez por navegador.
2. **Rede de segurança na página do cardápio**: se o carregamento passar de ~8s, mostrar uma tela com mensagem clara e um botão "Recarregar" que limpa caches + Service Workers antes de recarregar (reaproveitando `recoverFromStaleBundle`), em vez de girar para sempre.
3. **Validar**: simular um navegador que já tinha o worker antigo registrado, abrir a URL e confirmar que a página abre sem ciclo, e testar o botão de recarregar.

Solução imediata para hoje, antes da publicação: abrir a URL em aba anônima ou limpar os dados do site no celular — nesse estado a página abre normalmente.

## Detalhes técnicos

- `public/sw.js`: remover o bloco `clients.matchAll` + `client.navigate`; manter `skipWaiting`, limpeza de caches Workbox e `unregister()`.
- `src/pages/storefront/LojaOnline.tsx`: no estado de loading, timer de 8s → tela de fallback com botão que chama `recoverFromStaleBundle()` (`src/lib/staleBundle.ts`), com o guard de sessão relaxado para permitir a ação manual.
- Sem alterações de banco, RLS ou Edge Functions.
- As mudanças de frontend só valem no celular do usuário depois de publicar.

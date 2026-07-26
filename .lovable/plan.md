## Objetivo

Fazer com que os atalhos personalizados (slots A, B e C do Hub) que **eu** configurar no preview virem os **defaults globais** para todos os usuários. Cada usuário ainda poderá personalizar depois via long-press — só muda o *ponto de partida*.

## Como está hoje

- `src/config/mobileNav.tsx` define `defaultShortcutA/B/C` em cada módulo, apontando para os primeiros itens da lista (`financeiroShortcuts[0]`, etc.).
- `src/hooks/useModuleShortcut.ts` resolve o atalho efetivo: usa a escolha do usuário se existir em `dp_user_prefs.extras.mobile_shortcuts` ou `localStorage`; caso contrário, cai nesse default hard-coded.
- Ou seja, para mudar o default global basta trocar o `NavLeaf` referenciado em `defaultShortcutA/B/C` de cada módulo.

## Correção

1. **Adicionar um bloco de "Defaults globais dos atalhos"** no topo de `src/config/mobileNav.tsx`, explícito e fácil de editar, no formato:
   ```ts
   const GLOBAL_SHORTCUT_DEFAULTS = {
     financeiro: { A: "/rota-a", B: "/rota-b" },
     dp:         { A: "/rota-a", B: "/rota-b" },
     portal:     { A: "/rota-a", B: "/rota-b" },
     hub:        { A: "/rota-a", B: "/rota-b", C: "/rota-c" },
     admin:      { A: "/rota-a", B: "/rota-b" },
     conta:      { A: "/rota-a", B: "/rota-b" },
   };
   ```
   Cada valor é a rota (`to`) do `NavLeaf` desejado dentro daquela lista de atalhos do módulo.

2. **Ajustar cada `MODULE_NAV[modulo]`** para resolver `defaultShortcutA/B/C` a partir desse mapa (procurando na lista de shortcuts do módulo pelo `to`), com fallback para o primeiro item se a rota for inválida.

3. **Preencher inicialmente** com os atalhos que já estão em uso hoje (paridade — nenhuma mudança visual imediata). Assim que você me informar quais rotas devem ser os defaults por módulo, eu substituo os valores.

4. **Não** vou mexer em `useModuleShortcut.ts`, `useDpUserPrefs`, RLS, banco, nem no `ShortcutCustomizer`. A personalização por usuário continua funcionando exatamente como está — só o *default inicial* muda.

## Fluxo depois da mudança

- Você me diz (ou edita direto) os atalhos desejados para cada módulo em `GLOBAL_SHORTCUT_DEFAULTS`.
- Ao publicar, qualquer usuário novo (ou sem personalização salva) verá esses atalhos como padrão.
- Usuários que já personalizaram mantêm sua escolha (comportamento atual preservado).

## Perguntas antes de aplicar

Se quiser, já me passe as rotas desejadas por módulo (ex.: "Hub → A: /lancamentos, B: /dp, C: /buscar"). Se preferir, aplico o refactor mantendo os defaults atuais e depois você indica os novos.
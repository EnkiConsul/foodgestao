## Objetivo

Eliminar a duplicidade "Financeiro/Financeiro" no Hub transformando o Slot 1 em um **terceiro atalho personalizável** ("C"), e **sincronizar os três atalhos (A, B, C) entre dispositivos** via `dp_user_prefs.extras`, com fallback em `localStorage` para usuários não autenticados.

## Comportamento

- **Fora do Hub**: Slot 1 continua sendo "Hub" (`/hub`). Sem mudança.
- **Dentro do Hub**: Slot 1 vira o atalho **C** personalizável.
  - Long-press abre o sheet "Personalizar Barra Inferior" com três chips por item: **1º**, **2º**, **4º**.
  - Colisão bloqueada: um mesmo destino não pode ocupar dois slots (A ≠ B ≠ C).
  - Default do C: primeiro módulo ativo (ex.: Financeiro → `/dashboard`).

## Sincronização entre dispositivos

Preferência salva em `dp_user_prefs.extras` (JSONB já existente, mesmo padrão usado em `useFavoriteNavItems`):

```json
{
  "mobile_shortcuts": {
    "financeiro": { "a": "/lancamentos", "b": "/fluxo-caixa" },
    "dp":         { "a": "/dp/aprovacoes", "b": "/dp/colaboradores" },
    "hub":        { "a": "/dashboard", "b": "/dp", "c": "/dashboard" }
  }
}
```

Regras:
- Usuário autenticado com empresa selecionada → lê/grava em `dp_user_prefs.extras.mobile_shortcuts` (mesmo pattern `useDpUserPrefs.available`).
- Não autenticado / sem prefs → `localStorage` (chaves atuais `360food:mobile-shortcut:<mod>:<slot>`).
- Ao logar pela primeira vez com prefs remotas ausentes e locais presentes → migração one-shot (upload dos valores locais para o backend, sem apagar o local).
- Mudança em um dispositivo → outro dispositivo pega na próxima carga de `dp_user_prefs` (o hook já refetch em foco/reconnect via React Query).

## Layout (Hub)

```text
[ C (1º) ] [ A (2º) ] [ Home (grid) ] [ B (4º) ] [ Mais ]
```

## Detalhes técnicos

Arquivos alterados:

1. `src/hooks/useDpUserPrefs.tsx`
   - Adicionar leitura/escrita de `extras.mobile_shortcuts` (get/set por `mod` + `slot`).
   - Expor `mobileShortcuts` (record) e `setMobileShortcut(mod, slot, to)`.

2. `src/hooks/useModuleShortcut.ts`
   - `ShortcutSlot` = `"a" | "b" | "c"`.
   - Trocar fonte primária: se `useDpUserPrefs().available` → usar `mobileShortcuts`; senão `localStorage` (mesmas chaves).
   - Adicionar `rawC`/`shortcutC`; `resolve()` recebe lista de `otherTos` para garantir A ≠ B ≠ C.
   - Migração one-shot: no primeiro `available=true`, se `extras.mobile_shortcuts` estiver vazio e houver valores em `localStorage`, fazer upload.

3. `src/config/mobileNav.tsx`
   - Adicionar `defaultShortcutC` no config do Hub (ex.: `{ icon: Wallet, label: "Financeiro", to: "/dashboard" }`).
   - Confirmar que `moreGroups` do Hub cobre módulos ativos + páginas de `Conta`.

4. `src/components/mobile/MobileBottomNav.tsx`
   - Remover slot1 fixo (linhas 44–53).
   - No Hub: Slot 1 = `shortcutC` com `longPressSlot: "c"`.
   - Fora do Hub: Slot 1 = "Hub" (mantém atual).
   - Passar `shortcutC` para o `ShortcutCustomizer` quando `isHubModule`.

5. `ShortcutCustomizer` (mesmo arquivo)
   - Aceitar `currentC?` e renderizar o chip **"1º"** ao lado dos chips "2º"/"4º" apenas no Hub.
   - Ajustar copy: "Toque nos chips 1º, 2º ou 4º…".
   - Regra de disabled: item fixo em qualquer slot desabilita os outros dois.

Backend:
- Nenhuma migração SQL necessária. `dp_user_prefs.extras` já é JSONB com RLS por usuário (o hook `useDpUserPrefs` já grava lá para `favoritos_paginas`).

## Fora de escopo

- Mudar a barra em desktop (`BottomNav.tsx` legado).
- Sincronização em tempo real entre abas (mantém pattern atual do React Query).
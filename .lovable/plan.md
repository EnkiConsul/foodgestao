# Plano — BottomNav "Início Centralizado" + 2 Atalhos Customizáveis

## Objetivo

Substituir o FAB `+` central por um botão **Início** destacado (mesma estética elevada, círculo laranja com notch curvo) e transformar os slots 2 e 4 em **atalhos configuráveis pelo usuário**.

## Layout final

```
┌────────────────────────────────────────────────────┐
│  [Hub]   [Atalho1]   ( 🏠 INÍCIO )   [Atalho2]   [Mais]  │
│                       elevado/laranja                │
└────────────────────────────────────────────────────┘
```

- **Slot 1** — Hub (fixo). Exceção: no módulo Hub vira 3º atalho customizável.
- **Slot 2** — Atalho customizável A (padrão por módulo).
- **Slot 3** — **Início do módulo** com destaque visual (herda estilo do FAB atual: círculo, elevação, notch curvo, `-mt-7`, `ring-4 ring-background`, `shadow` do primary). Clique navega para a home do módulo. Sem long-press, sem modal.
- **Slot 4** — Atalho customizável B (padrão por módulo).
- **Slot 5** — Mais (fixo).

## Padrões por módulo

| Módulo | Slot 1 | Slot 2 (padrão) | Slot 3 (fixo) | Slot 4 (padrão) |
|---|---|---|---|---|
| Financeiro | Hub | Lançamentos | Início → `/dashboard` | Contas |
| DP | Hub | Calendário¹ | Início → `/dp` | Documentos |
| Portal | Hub | Financeiro² | Início → `/dp/meu` | DP² |
| Admin | Hub | Clientes | Início → `/admin/estatisticas` | Assinaturas |
| Hub | Atalho C | Atalho A | Início → `/hub` | Atalho B |
| Conta | Hub | Empresas | Início → `/configuracoes` | Usuários |

¹ Calendário do DP hoje não é um item direto do menu; será mapeado para `/dp/folgas` (visão calendário). Confirmar durante a build se prefere outra rota.
² No Portal, "Financeiro" e "DP" só aparecem se o usuário tiver acesso a esses módulos; caso contrário, cai em Calendário/Solicitações.

## Customização pelo usuário

- **Long-press (550ms) nos slots 2 ou 4** abre o sheet "Personalizar atalho da barra" com a lista de opções do módulo atual (definidas em `MODULE_NAV.shortcutOptions`).
- Também acessível via **"Mais → Personalizar barra"**.
- Persistido em `localStorage` por módulo **e por posição** (`slot-a` e `slot-b`), separados.
- Não é permitido escolher o mesmo atalho nos dois slots — a UI marca o já usado como desabilitado.

## Detalhes técnicos

**Arquivos afetados:**
- `src/config/mobileNav.tsx` — Remover `fab` do tipo `ModuleNav`, renomear `defaultShortcut`/`shortcutOptions` para `defaultShortcutA` + `defaultShortcutB` + `shortcutOptions` (lista única compartilhada). Ajustar cada módulo com os padrões da tabela acima.
- `src/hooks/useModuleShortcut.ts` — Estender para gerenciar dois slots (`slot: "a" | "b"`), chaves separadas no localStorage (`360food:mobile-shortcut:{module}:a` / `:b`), com validação para não permitir mesma rota nos dois.
- `src/components/mobile/MobileBottomNav.tsx` — Remover renderização do slot FAB; renderizar slot 3 como botão "Início" destacado, reutilizando as classes do FAB atual (`h-14 w-14 -mt-7`, `bg-primary`, `ring-4`, `shadow`). Manter `BottomNavShape` (notch curvo continua fazendo sentido para destacar o Início). Passar `slot: "a" | "b"` para o long-press customizer.
- `src/components/mobile/MobileFab.tsx` — **Deletar** (não é mais usado).
- `src/providers/MobileFabProvider.tsx` — **Deletar** (não há mais FAB para páginas registrarem ação).
- `src/components/dp/DpShell.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/layout/AdminLayout.tsx` — Remover import e wrapping do `MobileFabProvider`.
- `src/hooks/useMobileFab.ts` (se existir como export separado) — remover.
- Grep global por `useMobileFab` para remover chamadas em páginas (se houver).

**Visual do slot Início:**
```tsx
<NavLink to={home.to} className="h-14 w-14 -mt-7 rounded-full bg-primary text-primary-foreground
  ring-4 ring-background shadow-[0_10px_24px_-6px_hsl(var(--primary)/0.5)]
  flex items-center justify-center active:scale-90 transition-transform">
  <Home className="h-6 w-6" strokeWidth={2.5} />
</NavLink>
```

**Indicador de aba ativa:** ao estar na home do módulo, o botão central já é destacado por si só — o traço superior do indicador é suprimido nesse caso para não competir visualmente. Nas outras rotas, o traço continua se movendo sobre slots 1/2/4.

## Fora de escopo

- Não muda comportamento de rotas nem cria páginas novas.
- Não mexe em desktop (sidebar continua igual).
- Não altera o sheet "Mais" além do link "Personalizar barra" que já existe.
- Migração de chave antiga do localStorage (`360food:mobile-shortcut:{mod}`) — se existir valor prévio, ele passa a ser ignorado e o padrão do slot A é usado; sem prompt de migração.

## Critério de aceite

- Barra visível em todos os módulos, com "Início" no centro destacado em laranja.
- Long-press nos slots 2/4 abre o customizer certo (A ou B) e a escolha persiste após reload.
- Não é possível deixar os dois slots com a mesma rota.
- Nenhum arquivo do projeto ainda importa `MobileFab`/`MobileFabProvider`/`useMobileFab` (build passa).
- Zero overflow horizontal em 375–393 px.

# Atalho "Ocultar telas em desenvolvimento" dentro de Pessoas 360°

Hoje o controle existe apenas no painel de super admin (`/admin/telas`). O objetivo é ter o mesmo atalho dentro do módulo Pessoas, sem sair para o painel administrativo.

## O que muda

- No rodapé da sidebar de Pessoas (logo abaixo de "Organizar menu") aparece um novo atalho **Telas em desenvolvimento**, visível somente para super admin.
- O atalho abre um diálogo com:
  - Interruptor único "Ocultar telas em desenvolvimento" (liga/desliga tudo de uma vez, igual ao painel).
  - Abas Pessoas 360° / Portal do Colaborador com as telas por grupo, checkbox por tela e botão de ocultar/reexibir o grupo inteiro.
  - Botão Salvar marcações.
- Estado é o mesmo do painel admin (mesma configuração global): mudar em um lugar reflete no outro imediatamente.
- Quando o interruptor está ligado, o próprio menu de Pessoas já esconde as telas marcadas — o atalho continua visível para o super admin poder reexibir.

## Detalhes técnicos

- Extrair o conteúdo de `src/pages/admin/TelasDesenvolvimento.tsx` para um componente reutilizável `src/components/dp/TelasDesenvolvimentoPanel.tsx` (interruptor + abas + grupos + salvar), mantendo `useHiddenScreens` como fonte única.
- `TelasDesenvolvimento.tsx` passa a renderizar o header admin + esse painel (sem duplicação de lógica).
- Novo `src/components/dp/TelasDesenvolvimentoDialog.tsx`: `Dialog` com header fixo, corpo rolável e rodapé fixo, envolvendo o painel.
- `src/components/dp/DpSidebar.tsx`: usar `useSuperAdmin()` e, quando `isSuperAdmin`, renderizar o botão no `SidebarFooter` (ícone `EyeOff`/`Eye` conforme o interruptor) que abre o diálogo. Oculto quando a sidebar está colapsada, mesmo padrão de "Organizar menu".
- Sem mudanças de banco, RLS ou rotas: a escrita já é restrita a super admin pela política existente em `app_hidden_screens`.

# Remover a tela Aprovações de Cadastro

A tela nunca recebe solicitações (não existe porta de entrada e o banco tem zero registros). Vamos removê-la da navegação e do código, sem impacto em outras telas.

## O que muda

- O item "Aprovações" sai do menu Rotina (desktop, menu "Mais" mobile e lista de favoritos).
- A rota `/dp/aprovacoes` deixa de existir; quem tiver o link salvo cai na tela de "não encontrado".
- Notificações passam a apontar para a Central de Notificações em vez de Aprovações quando o tipo não tem tela específica.
- Nada é apagado no banco: a tabela de solicitações permanece intacta (histórico preservado), apenas sem tela.

## Detalhes técnicos

- Excluir `src/pages/dp/DpAprovacoes.tsx` e `src/hooks/useDpAprovacoes.tsx`.
- `src/App.tsx`: remover o import lazy `DpAprovacoes` e a rota `aprovacoes`.
- `src/config/dpNavigation.tsx`: remover o item `/dp/aprovacoes` do grupo `rotina` e o prefixo correspondente em `matchPrefixes`.
- `src/components/dp/favoritablePages.ts`: remover a entrada `/dp/aprovacoes`.
- `src/components/dp/DpNotificacoesBell.tsx` e `src/pages/dp/DpNotificacoes.tsx`: trocar o fallback `"/dp/aprovacoes"` por `"/dp/notificacoes"` (inclusive o link "Ver todas").
- Manter a tabela `dp_cadastro_solicitacoes`, suas políticas RLS e os testes de RLS/tenancy — nenhuma migração será criada.
- Rodar o teste de paridade da navegação (`mobileNav.parity.test.ts`) após as remoções.

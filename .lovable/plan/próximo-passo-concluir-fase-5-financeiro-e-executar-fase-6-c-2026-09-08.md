# Próximo passo — Concluir Fase 5 (Financeiro) e executar Fase 6 (Consistência final)

## O que já está pronto
- Fases 1 a 4 concluídas: inventário, calendários mobile, Pessoas 360/Portal do Gestor e Portal do Colaborador.
- Fase 5 em andamento: cabeçalhos responsivos já padronizados nas telas financeiras, diálogo de criação de conta ajustado, e varredura em 360 px confirmou ausência de rolagem lateral nas 20 rotas verificadas.

## Fase 5 — Pendências restantes (somente aparência e uso no celular)
1. **Grades de 2 colunas que não empilham no celular** nos formulários:
   - `TransactionFormDialog.tsx` — campos de parcelamento (grid-cols-2 sem breakpoint).
   - `AccountFormDialog.tsx` — campos de dados bancários (grid-cols-2 sem breakpoint).
   - `CategoryFormDialog.tsx` — mesma situação.
   - Ajuste: passar a `grid-cols-1 sm:grid-cols-2`.
2. **Reteste** após os ajustes:
   - `bunx tsgo --noEmit`;
   - script Playwright autenticado em 360 px medindo diálogos abertos (sem estouro de largura);
   - varredura das 20 rotas financeiras confirmando `scrollWidth == clientWidth`.

## Fase 6 — Revisão final de consistência
1. Conferência cruzada entre Pessoas 360°, Financeiro, Portal do Gestor e Portal do Colaborador:
   - títulos e descrições com o mesmo padrão visual;
   - botões de ação principal como botão flutuante no celular onde fizer sentido;
   - abas roláveis horizontalmente no celular;
   - diálogos dentro da tela em 360 px.
2. Varredura final automatizada (360 / 768 / 1280 px) nas principais rotas dos quatro módulos.
3. Testes focados + typecheck, e relatório final do que foi padronizado.

## Limites (inalterados)
- Nenhuma alteração de regra de negócio, cálculos, permissões, integrações ou banco de dados.
- Trabalho exclusivamente visual/responsivo.

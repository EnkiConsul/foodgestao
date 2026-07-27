## Situação atual (verificada)

O "pacote mobile" (header compacto, bottom nav com atalhos e FAB, gestos de borda, `/mais`) já está aplicado nos três shells: `AppLayout` (financeiro), `AdminLayout` (backoffice) e `DpShell` (DP) — todos usam `EdgeGestures` + `MobileBottomNav`.

O que **não** foi propagado é o nível de página: os kits mobile (`MobileCardKit`, `CalendarioMobileLista`, tabelas sem rolagem lateral) só foram aplicados em páginas do DP. Fora do DP, 26 arquivos ainda usam tabela larga / `overflow-x-auto` sem alternativa mobile — incluindo Lançamentos, Faturas, Fluxo de Caixa, Relatórios, Contatos, Categorias, Gestão de Usuários e todas as telas do backoffice.

Também há código morto: `src/components/layout/BottomNav.tsx` não é importado em lugar nenhum (substituído por `MobileBottomNav`).

## O que será feito

### 1. Kit mobile compartilhado
Promover o padrão hoje restrito ao DP para uso geral (`src/components/mobile/`):
- `ResponsiveTable`: em ≥md renderiza a tabela atual; em <md renderiza lista de cards com campos primários + botão "Detalhes" abrindo o sheet.
- Reuso de `MobileDetailsSheet` / `MobileActionButton` / `DetailsIconButton` (hoje em `components/dp/MobileCardKit`), re-exportados a partir do kit compartilhado sem quebrar imports do DP.

### 2. Financeiro (prioridade alta — uso diário)
Aplicar o kit em: Lançamentos, Faturas, Fluxo de Caixa, Relatórios, Contatos, Categorias, Cartões de Crédito, Contas Bancárias, Orçamento.
- Linhas viram cards no mobile (valor e data em destaque, categoria/conta como chips).
- Ações (editar, pagar, excluir) como botões ícone de 44px, sem menus escondidos atrás de scroll.
- Filtros longos colapsam em um sheet "Filtros" com contador de filtros ativos.
- Diálogos de formulário: rodapé fixo, botões full-width, `--vvh` para não sumir com o teclado.

### 3. Backoffice /admin
Mesmo tratamento nas tabelas de Clientes, Assinaturas, Faturas, Cupons, Usuários, Auditoria, Webhooks, Cadastros, Módulos, SEO — priorizando leitura (cards) e mantendo ações críticas visíveis.

### 4. DP — fechar lacunas
Revisar as telas mais recentes (Férias, Conformidade, Benefícios, Analytics, Escalas, Mural, Documentos) confirmando: sem rolagem lateral, cards com sheet de detalhes, gráficos do Analytics responsivos e legíveis em 390px.

### 5. Higiene e verificação
- Remover `src/components/layout/BottomNav.tsx` (não utilizado).
- Passar página a página em 390×844 no navegador headless, capturando screenshots antes/depois de cada grupo.
- Rodar typecheck e a suíte de testes (267) ao final.

## Detalhes técnicos

- Breakpoint único: `md` (768px), via `useIsMobile` e classes Tailwind — sem novos breakpoints.
- Nenhuma alteração de query, RPC, RLS ou regra de negócio; o trabalho é apenas de apresentação.
- Tokens semânticos apenas (nada de `bg-white`/`text-black`), preservando a identidade 360°FOOD.
- Alvos de toque mínimos de 44px e `env(safe-area-inset-bottom)` respeitado em rodapés fixos.

## Entrega

Sugiro executar em 3 lotes verificáveis: (1) kit + Financeiro, (2) Backoffice, (3) DP + limpeza. Cada lote com screenshots mobile e testes verdes antes de seguir.

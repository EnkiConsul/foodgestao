## Objetivo

Reorganizar a navegação do DP 360° e do Portal do Colaborador (menu "Mais" mobile + sidebar desktop), sem tocar em banco, RLS, permissões ou lógica de negócio.

## Situação atual (verificada)

- Mobile: `src/config/mobileNav.tsx` (`MODULE_NAV.dp`, `MODULE_NAV.portal_colaborador`) renderizado por `MobileMoreSheet` e pelas rotas `/dp/mais` e `/dp/meu/mais`.
- Desktop: `src/components/dp/DpSidebar.tsx` (`ADMIN_ITEMS`, `PORTAL_ITEMS`).
- `bunx vitest run src/config/mobileNav.parity.test.ts` falha hoje: faltam `/dp/ponto/time`, `/dp/ponto/apuracao`, `/dp/folha` no menu DP e `/dp/meu/contracheque` no portal.
- Fora de qualquer menu: `/dp/folha/provisoes`, `/dp/folha/relatorios`, `/dp/rescisoes`, `/dp/notificacoes`, `/dp/modelos-mensagem`, `/dp/configuracoes`, `/dp/documentos/todos`, `/dp/meu/escala`, `/dp/meu/convocacoes`, `/dp/meu/ponto`.
- `/dp/escalas` é de fato gerador automático (`Gerar proposta`) → rótulo **"Gerar Escala"**.

## Árvore final — DP 360°

```text
DP 360°
├─ Rotina do Dia    Operação do Dia · Escala do Mês · Gerar Escala · Convocações · Calendário Geral
├─ Folgas e Férias  Solicitações · Aprovações · Trocas · Férias · Datas Bloqueadas · Regras de Folgas · Conformidade DSR
├─ Ponto            Espelho de Ponto · Ponto do Time · Apuração para Folha
├─ Folha            Folha de Pagamento · Provisões de Férias e 13º · Rescisões · Relatórios da Folha · Benefícios
├─ Documentos       Contracheques · Adiantamentos · Arquivos de Ponto · Atestados · Registros Disciplinares · ACT/CCT · Histórico Completo · Todos os Documentos
├─ Comunicação      Mensagens · Modelos de Mensagem · Quadro de Avisos · Notificações
└─ Cadastro         Colaboradores · Cargos · Unidades · Sindicatos · Turnos · Configurações de Jornada · Pendências

Itens diretos: Conformidade · Analytics de RH · Configurações do DP
Grupo Conta: inalterado
```

Renomeações apenas visuais: "Folhas de Ponto" → "Arquivos de Ponto"; "Jornadas e escalas" → "Configurações de Jornada"; "Gerador de Escala" → "Gerar Escala". Benefícios deixa de ser item solto (fica só em Folha).

`matchPrefixes` conforme especificado, com atenção: Rotina do Dia usa `/dp/escalas`, `/dp/operacao`, `/dp/convocacoes`, `/dp/folgas/calendario`; Folgas e Férias usa `/dp/folgas/configuracoes` (nunca `/dp/folgas` genérico).

## Árvore final — Portal do Colaborador

```text
Portal
├─ (topo, links diretos)  Mural · Meu Cadastro
├─ Minha Escala (colapsável)  Calendário · Minha Escala · Convocações · Trocas · Solicitações · Histórico
├─ Meu Ponto (colapsável)     Registrar Ponto
└─ Documentos (colapsável)    Meus Documentos · Meus Contracheques · Atestados · Disciplinar · Sindicato
Grupo Conta: inalterado
```

Os três subgrupos passam de `kind: "static"` para `"collapsible"`.

## Correspondência de rota (item ativo)

- `end: true` em todos os links raiz que têm filhos: `/dp/ponto`, `/dp/folha`, `/dp/escalas`, `/dp/documentos`, `/dp/conformidade`, `/dp/meu/*`.
- Extrair um helper `isNavItemActive(pathname, item, allRoutes)` em `src/lib/nav-active.ts` com regra de **maior especificidade**: um item só fica ativo se for a correspondência mais longa entre todos os itens do menu. Usar em `MobileMoreSheet`, nos componentes de grupo do `/dp/mais` e no `DpSidebar`.
- `matchPrefixes` passa a servir apenas para abrir o subgrupo, não para marcar item ativo.

## Fonte compartilhada de navegação

Extrair `src/config/dpNavigation.tsx` como fonte única do DP e do Portal: cada entrada com `label`, `to`, `icon`, `end`, grupo, `matchPrefixes`, `surfaces` (admin/portal) e `shortcut: boolean`. `mobileNav.tsx` e `DpSidebar.tsx` passam a derivar suas listas dessa configuração — elimina o risco de as duas listas divergirem. Se durante a implementação a conversão do `DpSidebar` se mostrar arriscada, mantenho a sidebar com lista própria nesta entrega e registro o débito técnico no plano de saída.

## Atalhos

- `dpShortcuts` ganha: Operação do Dia, Escala do Mês, Ponto do Time, Folha de Pagamento (mantendo os atuais).
- `portalShortcuts` ganha: Minha Escala, Registrar Ponto, Meus Contracheques, Convocações.
- `GLOBAL_SHORTCUT_DEFAULTS` **inalterado** nesta entrega.
- Fallback seguro já existe em `useModuleShortcut.ts` (`resolve` cai no default quando a rota salva não está nas opções) — cobrir com teste para preferência apontando para rota inexistente.

## Testes

Reescrever `src/config/mobileNav.parity.test.ts` com listas explícitas `DP_NAVIGABLE_ROUTES` e `PORTAL_NAVIGABLE_ROUTES` (derivadas de `dpNavigation.tsx`), validando:

1. toda rota navegável aparece no mobile e no desktop;
2. sem duplicatas dentro do mesmo menu;
3. paridade de rótulo/ordem entre desktop e mobile;
4. exatamente um item ativo por rota (casos `/dp/ponto/time`, `/dp/folha/provisoes`, `/dp/escalas/mes`, `/dp/conformidade-dsr`, `/dp/documentos/*`);
5. subgrupo correto abre para cada rota;
6. todo atalho pertence a `shortcutOptions` e os defaults globais continuam resolvendo;
7. nenhum item aponta para rota não registrada em `App.tsx`.

Rodar `bunx vitest run src/config/mobileNav.parity.test.ts` e a suíte completa; conferir visualmente 320/360/390/430px via Playwright (rolagem, abertura de grupos, safe area, item ativo).

## Limites

Sem migrations, RLS, permissões ou alteração de regras de folha/ponto/escala. Rotas internas (`/dp/folha/:id`, `/dp/documentos/:categoria`, redirects legados) ficam fora do menu e serão listadas no relatório final.

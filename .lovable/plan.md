# Auditoria Gestor x Colaborador — Pessoas 360°

Diagnóstico apenas. Nada foi alterado: sem banco, sem migração, sem refatoração.

## 1. O que foi analisado

Casca e navegação: `src/components/dp/DpShell.tsx`, `DpLayout.tsx`, `ColaboradorShell.tsx`, `DpHeader.tsx`, `DpSidebar.tsx`, `DpPage.tsx`, `src/components/mobile/*`, `src/config/dpNavigation.tsx`, `mobileNav.tsx`, `src/lib/nav/*`.
Padrões do gestor: `DpSkeletons.tsx`, `DpErrorState.tsx`, `DpEmptyState`, `DpFilters.tsx`, `DpFilterCard`, `DpTableColumnHeader.tsx`, `DpTableColumnsMenu.tsx`, `DpStatusBadge.tsx`, `DpStatCard.tsx`, `DpFormFooter.tsx`, `DpTabsBar.tsx`, `DpSectionSelect.tsx`, `DpNotificacoesBell.tsx`, `src/components/dp/home/*`, `src/lib/validations.ts`, `src/lib/notifyError.ts`.
Colaborador: as 15 telas de `src/pages/dp/portal/` e seus hooks.
Comparação extra: `src/pages/admin/*` (faturamento/planos), que usa uma casca mais simples.

## 2. Arquitetura do gestor

`DpLayout` → `DpShell variant="admin"` → barra lateral + cabeçalho fixo + barra inferior no celular + gestos de borda + puxar para atualizar. Cabeçalho traz voltar no celular, seletor de empresa, sino de notificações e favoritar tela. Kit próprio para carregar (esqueletos), erro com "Tentar novamente", vazio, filtros com busca e chips, cabeçalho de tabela com ordenar/filtrar/reordenar/redimensionar, selos de situação por tom, rodapé fixo em formulários, abas que viram seletor no celular, atalhos favoritos arrastáveis por usuário, exportação CSV.

## 3. Arquitetura do colaborador

`ColaboradorShell` → mesma casca (`variant="portal"`), mesmos gestos e puxar para atualizar, mesmo cabeçalho, mesmas primitivas de página. Ou seja: a base é compartilhada — a diferença está no acabamento dentro de cada tela.

## 4. Compartilhado hoje

Casca, cabeçalho, barra inferior, menu "Mais", gestos, puxar para atualizar, `DpPage`/`DpPageHeader`/`DpContentCard`/`DpFilterCard`/`DpEmptyState`, `notifyError`, avisos e pendências da tela inicial, atalhos favoritos, painel de documentos do colaborador, pré-visualização de documento.

## 5. Duplicado

`DateField` (seletor de data) copiado em `DpMeuTrocas.tsx` e `DpMeuSolicitacoes.tsx`; grade de 3 indicadores repetida em `DpMeuPonto.tsx` e `DpMeuEscala.tsx`; `ResumoCard` em `DpMeuHome.tsx` refaz o cartão padrão; textos soltos de "Carregando…" e de lista vazia em vez de `Skeleton`/`DpEmptyState` em Sindicato, Histórico, Rotina da loja, Perfil, Férias.

## 6. Matriz Gestor x Colaborador

| Padrão do gestor | Situação no colaborador | Replicar | Adaptar | Prior. | Esforço |
| --- | --- | --- | --- | --- | --- |
| Esqueleto de carregamento (`DpSkeletons`) | PARCIAL — só 4 de 15 telas | SIM | não | P1 | M |
| Erro com "Tentar novamente" (`DpErrorState`) | AUSENTE — só em Férias | SIM | não | P1 | M |
| Confirmação de ação destrutiva (`AlertDialog`) | AUSENTE — zero no portal | SIM | não | P1 | M |
| Sino de notificações | DIVERGENTE — aponta para telas do gestor | NÃO | SIM | P1 | P |
| Vazio padronizado (`DpEmptyState`) | PARCIAL | SIM | não | P2 | P |
| Selos de situação por tom (`DpStatusBadge`) | AUSENTE — selos soltos | SIM | não | P2 | M |
| Filtros com busca e chips (`DpFilters`) | PARCIAL — só Documentos | não | SIM | P2 | M |
| Cabeçalho de tabela configurável | NÃO SE APLICA (portal é lista/cartão) | NÃO | — | — | — |
| Rodapé fixo em formulário (`DpFormFooter`) | AUSENTE — zero "sticky" | SIM | não | P2 | M |
| Abas → seletor no celular (`DpTabsBar`) | AUSENTE — abas roláveis | SIM | não | P2 | P |
| Indicadores (`DpStatCard`) | AUSENTE — cartões à mão | SIM | não | P3 | P |
| Atalhos favoritos arrastáveis | PARIDADE | — | — | — | — |
| Puxar para atualizar / gestos / barra inferior | PARIDADE | — | — | — | — |
| Exportar CSV | AUSENTE | não | SIM (só dados próprios) | P3 | M |
| Seletor de empresa e Hub | Corretamente oculto | NÃO | — | — | — |
| Painéis administrativos (KPIs de equipe) | Não deve existir | NÃO | — | — | — |

## 7. Achados por prioridade

**P0 — nenhum.** Não há caminho em que o colaborador alcance dado de outra pessoa ou empresa; as permissões usam sempre a sessão.

**P1.1 Erro de rede vira "lista vazia".** Gestor: `DpErrorState.tsx` com `onRetry`. Colaborador: só `DpMeuFerias.tsx:102`; Início, Mural, Documentos, Histórico, Rotina, Escala, Calendário, Trocas, Solicitações e Convocações ignoram falha. Impacto: pessoa acredita que não tem documento/férias quando é queda de rede. Esforço médio, risco baixo, sem banco.

**P1.2 Sem esqueleto de carregamento; em Trocas e Solicitações o "carregando" é exibido como "nada aqui"** (`DpMeuTrocas.tsx:330`, `DpMeuSolicitacoes.tsx:432`), e o Início mostra zeros. Reaproveitar `DpSkeletons`.

**P1.3 Ações irreversíveis sem confirmação.** Zero `AlertDialog` no portal: cancelar solicitação (`DpMeuSolicitacoes.tsx:462`), cancelar/recusar troca (`DpMeuTrocas.tsx:388-406`), cancelar envio de documento. Gestor confirma em 35 pontos.

**P1.4 Sino de notificações do gestor dentro do portal.** `DpHeader.tsx:63` sempre renderiza `DpNotificacoesBell`, que conta atestados pendentes de análise e leva a `/dp/notificacoes` e `/dp/folgas?aba=solicitacoes` — telas de gestor. Impacto: contagem sem sentido e beco sem saída para o colaborador. Precisa de variante do sino com rotas do portal; sem banco.

**P1.5 Perfil mostra "Perfil não encontrado" enquanto carrega** (`DpMeuPerfil.tsx:115`).

**P2.1** Vazio/carregando à mão em Sindicato (`:116,118,154,156`), Histórico (`:116`), Rotina (`:110,116`), Início (`:175`) — padronizar em `DpEmptyState`/`Skeleton`.
**P2.2** Situações escritas com `Badge` cru; adotar `DpStatusBadge` para as mesmas cores do gestor.
**P2.3** Cartões misturam `DpContentCard` e `Card` cru na mesma tela (`DpMeuPerfil.tsx:116` vs `:119`); diálogos do Calendário com cantos e sombras próprios (`:956,1112,1156`).
**P2.4** Formulários longos (pedir férias, propor troca, nova solicitação) sem rodapé fixo — no celular o botão confirmar fica no fim da rolagem.
**P2.5** Abas de situação roláveis no celular onde o gestor usa seletor (`DpTabsBar`/`DpSectionSelect`).
**P2.6** Filtros: só Documentos tem busca; Trocas, Solicitações e Convocações não têm busca nem período.
**P2.7** Duplicações do item 5 (DateField, grade de indicadores, ResumoCard).
**P2.8** Acessibilidade: 2 `aria-label` no portal contra 151 no gestor.
**P2.9** Telas órfãs `DpMeuPonto.tsx` e `DpMeuContracheque.tsx` sem entrada no menu — decidir ligar ou remover.

**P3.1** Lista do Início com altura fixa 380px (`DpMeuHome.tsx:174`).
**P3.2** Histórico com "carregar mais" manual; usar paginação do gestor.
**P3.3** Exportar meus dados (documentos, histórico) em CSV, no molde do gestor.
**P3.4** Favoritar tela: existe no cabeçalho compartilhado, mas o portal não expõe atalhos favoritos além do Início.

## 8. Não replicar

Seletor de empresa, Hub de módulos, contagens de equipe, cabeçalho de tabela configurável, exportações da folha, painéis de conformidade, sino com filas de aprovação. Motivo: papel do usuário e menor privilégio.

## 9. Reutilização técnica

REUTILIZAR DIRETAMENTE: `DpErrorState`, `DpSkeletons`, `DpEmptyState`, `DpStatusBadge`, `DpFormFooter`, `DpTabsBar`/`DpSectionSelect`, `DpStatCard`, `AlertDialog`.
REUTILIZAR COM VARIANTE: sino de notificações (rotas e contagens do portal), `DpFilters` (versão enxuta com busca e período).
NÃO REUTILIZAR: `DpTableColumnHeader`, `DpTableColumnsMenu`, `ContextSelector`.
EXTRAIR NOVO COMPARTILHADO: `DateField`, grade de indicadores, cartão de resumo do Início.

## 10. Ganhos rápidos

`DpErrorState` nas 10 telas sem erro; esqueletos em Trocas, Solicitações, Documentos, Início; `AlertDialog` nos 4 pontos destrutivos; sino com rotas do portal; corrigir o "Perfil não encontrado" durante o carregamento.

## 11. Fases sugeridas (aguardando aprovação)

1. Confiabilidade: erro com repetir, esqueletos, correção do Perfil (P1.1, P1.2, P1.5).
2. Segurança de ação e coerência do sino: confirmações e variante do sino (P1.3, P1.4).
3. Consistência visual: vazios, selos de situação, cartões e diálogos (P2.1-P2.3).
4. Formulários e navegação no celular: rodapé fixo, seletor de seções, filtros com busca (P2.4-P2.6).
5. Manutenção e acessibilidade: extrair duplicados, rótulos, decidir telas órfãs, dividir `DpMeuCalendario.tsx` (P2.7-P2.9).
6. Refinamentos: altura da lista, paginação, exportar meus dados, favoritos (P3).

Nenhuma fase exige banco, migração ou mudança de permissão.

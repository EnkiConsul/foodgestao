# Auditoria — Portal do Colaborador: computador x celular

Data: 14/09/2026 · Módulo Pessoas 360° · Somente diagnóstico, nenhuma alteração aplicada.

---

## 1. Arquivos analisados

Casca e navegação
- `src/App.tsx` (rotas, linhas 329-350)
- `src/components/dp/ColaboradorShell.tsx`, `src/components/dp/DpShell.tsx`, `src/components/dp/DpHeader.tsx`, `src/components/dp/DpSidebar.tsx`
- `src/components/mobile/`: `MobileBottomNav.tsx`, `MobileMoreSheet.tsx`, `MoreGroupSection.tsx`, `MoreHeader.tsx`, `BottomNavShape.tsx`, `EdgeGestures.tsx`, `PullToRefresh.tsx`, `ModuleSwitcherChip.tsx`
- `src/pages/Mais.tsx`
- `src/config/dpNavigation.tsx`, `src/config/mobileNav.tsx`, `src/config/mobileNav.parity.test.ts`
- `src/lib/nav/hiddenScreens.ts`, `src/hooks/useHiddenScreens.tsx`, `src/lib/nav/pullToRefreshRoutes.ts`

Telas do colaborador (`src/pages/dp/portal/`)
- `DpMeuHome.tsx`, `DpMeuMural.tsx`, `DpMeuPerfil.tsx`, `DpMeuDocumentos.tsx`, `DpMeuSolicitacoes.tsx`, `DpMeuTrocas.tsx`, `DpMeuFerias.tsx`, `DpMeuCalendario.tsx`, `DpMeuEscala.tsx`, `DpMeuRotinaLoja.tsx`, `DpMinhasConvocacoes.tsx`, `DpMeuSindicato.tsx`, `DpMeuHistorico.tsx`, `DpMeuPonto.tsx`, `DpMeuContracheque.tsx`

Componentes e regras compartilhadas
- `src/components/dp/portal/DocumentoAssinaturaGate.tsx`, `InstalarAppCard.tsx`
- `src/components/dp/home/*` (pendências, avisos, aniversariantes, atalhos), `src/components/dp/ocorrencias/MinhaJornadaAcoesCard.tsx`, `src/components/dp/comunicacao/MuralFeed.tsx`
- `src/lib/dp/*` (`abrirDocumento.ts`, `documentos-requisitos.ts`, `ferias-pedido.ts`, `proxima-folga.ts`, `dataLocal.ts`, `dsr-rules.ts`)

Banco de dados (somente leitura)
- Políticas RLS de `dp_documentos`, `dp_documento_aceites`, `dp_solicitacoes`, `dp_folgas`, `dp_trocas`, `dp_pontos`, `dp_ocorrencias`, `dp_colaboradores`, `dp_notificacoes`, `dp_mensagens`, `dp_escala_itens`, `dp_ferias_*`
- Políticas do cofre de arquivos (`storage.objects`) dos buckets `dp-documentos`, `dp-disciplinar`, `dp-bulk-import`
- Funções `dp_colaborador_of`, `dp_colaborador_ativo_of`, `dp_folga_solicitar`, `dp_folga_limite_dia`, `dp_folgas_janela_efetiva`, `dp_portal_rotina_dia`, `dp_processar_troca_direta`, `is_dp_colaborador`

Configuração do app instalável
- `public/manifest.webmanifest`, `public/sw.js`, `index.html`

---

## 2. Arquitetura encontrada (e correção do enunciado)

**Existe uma única experiência do colaborador, responsiva. Não existem dois produtos.**

Evidências:

| Fato | Evidência |
|---|---|
| Um único conjunto de rotas | `src/App.tsx` 329-350: todas as telas do colaborador são filhas de `/dp/meu`. Não há rota alternativa por dispositivo. |
| Uma única casca | `ColaboradorShell` → `DpShell variant="portal"` (`DpShell.tsx` 14-48), usada em qualquer largura. |
| Um único menu | `DP_PORTAL_NAV` em `src/config/dpNavigation.tsx` 202-262; o menu do celular é **derivado** dele em `src/config/mobileNav.tsx` e a derivação é protegida por teste (`mobileNav.parity.test.ts` 26-56). |
| Nenhuma tela troca conteúdo por dispositivo | Nenhum arquivo de `src/pages/dp/portal/` usa `useIsMobile`; a adaptação é só CSS (`md:`/`sm:`). |
| Não existe app nativo | Não há `capacitor.config.*`, `ios/` ou `android/`. O "app" é o site instalado na tela inicial (`public/manifest.webmanifest`, `InstalarAppCard.tsx`). |

Como o sistema separa os públicos:
- `ColaboradorShell` (linhas 16-52): quem é dono, `owner`/`admin` de empresa ou super admin é enviado para `/hub`; quem não é colaborador vê "Portal indisponível". O vínculo é confirmado no banco pela função `is_dp_colaborador`.
- Gestor usa `DpShell variant="admin"` via `DpLayout` (exige contexto Empresa).
- No celular, a barra inferior escolhe a configuração pelo módulo ativo (`MobileBottomNav.tsx` 27-51); no portal o botão "Hub" só aparece para quem administra a empresa.

**Consequência para a auditoria:** como o código, o banco e as permissões são os mesmos, não pode existir funcionalidade, documento, dado, regra ou permissão presente no computador e ausente no celular. A matriz "existe web / não existe app" resulta em paridade integral por construção. Os achados reais estão em: comportamento em tela estreita, caminho de navegação no celular, estados de carregamento/erro, e resquícios de tela grande.

---

## 3. Inventário das telas do colaborador

| # | Tela | Rota | Arquivo | No computador | No celular |
|---|---|---|---|---|---|
| 1 | Início | `/dp/meu` | `DpMeuHome.tsx` (233 l.) | barra lateral | botão central da barra inferior |
| 2 | Mural | `/dp/meu/mural` | `DpMeuMural.tsx` (18 l.) | item direto | Mais → item direto |
| 3 | Meu Cadastro | `/dp/meu/perfil` | `DpMeuPerfil.tsx` (189 l.) | item direto | Mais / atalho |
| 4 | Meus Documentos | `/dp/meu/documentos` | `DpMeuDocumentos.tsx` (579 l.) | grupo Documentos | atalho A padrão |
| 5 | Atestados | `/dp/meu/atestados` | redireciona para Documentos `?tipo=atestado` | grupo Documentos | Mais |
| 6 | Disciplinar | `/dp/meu/disciplinar` | redireciona para Documentos `?tipo=disciplinar` | grupo Documentos | Mais |
| 7 | Sindicato | `/dp/meu/sindicato` | `DpMeuSindicato.tsx` (186 l.) | grupo Documentos | Mais |
| 8 | Histórico | `/dp/meu/historico` | `DpMeuHistorico.tsx` (148 l.) | grupo Documentos | Mais |
| 9 | Calendário | `/dp/meu/calendario` | `DpMeuCalendario.tsx` (1232 l.) | grupo Minha Escala | Mais / atalho |
| 10 | Minha Escala | `/dp/meu/escala` | `DpMeuEscala.tsx` (273 l.) | grupo Minha Escala | oculta para quem não é convocado |
| 11 | Rotina da Loja | `/dp/meu/rotina` | `DpMeuRotinaLoja.tsx` (152 l.) | grupo Minha Escala | atalho B padrão |
| 12 | Convocações | `/dp/meu/convocacoes` | `DpMinhasConvocacoes.tsx` (384 l.) | grupo Minha Escala | oculta para quem não é convocado |
| 13 | Trocas | `/dp/meu/trocas` | `DpMeuTrocas.tsx` (461 l.) | grupo Minha Escala | Mais |
| 14 | Minhas Férias | `/dp/meu/ferias` | `DpMeuFerias.tsx` (362 l.) | grupo Minha Escala | Mais |
| 15 | Solicitações | `/dp/meu/solicitacoes` | `DpMeuSolicitacoes.tsx` (504 l.) | grupo Minha Escala | Mais |
| 16 | Menu "Mais" | `/dp/meu/mais` | `Mais.tsx` | não usada | quinto botão da barra |
| — | Primeiro acesso / senha | `/primeiro-acesso`, `/esqueci-senha` | `PrimeiroAcesso.tsx`, `EsqueciSenha.tsx` | igual | igual |
| — | Entrar / sair | `/auth`; sair na página Mais e na barra lateral | igual | igual |

Arquivos sem rota ativa (órfãos): `DpMeuPonto.tsx` (204 l.) e `DpMeuContracheque.tsx` (109 l.) — `/dp/meu/ponto` redireciona para o início e `/dp/meu/contracheque` para Documentos (`App.tsx` 345-346), coerente com a decisão de manter folha e ponto desligados.

---

## 4. Matriz computador x celular

| Área | Computador | Celular | Mesma implementação? | Divergência | Prioridade |
|---|---|---|---|---|---|
| Todas as 15 telas | mesmo componente | mesmo componente | Sim | nenhuma no conteúdo | — |
| Regras de negócio | `src/lib/dp/*` + funções do banco | idênticas | Sim | nenhuma | — |
| Permissões e dados | RLS por vínculo | idênticas | Sim | nenhuma | — |
| Documentos (leitura/envio) | mesmo hook e cofre | idênticos | Sim | nenhuma | — |
| Menu principal | barra lateral com grupos | barra inferior + página "Mais" | Derivado da mesma config | intencional | — |
| Voltar | histórico do navegador | botão no cabeçalho + gesto de borda | Diferente | intencional | — |
| Atualizar a tela | recarregar | arrastar para baixo | Só no celular | intencional | — |
| Trocar de empresa | seletor de contexto | ausente no portal | Só no computador | correto: colaborador tem uma empresa | — |
| Instalar como app | oculto | card na Início | Só no celular | intencional | — |
| Barra lateral | visível | recolhida | Intencional | — | — |

Classificação exigida no pedido, aplicada ao que existe: **PARIDADE** em funcionalidade, regra, dado, documento e permissão; **MOBILE ESPECÍFICO** em barra inferior, arrastar para atualizar, gestos de borda, card de instalar; **WEB ESPECÍFICO** em barra lateral, seletor de contexto e atalho "Hub". Nenhum item **AUSENTE** ou **DIVERGENTE** por dispositivo.

---

## 5. Achados

### P0 — nenhum confirmado

Não encontrei caminho pelo qual um colaborador alcance dado de outro colaborador ou de outra empresa. As políticas usam sempre a sessão do banco, nunca identificador enviado pela tela:
- `dp_documentos`: leitura própria por `colaborador_id = dp_colaborador_of(auth.uid())`; envio só com `submetido_por_colaborador = true` e status pendente; exclusão só do próprio envio ainda pendente.
- Cofre `dp-documentos`: `dp_doc_bucket_colab_read` exige que a segunda pasta do caminho seja o próprio `colaborador_id`; a regra de arquivos antigos (`dp_doc_bucket_legacy_read`) confere o vínculo pela linha de `dp_documentos`.
- `dp_solicitacoes`, `dp_folgas`, `dp_pontos`, `dp_documento_aceites`: gravação sempre amarrada a `dp_colaborador_ativo_of(auth.uid())`.
- `dp_ocorrencias`, `dp_trocas`, `dp_mensagens`, `dp_notificacoes`: leitura própria; a visão ampla é restrita a membros da empresa.

### P1

**P1.1 — Duas versões da função de pedir folga, e a antiga continua chamável**
- Banco: existem `dp_folga_solicitar(p_data, p_motivo)` e `dp_folga_solicitar(p_data, p_motivo, p_fora_da_janela)`; ambas com execução liberada para usuário autenticado (a de dois parâmetros também para PUBLIC/anônimo).
- Tela: `DpMeuCalendario.tsx` 719-723 chama sempre a de três parâmetros, que aplica a janela mensal de escolha e o limite do dia.
- Impacto: a versão antiga é um caminho paralelo para a mesma ação, sem a regra da janela; qualquer chamada direta ao banco por um colaborador autenticado a alcança. Não expõe dado de terceiros, mas fura regra de negócio.
- Recomendação: aposentar a versão de dois parâmetros (ou fazê-la apenas repassar para a nova) e retirar a concessão de execução ao público anônimo.

**P1.2 — Função de identificação aceita o usuário vindo da tela**
- Todas as telas chamam `dp_colaborador_of({ _user_id: user.id })` (13 chamadas em `src/pages/dp/portal/`). A função é `SECURITY DEFINER`, recebe qualquer identificador e não compara com a sessão.
- Impacto: um usuário autenticado pode descobrir o identificador interno do cadastro de outra pessoa. Não devolve dado pessoal e as leituras seguintes continuam barradas pelo RLS, mas é informação interna vazando e contraria a regra de não confiar em identificador enviado pela tela.
- Recomendação: passar a resolver pela sessão (`auth.uid()`) dentro da função, ou recusar quando o parâmetro for diferente da sessão; nas telas, chamar sem parâmetro.

**P1.3 — Início do colaborador não tem estado de carregamento**
- `DpMeuHome.tsx`: nenhuma verificação de carregamento (`isLoading`) na página; cards aparecem com zero antes dos dados chegarem — "Mensagens não lidas 0", "Últimos documentos 0", "Próxima folga —" e depois mudam.
- Impacto: no celular, com rede fraca, o colaborador lê informação errada por alguns segundos e pode sair da tela achando que não tem nada.
- Recomendação: esqueleto nos três cards de resumo, no padrão já usado em `DpMeuEscala.tsx` e `DpMinhasConvocacoes.tsx`.

**P1.4 — Janelas de confirmação sem rolagem própria em tela pequena**
- `DpMeuTrocas.tsx` 251, `DpMeuSolicitacoes.tsx` 348, `DpMeuFerias.tsx` 197 usam `DialogContent` só com largura máxima, sem altura máxima nem rolagem.
- Impacto: em aparelho de 360 px de largura, com o teclado aberto, o botão de confirmar pode ficar fora da área visível — foi exatamente o problema já corrigido em `MinhaJornadaAcoesCard.tsx` (`max-h-[85svh] overflow-y-auto`), mas o mesmo tratamento não foi aplicado a estas três.
- Recomendação: aplicar `max-h-[85svh] overflow-y-auto` nas três janelas.

### P2

**P2.1 — Marca do app instalado desalinhada.** `public/manifest.webmanifest` traz nome "Aveto 360" e fundo/tema `#0B0F0D`, com `"orientation": "any"`, enquanto a decisão registrada era travar em retrato. Recomendação: revisar `orientation` e conferir se as cores do manifesto correspondem à identidade atual.
**P2.2 — Início sem hierarquia de urgência no celular.** A ordem atual é saudação, instalar app, pendências, três cards de resumo, ações da jornada, solicitações abertas, avisos, aniversariantes, atalhos. Na primeira tela do celular sobra pouco espaço para o que exige ação. Proposta (sem implementar): 1) pendências que travam (assinatura, documento faltando), 2) o que é hoje (horário previsto, folga, convocação a responder), 3) avisos não lidos, 4) atalhos, 5) aniversariantes e instalar app ao final.
**P2.3 — Filtros por rolagem lateral.** `DpMeuDocumentos.tsx` 375-388, `DpMeuTrocas.tsx` 321, `DpMeuSolicitacoes.tsx` 422, `DpMeuHistorico.tsx` 103 colocam as fichas de filtro em faixa deslizante horizontal; funciona, mas o filtro ativo pode ficar fora da vista ao voltar para a tela. Recomendação: manter, garantindo que o filtro selecionado role para a vista.
**P2.4 — Duas colunas fixas em telas estreitas.** `DpMeuDocumentos.tsx` 335/399, `DpMeuSolicitacoes.tsx` 358, `DpMeuFerias.tsx` 220, `DpMinhasConvocacoes.tsx` 247, `DpMeuPerfil.tsx` 141/154 usam `grid-cols-2` sem alternativa para tela muito estreita; com rótulos longos há risco de texto quebrado em uma letra por linha em aparelhos de 320-360 px.
**P2.5 — Lista de solicitações com altura fixa.** `DpMeuHome.tsx` 174 limita a 380 px com rolagem interna: rolagem dentro de rolagem no celular.
**P2.6 — Colaborador lê as folgas de toda a empresa.** `dp_folgas_read_colaborador` permite ler as folgas de qualquer colega da mesma empresa. É o que sustenta "quem folga hoje" no calendário e nas trocas, mas convém confirmar que expor a agenda de folgas de todos é desejado.
**P2.7 — Arquivos órfãos.** `DpMeuPonto.tsx` e `DpMeuContracheque.tsx` seguem no projeto sem rota; decidir aposentar ou documentar como reserva para quando ponto/folha voltarem.
**P2.8 — Concessão de execução ao público anônimo** em `dp_folga_solicitar` (as duas versões). Inócuo hoje, porque a função exige sessão, mas é limpeza recomendada.
**P2.9 — Sem estado de erro visível em algumas telas.** `DpMeuHome.tsx`, `DpMeuMural.tsx`, `DpMeuRotinaLoja.tsx`, `DpMeuEscala.tsx` e `DpMeuCalendario.tsx` não tratam falha de carregamento; a tela fica vazia sem explicar que houve erro de rede.

---

## 6. Navegação no celular

Estrutura atual (`MobileBottomNav.tsx` 48-80): cinco espaços — [Hub ou atalho] [atalho A] [Início destacado] [atalho B] [Mais]. No portal o primeiro espaço deixa de ser "Hub" para quem não administra e passa a mostrar um terceiro atalho. Padrões do portal: atalho A = Documentos, atalho B = Rotina (`mobileNav.tsx` 233). Atalhos são personalizáveis por toque longo.

Distância até cada função, no celular: Documentos, Rotina e Início em 1 toque; tudo o mais em 2 (Mais → item). O menu "Mais" tem busca (`Mais.tsx` 17, `navSearch.ts`) e favoritos. O cabeçalho oferece "voltar" em telas internas (`DpHeader.tsx` 10-27) calculando o nível pela própria rota, e há gestos de borda e arrastar para atualizar.

Avaliação: a arquitetura é adequada e não é uma cópia do menu do computador. Duas observações:
- O grupo "Minha Escala" reúne sete telas de naturezas diferentes (calendário, escala, rotina, convocações, trocas, férias, solicitações). Para um colaborador fixo, "Solicitações" e "Minhas Férias" são as ações mais frequentes e ficam no fim de um grupo chamado "Minha Escala" — vale reagrupar por intenção ("Meu dia", "Meus pedidos", "Meus documentos"). P2.
- O botão "voltar" deduz o destino cortando a rota (`/dp/meu/documentos` → `/dp/meu`); quando a pessoa chegou por uma pendência (`?doc=`), o retorno perde o contexto de origem. P2.

---

## 7. Auditoria da Início

A Início mobile entrega hoje: saudação com nome próprio, convite para instalar o app, pendências, próxima folga com dia da semana, últimos documentos, mensagens não lidas, ações da jornada, solicitações abertas, avisos/notificações, aniversariantes e atalhos favoritos.

Resposta à pergunta do pedido: **em parte**. O conteúdo certo está presente, mas: (a) tudo aparece com valor zero antes dos dados chegarem (P1.3); (b) o convite para instalar o app disputa o topo com as pendências (P2.2); (c) três cards de resumo ocupam a primeira tela inteira do celular com informação de baixa urgência. Proposta de nova hierarquia registrada em P2.2, sem implementação.

---

## 8. Auditoria de Documentos

O que foi confirmado (`DpMeuDocumentos.tsx`, `useMeusDocumentos`, `documentos-requisitos.ts`, `abrirDocumento.ts`):
- Mesma tela e mesmas regras no computador e no celular; motor de reconhecimento e distribuição não é tocado pela tela.
- Fichas por tipo com contagem, filtro por competência, ordenação por competência, e recorte por perspectiva: ao colaborador só são exigidos os documentos que são dele (contrato e exames da empresa não entram na cobrança).
- Abertura do arquivo pelo caminho próprio do celular (`abrirArquivoDp`), links assinados de curta duração, e foco automático no documento quando se chega por uma pendência (`?doc=`).
- Envio pelo colaborador limitado à própria pasta no cofre, com aprovação pelo setor de pessoal; documentos antigos, gravados no formato de caminho anterior, continuam legíveis pela regra específica de arquivos antigos.
- Estado vazio e mensagens de erro presentes (9 tratamentos de erro, 14 avisos na tela).

Pontos a acompanhar: não existe marca de "documento novo/não lido" na tela do colaborador — a leitura é inferida pelo aceite, quando o documento exige assinatura; e a tela não indica quando um arquivo antigo não tem tipo de arquivo registrado, caso em que a abertura depende do navegador.

---

## 9. Identidade visual

As duas larguras usam a mesma folha de estilos e os mesmos componentes, portanto cor, tipografia, cantos e sombras são iguais por construção (`src/index.css`, tokens `--dp-*`). Divergências pontuais: o manifesto do app instalado usa cores próprias (P2.1) e a Início do colaborador monta o cabeçalho à mão (`DpMeuHome.tsx` 106-121) em vez de usar `DpPageHeader` como as demais telas — pequena inconsistência de cabeçalho entre a Início e o resto do portal.

---

## 10. Duplicação técnica e oportunidades

- Regras de férias, folga, jornada e documentos já estão centralizadas em `src/lib/dp/*` e no banco; não encontrei regra duplicada entre telas.
- Menu do computador e do celular derivam da mesma configuração, com teste de paridade — bom padrão, manter.
- Oportunidade real: um componente único de "janela do portal" que já traga altura máxima e rolagem (resolveria P1.4 de uma vez) e um componente único de "resumo carregando" para os cards da Início.
- `DpMeuCalendario.tsx` tem 1232 linhas e concentra calendário, janela mensal, folgas de domingo, exceções e três janelas de confirmação; candidato natural a separação, sem mudança de comportamento.

---

## 11. Estado técnico atual

- Verificação de tipos: `bunx tsgo --noEmit` → sem erros.
- Testes: `bunx vitest run` → 183 arquivos, 1710 testes aprovados, 50 ignorados (integração e multiempresa, que dependem de credenciais). Nenhuma falha.
- Migrações e políticas relacionadas: consultadas somente em leitura; nada alterado.
- Erros preexistentes: nenhum. Achados desta auditoria: os listados em P1 e P2, todos de comportamento ou higiene, nenhum quebrando a verificação de tipos ou os testes.

Limitação da auditoria: não foi possível abrir o portal em um navegador com sessão de colaborador — a sessão disponível no ambiente é de gestor, e as rotas `/dp/meu/*` redirecionam gestores para a área administrativa; o ambiente também não autoriza criar sessão em nome de outra pessoa. Por isso os achados de tela estreita foram levantados pelo código (larguras, colunas fixas, janelas sem rolagem, estados ausentes) e não por captura de tela. Para fechar essa lacuna, basta você entrar uma vez no portal pela pré-visualização com a conta de uma colaboradora; na mensagem seguinte eu capturo as telas em 360, 390 e 768 px.

---

## 12. Recomendações priorizadas

1. Aposentar a versão antiga de `dp_folga_solicitar` e retirar a execução anônima (P1.1).
2. Resolver o colaborador pela sessão, não pelo identificador enviado pela tela (P1.2).
3. Esqueleto de carregamento nos cards da Início (P1.3).
4. Altura máxima e rolagem nas três janelas de confirmação (P1.4).
5. Revisar o manifesto do app instalado: orientação e cores (P2.1).
6. Reordenar a Início por urgência (P2.2).
7. Ajustes de tela estreita: duas colunas, altura fixa da lista, filtro ativo à vista (P2.3, P2.4, P2.5).
8. Estado de erro visível nas telas que hoje só ficam vazias (P2.9).
9. Decidir sobre os arquivos órfãos de ponto e contracheque (P2.7) e sobre a visibilidade das folgas de colegas (P2.6).
10. Reagrupar o menu do portal por intenção e preservar contexto no "voltar" (seção 6).

## 13. Fases futuras propostas

- **Fase 2 — Segurança e regra (P1.1, P1.2):** uma migração de ajuste das funções e troca das chamadas nas telas, com teste de tentativa de acesso por identificador alheio.
- **Fase 3 — Confiabilidade percebida (P1.3, P1.4, P2.9):** carregamento, erro e janelas roláveis, com verificação em navegador nas larguras de celular.
- **Fase 4 — Início e menu (P2.2, seção 6):** nova hierarquia da Início e reagrupamento do menu do portal.
- **Fase 5 — Acabamento de tela estreita e marca (P2.1, P2.3-P2.5):** ajustes visuais e manifesto.
- **Fase 6 — Manutenção (P2.7, seção 10):** aposentar órfãos, extrair janela padrão do portal e dividir o calendário.

Nada acima foi implementado. Aguardando sua aprovação.

## Origem confirmada

Li `src/components/AppShell.tsx` de `pakere1996/portalcolaborador` (branch `main`). A sidebar real usa 5 grupos: **Início · Cadastro · Folgas · Documentos · Comunicação**. Meu agrupamento anterior ("Compliance / Operação / Folha") foi invenção minha — não existe no repositório.

## Correção da sidebar

### DP 360° (`/dp/*` — modo Admin)

Espelho exato do `adminCadastroNav / adminFolgaNav / adminDocsNav / adminComunicacaoNav` do Pakerê, com as rotas equivalentes já existentes no 360°FOOD:

```text
Início                                → /dp

Cadastro
  Colaboradores                       → /dp/colaboradores
  Cargos                              → /dp/cadastros/cargos
  Unidades                            → /dp/cadastros/unidades
  Sindicatos                          → /dp/cadastros/sindicatos
  Negociações Coletivas               → /dp/sindicatos/negociacoes

Folgas
  Calendário Geral                    → /dp/folgas
  Solicitações                        → /dp/solicitacoes
  Aprovações                          → /dp/aprovacoes
  Trocas                              → /dp/trocas
  Datas Bloqueadas                    → /dp/bloqueios

Documentos
  Contracheques                       → /dp/documentos/contracheque
  Adiantamentos                       → /dp/documentos/adiantamento
  Folhas de Ponto                     → /dp/documentos/ponto
  Atestados                           → /dp/documentos/atestado
  Registros Disciplinares             → /dp/disciplinar
  ACT-CCT / Sindicato                 → /dp/documentos/sindicato
  Histórico Completo                  → /dp/documentos

Comunicação
  Mensagens                           → /dp/mensagens
  Quadro de Avisos                    → /dp/avisos
```

**Folha (`/dp/folha`, `/dp/folha/aprovacoes`)** é funcionalidade nossa que não existe no Pakerê. Duas opções — vou adotar a **opção A** (mais fiel: nenhum grupo extra):

- **A. Não expor no menu** — as rotas continuam funcionando, e o link para "Períodos"/"Aprovações Financeiro" aparece via `/dp/documentos/contracheque` (mesma família). Comportamento igual ao Pakerê.
- B. Se preferir, adicionamos um sexto grupo "Folha" abaixo de Documentos. Confirme na próxima interação se quiser mudar.

### Portal do Colaborador (`/dp/meu/*`)

```text
Início                                → /dp/meu
Perfil                                → /dp/meu/perfil

Folgas
  Calendário / Solicitações           → /dp/meu/solicitacoes
  Trocas                              → /dp/meu/trocas

Documentos
  Meus Documentos                     → /dp/meu/documentos
```

(nosso Portal tem menos páginas que o Pakerê — mantenho só o que existe; Atestados/Sindicato/Disciplinar do colaborador ficam como filtros dentro de `/dp/meu/documentos`, sem inventar rotas.)

## Detalhe visual observado

No Pakerê o item **Início** ativo usa `bg-red-600 text-white font-bold` (pílula sólida vermelha), enquanto os demais ativos usam `bg-primary/15 text-primary` (fundo suave + texto). Vou replicar:

- **Início ativo** → pílula sólida `bg-primary text-primary-foreground` (nosso laranja 360°FOOD ocupa o papel do vermelho do Pakerê).
- **Demais itens ativos** → `bg-primary/10 text-primary font-medium`.
- Grupos colapsáveis com chevron; abrem automaticamente quando a rota atual pertence ao grupo (mesma lógica do `useEffect` deles).

## Arquivos afetados

**Modificados**
- `src/components/dp/DpSidebar.tsx` — reescrever `ADMIN_ITEMS` e `PORTAL_ITEMS` conforme o mapa acima; ajustar estilos ativos (Início sólido, demais suaves).

**Sem alteração**
- Rotas em `App.tsx` (todas as URLs listadas já existem).
- `DpShell.tsx`, `DpHeader.tsx`, `DpHome.tsx`, cards de home, tokens CSS.
- Módulos Financeiro/CRM/RH/Backoffice.

## Validação
- `tsgo --noEmit`.
- Screenshot Playwright de `/dp`, `/dp/folgas`, `/dp/documentos/contracheque` confirmando grupo correto aberto e pílula ativa igual à referência.

## Fora de escopo
- Recriar páginas ACT-CCT / Adiantamentos / Ponto separadas (usamos a rota genérica `/dp/documentos/:categoria` que já existe).
- Renomear rotas.
- Alterar Portal para adicionar sub-páginas que não existem no 360°FOOD.

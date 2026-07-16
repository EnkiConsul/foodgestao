# DP-G08 — Auditoria: Cargos, Unidades, Sindicatos, Negociações e Configurações

Escopo desta fase (leitura + correção de runtime):

- `/dp/cadastros` (`DpCadastrosHub`) — hub de navegação.
- `/dp/cadastros/cargos` (`DpCargos`) — CRUD de cargos.
- `/dp/cadastros/unidades` (`DpUnidades`) — CRUD de unidades + relógio ponto + adiantamento.
- `/dp/cadastros/sindicatos` (`DpSindicatos`) — CRUD patronais/laborais com vínculos.
- `/dp/documentos/sindicato-negociacoes` (`DpSindicatoNegociacoes`) — acordos ACT/CCT.
- Configurações globais (limites, SLA, prazos) — inexistente.

## 1. Mapa de leitura

Tabelas: `dp_cargos`, `dp_unidades`, `dp_sindicatos`, `dp_sindicato_unidades`, `dp_sindicato_cargos`, `dp_sindicato_negociacoes`. Hooks: `useDpCadastros` (`useDpCargos`, `useDpUnidades`, `useDpSindicatos` + mutations). Todas as queries filtram por `company_id` via RLS. Enum `tipo` em `dp_sindicatos`: `patronal | laboral`. **Não existe** tabela/página `dp_departamentos` — cargos servem como agrupamento único.

Fluxo especial em `DpUnidades`: `applyCompanyData` pré-preenche formulário buscando `companies` e cai em `brasilapi.com.br` como fallback quando cidade/UF vêm vazios.

## 2. Divergências

Legenda: 🔴 crítica · 🟠 alta · 🟡 média · 🟢 baixa.

### DpCargos

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G08-01 | Sem busca por nome nem filtro. Em bases > 30 cargos vira scroll infinito. | 🟢 |
| DIV-G08-02 | Tabela não mostra quantos colaboradores usam cada cargo (contador). | 🟢 |

### DpUnidades

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G08-03 | **Botão "Salvar" tem texto duplicado no JSX** (linhas 493-497): renderiza `Salvar` + `Salvando…` colados no mesmo botão. Efeito visual de "SalvarSalvando…" durante submit. | 🔴 |
| DIV-G08-04 | `AlertDialog` de exclusão tem só título, sem `AlertDialogDescription` — usuário não sabe consequência. | 🟠 |
| DIV-G08-05 | Badges de contadores (`bg-blue-100 text-blue-800`, `bg-purple-100 text-purple-800`) hardcoded quebram dark mode. | 🟡 |
| DIV-G08-06 | `applyCompanyData` chama BrasilAPI sem indicador de loading — form parece travado. | 🟡 |
| DIV-G08-07 | Dialog de visualização não tem botão "Editar" (só "Fechar"). | 🟢 |
| DIV-G08-08 | Sem filtro por status (Ativa/Inativa) ou busca por nome/CNPJ. | 🟢 |
| DIV-G08-09 | `dia_adiantamento` limitado a 1-28. Legal (evita fev), mas comum ter dia 5/10/15 fixo — OK, apenas documentar. | 🟢 |

### DpSindicatos

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G08-10 | Após inserir novo sindicato, faz `select` filtrando por `nome`+`tipo` para recuperar id. Se dois sindicatos com mesmo nome existirem, sincroniza vínculos no errado. Deveria usar `.insert().select("id").single()`. | 🟠 |
| DIV-G08-11 | `abrirEdicao` seta `unidadesSel`/`cargosSel` a `[]` e depende de effect assíncrono. Se usuário salvar antes do fetch de `dp_sindicato_vinculos` retornar, **apaga todos os vínculos** (delete + insert vazio). | 🔴 |
| DIV-G08-12 | `AlertDialog` de exclusão sem descrição. | 🟡 |
| DIV-G08-13 | Sem busca/filtro por nome ou CNPJ. | 🟡 |
| DIV-G08-14 | Cards não mostram contador de vínculos (X unidades / Y cargos), obrigando abrir editar para descobrir. | 🟢 |
| DIV-G08-15 | Badge "Patronal" (secondary) vs "Laboral" (default) — cores muito parecidas, difícil distinguir. | 🟢 |

### DpSindicatoNegociacoes

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G08-16 | Botão de "PDF anexado" na tabela (`Button size="icon"` com `FileText`) **não tem `onClick`** — clicar não abre nada. | 🔴 |
| DIV-G08-17 | Não há UI para **anexar** PDF de acordo (apenas ícone estático que sugere existir). Campo `pdf_path` existe mas nunca é escrito pela UI. | 🟠 |
| DIV-G08-18 | Cláusulas: campo Textarea aceita JSON OU linhas; erro silencioso se JSON inválido cai no fallback. Sem editor estruturado. | 🟡 |
| DIV-G08-19 | Filtro só por sindicato — falta filtro por status (Vigente/Expirado). | 🟢 |
| DIV-G08-20 | Cabeçalho tem link "← Documentos" antes do `DpPageHeader` — pattern inconsistente com o resto do módulo (breadcrumbs). | 🟢 |

### DpCadastrosHub

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G08-21 | Não expõe atalho para "Negociações sindicais" (acessível apenas via `/dp/documentos`). | 🟢 |

### Configurações (ausente)

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G08-22 | **Não existe página de Configurações do DP.** Limites de folga por dia (`dp_dia_config`) só podem ser editados dia-a-dia dentro do calendário. Regras de bloqueio e prazos (SLA de pendências) espalhados. Referência sugere consolidar em `/dp/configuracoes`. | 🟠 |

## 3. Correções aplicadas imediatamente (Grupo 1 — bugs de runtime)

- **DIV-G08-03**: Removida duplicação do rótulo "Salvando…/Salvar" no botão.
- **DIV-G08-16 + DIV-G08-17**: Botão de PDF anexado agora abre o arquivo via `createSignedUrl` no bucket `dp-documentos`; adicionado botão de upload/substituir PDF na tabela e no dialog de edição.
- **DIV-G08-11**: Botão "Salvar" fica **desabilitado enquanto `vinculos.isFetching`** é `true` durante edição, impedindo perda silenciosa de vínculos.
- **DIV-G08-05**: Substituídas cores hardcoded por tokens semânticos.

## 4. Correções propostas (aguardando aprovação)

**Grupo 2 — Confirmações e UX de exclusão:**
- DIV-04, DIV-12: adicionar `AlertDialogDescription` nas modais de exclusão de unidade/sindicato.

**Grupo 3 — Robustez de dados:**
- DIV-10: usar `.insert().select("id").single()` para retornar id do novo sindicato.

**Grupo 4 — UX e filtros:**
- DIV-01, DIV-08, DIV-13: adicionar busca + filtros nas listagens.
- DIV-02, DIV-14: contadores de uso (colaboradores por cargo, vínculos por sindicato).
- DIV-07: botão "Editar" no view dialog de unidade.
- DIV-06: skeleton/spinner enquanto BrasilAPI carrega.
- DIV-15: cores mais distintas para patronal/laboral.
- DIV-18: hint mais claro no textarea de cláusulas + validação inline.
- DIV-19: filtro Vigente/Expirado em negociações.
- DIV-20, DIV-21: hub de cadastros ganha link para negociações; remover atalho solto acima do `DpPageHeader`.

**Grupo 5 — Nova página `/dp/configuracoes`:**
- DIV-22: página consolidada com:
  - Limites de folga por dia (tabela editável de `dp_dia_config`).
  - Regras de bloqueio (`dp_bloqueio_regras`).
  - SLA de aprovações (nova config a definir).
  - Prazos de submissão de atestado, adiantamento etc.

## 5. Fora do escopo

- **Departamentos**: schema não prevê `dp_departamentos`. Fica para fase futura se produto pedir separação departamento × cargo.
- Auditoria da RPC `dp_gerar_bloqueios_ano` — já auditada em DP-G07.

---

**Próxima fase sugerida:** DP-G09 — Comunicação (Avisos, Mensagens, Modelos, Notificações) + Documentos.

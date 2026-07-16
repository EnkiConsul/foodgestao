# DP-G06 — Auditoria: Área Admin (Dashboard + Colaboradores)

Escopo desta fase (somente leitura):

- `/dp` → `DpHome` (dashboard admin) + cards em `src/components/dp/home/*`.
- `/dp/colaboradores` → `DpColaboradores` + `ColaboradorFormDialog`.
- Hooks: `useDpPendencias`, `useDpAniversariantes30d`, `useDpColaboradores`.

## 1. Mapa de leitura de dados

| Origem | Colunas usadas | Observações |
|---|---|---|
| `dp_colaboradores` | `id, nome, cpf, matricula, cargo, cargo_id, unidade_id, regime, data_admissao, data_nascimento, data_desligamento, email, whatsapp, ativo, perfil_acesso, folga_fixa_semana, possui_folha_ponto, optante_adiantamento` | OK; joins `dp_cargos(nome)` e `dp_unidades(nome)` |
| `dp_solicitacoes` (Pendências) | `id, tipo, created_at, status, dp_colaboradores(nome)` | OK |
| `dp_trocas` (Pendências) | `id, status, created_at, solicitante:solicitante_id(nome)` | OK (existem 2 FKs para `solicitante_id`? Não — apenas 1; `destino_id` é FK separada). |
| `dp_folha_periodos` | `id, competencia, status, created_at` (filtro `status=aberto`) | OK |
| `dp_sindicato_negociacoes` | `id, sindicato_id, vigencia_fim, dp_sindicatos(nome)` | OK |

Sem uso de RPCs; apenas queries diretas com RLS por `company_id`.

## 2. Divergências

Legenda de gravidade: 🔴 crítica (bug de runtime / dado incorreto) · 🟠 alta · 🟡 média · 🟢 baixa.

### DpHome (dashboard admin)

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G06-01 | Não há **KPI cards** de topo (total colaboradores ativos, aniversariantes hoje, pendências abertas, folhas em aberto). Doc de referência prevê visão executiva. | 🟡 |
| DIV-G06-02 | `PendenciasCard` e `AniversariantesCard` usam `bg-white` hardcoded nos itens internos — violam design tokens (quebra dark mode). Devem ser `bg-card` / token semântico. | 🟡 |
| DIV-G06-03 | `PendenciasCard` classifica atraso apenas por `created_at + N dias` fixos por tipo, sem considerar SLA configurado por empresa (nenhum campo `sla_dias` consultado). Fora do escopo imediato — apenas documentar. | 🟢 |
| DIV-G06-04 | `AniversariantesCard` não separa visualmente aniversariantes de **hoje** dos próximos (só rótulo textual "Hoje 🎉"). Melhoria de UI. | 🟢 |

### DpColaboradores (lista)

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G06-05 | Coluna **Perfil** só distingue `admin` vs. "Colaborador" — o enum `dp_perfil_acesso` inclui `gestor`, que fica invisível (renderizado como "Colaborador"). Filtro por perfil também ausente. | 🟠 |
| DIV-G06-06 | Coluna **Vínculo** exibe `c.regime` (enum bd: `clt/pj/estagio/temporario/mei`) em letras maiúsculas, mas o formulário mostra rótulos "CLT / Sócio / Estagiário / PJ / Autônomo / Temporário". Divergência entre entrada e leitura. | 🟡 |
| DIV-G06-07 | Botão **Resetar acesso** (`KeyRound`) apenas dispara `toast.info("Redefinição de acesso em breve")` — funcionalidade não implementada. | 🟡 |
| DIV-G06-08 | Nenhuma coluna de **data de admissão** nem indicador visual de aniversário/tempo de casa na lista, embora o dado já venha da query. | 🟢 |
| DIV-G06-09 | Filtro por **status** (`ativo/inativo`) presente, mas sem contador em tabs (ex: "Ativos 42 / Inativos 3"). | 🟢 |
| DIV-G06-10 | Alerta de exclusão diz "remove todas as solicitações e documentos vinculados", mas RLS/`on delete` real precisa auditoria — potencial mensagem enganosa. | 🟡 |

### ColaboradorFormDialog

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G06-11 | Dropdown **"Regime de Trabalho"** (Estatutário, PJ, etc.) mantém valor em `form.regime_trabalho`, **mas nunca é enviado no upsert** — apenas `regime` (derivado de `tipo_vinculo`) é persistido. Campo funciona como fantasma: usuário edita e valor é silenciosamente descartado. | 🔴 |
| DIV-G06-12 | Dropdown "Perfil de Acesso" oferece apenas `colaborador` e `admin` — enum suporta `gestor`, mas não aparece. | 🟠 |
| DIV-G06-13 | Bloco "Senha Inicial" exibe apenas texto informativo ("Padrão: 6 últimos dígitos do CPF") — nenhum campo real de senha ou trigger que crie usuário auth. Verificar se há Edge Function equivalente; se não houver, colaboradores criados aqui não conseguem logar no portal. | 🟠 |
| DIV-G06-14 | Não há validação de duplicidade de CPF por empresa antes do submit (uniqueness só no bd — mensagem genérica de erro). | 🟢 |
| DIV-G06-15 | `data_desligamento` só aparece quando `ativo=false`. Ao reativar, valor previamente digitado não é limpo automaticamente no estado local (só é ignorado no payload). | 🟢 |

## 3. Correções propostas (para aplicar após aprovação)

1. **DIV-G06-11 (🔴)** — Remover o dropdown "Regime de Trabalho" duplicado OU mapear seu valor para o enum `regime` (unificando com `tipo_vinculo`). Recomendado: manter **apenas** "Tipo de Vínculo" e derivar `regime` via `VINCULO_TO_REGIME`.
2. **DIV-G06-05 / DIV-G06-12 (🟠)** — Adicionar opção `Gestor` no dropdown de perfil e badge dedicada na lista; adicionar filtro por perfil.
3. **DIV-G06-06 (🟡)** — Exibir `tipo_vinculo` normalizado (via mapa reverso) na coluna Vínculo, ou padronizar rótulos.
4. **DIV-G06-02 (🟡)** — Substituir `bg-white` por `bg-card` nos itens de `PendenciasCard` e `AniversariantesCard`.
5. **DIV-G06-07 (🟡)** — Implementar reset de senha (Edge Function `admin-reset-dp-password`) ou ocultar botão até então.
6. **DIV-G06-01 (🟡)** — Adicionar linha de KPI cards no topo do `DpHome`.
7. **DIV-G06-13 (🟠)** — Definir claramente o fluxo de criação de credencial (Edge Function invite/senha padrão) e refletir na UI.

## 4. Fora do escopo desta fase

- Reset de senha via Edge Function (será tratado em fase de segurança/backend).
- Auditoria de RLS de `dp_colaboradores` DELETE cascade — separada.

## 5. Bugs de runtime corrigidos imediatamente

Nenhum bug que cause exceção foi encontrado nesta fase. **DIV-G06-11** causa perda silenciosa de dado mas requer decisão de UX (unificar dropdowns) — aguardando aprovação.

---

**Próxima fase sugerida:** DP-G07 — Área admin: folgas, escalas, atestados, disciplinar.

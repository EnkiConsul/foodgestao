# Auditoria DP-G03 — Portal do Colaborador (Home + Meu Cadastro)

**Escopo:** rotas `/dp/meu` (index) e `/dp/meu/perfil`.
**Referência:** `pakere1996/portalcolaborador` — telas *Home do colaborador* e *Meu Cadastro*.
**Data:** 2026-07-16
**Modo:** somente leitura — nenhuma alteração aplicada.

Legenda status: **Conforme** · **Parcial** · **Divergente** · **Ausente** · **Extra**
Legenda gravidade: 🔴 crítica · 🟠 alta · 🟡 média · 🟢 baixa

---

## 1. Rotas auditadas

| Rota (atual) | Componente | Rota esperada (doc) | Status |
|---|---|---|---|
| `/dp/meu` | `DpMeuHome` | `/dp/meu` (Home) | Parcial |
| `/dp/meu/perfil` | `DpMeuPerfil` | `/dp/meu/cadastro` (Meu Cadastro) | Divergente (nome) |

> **DIV-G03-01 · 🟡** — A doc de referência nomeia a tela como *Meu Cadastro* e usa o path `/dp/meu/cadastro`. O projeto usa `/dp/meu/perfil` (label "Meu perfil"/"Meus dados"). Impacto: quebra de vínculos externos/WhatsApp e divergência de nomenclatura no menu. Ação sugerida: adicionar alias `/dp/meu/cadastro` → `DpMeuPerfil` e renomear label do menu para **"Meu Cadastro"**, mantendo `/dp/meu/perfil` como redirect durante transição.

---

## 2. `/dp/meu` — Home do Colaborador (`DpMeuHome.tsx`)

### 2.1 Blocos exibidos

| Bloco | Fonte | Status | Observação |
|---|---|---|---|
| Saudação + data + botão "Meu perfil" | `useAuth().email` | Parcial | Usa parte do e-mail como "nome"; a doc pede `dp_colaboradores.nome`. |
| Minhas Solicitações Abertas | `dp_solicitacoes` (status=pendente) | Conforme | OK — filtra por `colaborador_id` via RPC `dp_colaborador_of`. |
| Últimos Avisos | `dp_avisos` (top 4) | Parcial | Não filtra por `dp_avisos_leituras`; sem distinção lido/não-lido; sem escopo por unidade/cargo. |
| Atalhos Favoritos | `AtalhosFavoritos` | Extra em relação à doc | Aceitável — funcionalidade adicional. |
| **Pendências gerais** (atestados a enviar, docs vencidos, folgas a confirmar) | — | Ausente | Doc prevê card consolidado de pendências. Existe `PendenciasCard` no projeto porém **não é usado** no Home. |
| **Aniversariantes do dia/semana** | `AniversariantesCard` existe | Ausente | Componente presente em `components/dp/home/` mas não montado no Home. |
| **Próximas folgas / próximo dia de folga** | `dp_folgas` | Ausente | Doc pede resumo "sua próxima folga em X dias". |
| **Últimos documentos publicados p/ mim** | `dp_documentos` | Ausente | Doc pede lista dos últimos 3 documentos direcionados ao colaborador. |
| **Mensagens não lidas** | `dp_mensagens` | Ausente | Doc pede indicador de mensagens novas. |

### 2.2 Divergências

- **DIV-G03-02 · 🟠** — Saudação usa `user.email.split("@")[0]`. Trocar por `useDpMeuResumo().nome` (já criado na fase G02).
- **DIV-G03-03 · 🟡** — Card *Últimos Avisos* sem estado lido/não-lido: cruzar com `dp_avisos_leituras` (existe tabela) e destacar não lidos.
- **DIV-G03-04 · 🟠** — Componentes `PendenciasCard` e `AniversariantesCard` existem mas não são renderizados no Home. Doc pede ambos como cards principais.
- **DIV-G03-05 · 🟡** — Faltam blocos: *Próxima folga*, *Últimos documentos*, *Mensagens não lidas*.
- **DIV-G03-06 · 🟢** — Botão do header aponta para `/dp/meu/perfil`. Após DIV-G03-01, deve apontar para `/dp/meu/cadastro`.

### 2.3 Tabelas / RLS envolvidas

- `dp_solicitacoes` — 6 policies. Leitura já filtrada por `colaborador_id`.
- `dp_avisos` / `dp_avisos_leituras` — 2 / 1 policies. Falta leitura da tabela de leituras.
- `dp_folgas`, `dp_documentos`, `dp_mensagens` — não consultadas na Home hoje.

---

## 3. `/dp/meu/perfil` — Meu Cadastro (`DpMeuPerfil.tsx`)

### 3.1 Seções vs. doc de referência

| Seção esperada | Campos-alvo | Status atual | Observação |
|---|---|---|---|
| **Identificação** | nome, matrícula, CPF, foto | Parcial | Sem foto/avatar. |
| **Vínculo** | cargo, unidade, regime, admissão, perfil_acesso | Conforme | Todos exibidos (`dp_cargos.nome`, `dp_unidades.nome`). |
| **Pessoal** | data_nascimento, estado civil, gênero, nacionalidade | Parcial | Apenas `data_nascimento`. Colunas de estado civil/gênero não existem em `dp_colaboradores` — requer avaliação de schema (fora do escopo desta fase). |
| **Contato** | telefone, whatsapp, email pessoal, email corporativo | Conforme | Campos presentes e editáveis. |
| **Endereço** | logradouro, nº, complemento, bairro, cidade, UF, CEP | Parcial | Sem campo **complemento** no form (existe naturalmente em `endereco` jsonb). |
| **Documentos pessoais** | RG, CTPS, PIS, título de eleitor, reservista | Ausente | Colunas inexistentes no schema atual; doc pede aba/seção. |
| **Dependentes** | lista `dp_dependentes` | Ausente | Não há tabela `dp_dependentes` no schema (não listada). Requer decisão de escopo. |
| **Dados bancários** | banco, agência, conta, PIX | Ausente | Sem colunas específicas. |
| **Contrato** | data_admissão, jornada, salário, sindicato | Parcial | Só admissão exibida; sindicato existe (`sindicato_id`) mas não é mostrado. |
| **Histórico contratual** | alterações de cargo/salário | Ausente | Fora do escopo do cadastro básico. |

### 3.2 Divergências

- **DIV-G03-07 · 🟡** — Falta seção de **Documentos Pessoais** e **Dados Bancários**. Requer decisão prévia sobre extensão do schema `dp_colaboradores` (ou tabela auxiliar) — deve ser tratada em fase de banco antes da UI.
- **DIV-G03-08 · 🟡** — Falta seção **Dependentes**. Tabela `dp_dependentes` **não existe** no projeto atual. Necessita migration para paridade com a doc.
- **DIV-G03-09 · 🟢** — Adicionar **complemento** ao form de endereço.
- **DIV-G03-10 · 🟢** — Exibir **sindicato** (join `dp_sindicatos.nome` por `sindicato_id`) e **jornada** quando disponíveis.
- **DIV-G03-11 · 🟢** — Adicionar **avatar/foto do colaborador**; requer bucket de storage (fora desta fase).
- **DIV-G03-12 · 🟡** — Header renderiza "Meus dados" (título/ícone `User`). Renomear para **"Meu Cadastro"** para coerência com a doc.
- **DIV-G03-13 · 🟢** — Campo `email` corporativo exibe fallback `email_portal` sem rótulo distinto — separar em dois `Field`s.

### 3.3 Tabelas / RLS envolvidas

- `dp_colaboradores` (29 cols, 2 policies) — leitura por `user_id = auth.uid()` ok, update via `.eq("id", p.id)` depende de policy de UPDATE do próprio colaborador (verificar em fase de RLS).
- `dp_cargos`, `dp_unidades` — join só-leitura, ok.
- `dp_sindicatos` — leitura não usada no perfil (DIV-G03-10).
- `dp_dependentes` — **inexistente** (DIV-G03-08).

---

## 4. Mapa consolidado

| ID | Tela | Divergência | Gravidade | Requer schema? |
|---|---|---|---|---|
| DIV-G03-01 | Rota/menu | `/perfil` vs `/cadastro` | 🟡 | Não |
| DIV-G03-02 | Home | Nome via email | 🟠 | Não |
| DIV-G03-03 | Home | Avisos sem lido/não-lido | 🟡 | Não |
| DIV-G03-04 | Home | PendenciasCard/AniversariantesCard não montados | 🟠 | Não |
| DIV-G03-05 | Home | Falta próx. folga / últimos docs / mensagens | 🟡 | Não |
| DIV-G03-06 | Home | Link "Meu perfil" | 🟢 | Não |
| DIV-G03-07 | Cadastro | Documentos pessoais / bancários | 🟡 | **Sim** |
| DIV-G03-08 | Cadastro | Dependentes ausentes | 🟡 | **Sim** (tabela nova) |
| DIV-G03-09 | Cadastro | Complemento no endereço | 🟢 | Não |
| DIV-G03-10 | Cadastro | Sindicato / jornada | 🟢 | Não |
| DIV-G03-11 | Cadastro | Avatar/foto | 🟢 | Storage |
| DIV-G03-12 | Cadastro | Nome "Meu Cadastro" | 🟡 | Não |
| DIV-G03-13 | Cadastro | Separar email portal/corp | 🟢 | Não |

---

## 5. Recomendação de ordem de correção

1. **Frontend puro** (sem schema): DIV-G03-01, 02, 04, 06, 09, 10, 12, 13 — aplicáveis imediatamente após aprovação.
2. **Frontend + join adicional**: DIV-G03-03 (leitura `dp_avisos_leituras`), DIV-G03-05.
3. **Requer schema / storage** (fase separada de banco): DIV-G03-07, 08, 11.

---

## 6. Próxima fase sugerida

- **DP-G04 — Folgas do Colaborador**: `/dp/meu/calendario`, `/dp/meu/solicitacoes`, `/dp/meu/trocas`, `/dp/meu/historico` contra a doc.

---

Auditoria DP-G03 concluída. Nenhuma alteração foi realizada. Aguardando aprovação para aplicar as correções de frontend (grupo 1 e 2) ou avançar para DP-G04.

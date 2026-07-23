
## Objetivo

Portar todo o módulo de **Documentos** do Pakere original (Admin + Colaborador), incluindo **ACT/CCT** e **Histórico Completo**, e reestruturar a visão do colaborador para que **Meus Documentos** concentre TODOS os documentos dele (contracheque, ponto, adiantamento, atestado, disciplinar, ACT/CCT da unidade e envios próprios) numa única página — exatamente como no Pakere.

## 1. Admin — Importação unificada (Contracheque · Ponto · Adiantamento)

### `src/pages/dp/DpDocumentosPorTipo.tsx`
- Remover o bloco "Importar" antigo (upload individual + `processarPdf`).
- Aba **Importar** passa a renderizar apenas `<BulkImportPanel tipoFixed={tipo} title={cfg.importTitle} />`.
- Aba **Histórico** mantém filtros/preview/edição.

### Remover página avulsa de "Importação em Massa"
- Excluir `src/pages/dp/DpDocImportBulk.tsx`.
- Remover rota `/dp/documentos/importar` de `src/App.tsx` e o card no `DpDocumentosHub.tsx`.

### `src/components/dp/documentos/BulkImportPanel.tsx` — UI Pakere-style
Reescrever conforme prints:
- Cabeçalho do lote: nome do PDF + contadores `N vinculados · N ignorados · N pendentes` + barra de progresso do OCR.
- Navegador `< Anterior · Página X de N · Próximo >`.
- Card por página com badge de status (verde/âmbar/vermelho) e preview do PDF renderizado no cliente (`pdfjs-dist`) com zoom `− 100% +`.
- Metadados: Nome PDF, Período detectado, Unidade detectada (CNPJ), Colaborador identificado + CPF.
- Ações por página: **Vincular manualmente** (select filtrado por unidade + toggle "todos"), **Cadastrar Novo Colaborador**, **Ignorar página**, **Desfazer vínculo**.
- Lista "TODAS AS PÁGINAS" clicável com bullet por status.
- Rodapé: **Aprovar e Salvar Documentos** (bloqueado enquanto houver pendentes), com `AlertDialog` de confirmação.

### Dialog "Cadastrar Novo Colaborador"
- Campos: nome*, CPF*, cargo*, matrícula, unidade*, data admissão, data nascimento, folga fixa semanal, perfil, WhatsApp, senha inicial (default = últimos 6 do CPF).
- Pré-preenche nome/CPF vindos do OCR.
- Validação Zod (`nome ≥ 3`, CPF via `validateCPF`).
- Chama Edge Function `dp-criar-acesso-colaborador`; invalida cache; vincula à página atual e avança para a próxima pendente.

### Motor de match (portado)
- Novo `src/lib/dp/documentos/match.ts` com `normalizeNome`, `findExactMatchInText` e `extractPeriodo` (regex para Contracheque, Ponto e Adiantamento).
- Match adicional por CNPJ da unidade para filtrar o select manual.

### Duplicidade por página
- Antes de habilitar "Aprovar e Salvar", consultar `dp_documentos` por `(company_id, colaborador_id, tipo, referencia_data)`.
- Página duplicada exibe **Substituir** / **Manter antigo**.

## 2. Admin — Atestados

### `src/pages/dp/DpAtestados.tsx`
- Aceitar imagem (JPG/PNG/WEBP) além de PDF.
- Select **Unidade → Colaborador**.
- Campo **Dias de afastamento** com **Data de retorno** calculada abaixo.
- Edição rica: data, dias, status (pendente/aprovado/recusado — recusar via `RecusaDialog`), observações. Preencher `respondido_em`/`respondido_por`.
- Filtro: status, unidade, colaborador, período.

## 3. Admin — Registros Disciplinares

### `src/pages/dp/DpDisciplinar.tsx`
- Aceitar imagem além de PDF.
- Select **Unidade → Colaborador**.
- Filtro por **Tipo** (advertência verbal/escrita, suspensão, elogio, observação).
- Se `tipo === "suspensao"`, `dias` obrigatório.
- Exclusão com `AlertDialog`.

## 4. Admin — ACT/CCT

### `src/pages/dp/DpSindicatoNegociacoes.tsx`
- Paridade com o legado: cadastro/edição com unidade, sindicato patronal, sindicato laboral, ano/mês (ou vigência início/fim), tipo (ACT/CCT), PDF.
- Filtros: unidade, ano, sindicato, tipo.
- Tabela com data, unidade, sindicatos, vigência, PDF (Visualizar/Baixar/Excluir).
- Estado "vencido em ≤30d" já implementado permanece.
- Card do Hub aponta para `/dp/documentos/act-cct`.

## 5. Admin — Histórico Completo

### `src/pages/dp/DpHistoricoCompleto.tsx`
Paridade com `DocumentosHistoricoCompleto` do Pakere:
- Fontes: `dp_documentos` (contracheque/ponto/adiantamento/contrato/férias/outros), `dp_solicitacoes` (atestado), `dp_registros_disciplinares` (disciplinar), `dp_sindicato_negociacoes` (ACT/CCT).
- Colunas: Colaborador (sufixo "(Inativo)"), Tipo, Competência (`MM/AAAA`), Unidade, Status, Data, Ações.
- Filtros: Busca livre, Tipo, Unidade, Colaborador, Mês, Ano, Status.
- Ordenação clicável + paginação.
- Preview via `DocumentPreview` com bucket correto por tipo (`dp-documentos`, `dp-disciplinar`, `dp-sindicato`).
- Download unificado.

## 6. Colaborador — **Meus Documentos** (visão única — como no Pakere)

Reestruturar `src/pages/dp/portal/DpMeuDocumentos.tsx` para concentrar **tudo** do colaborador em uma única página:

### Estrutura
- Header: **Enviar documento** + **Baixar todos (N)**.
- **Abas de tipo** (paridade com Pakere):
  - `Todos`
  - `Contracheques`
  - `Adiantamentos`
  - `Folha de Ponto` (visível apenas se `dp_colaboradores.possui_folha_ponto = true`)
  - `Atestados`
  - `Disciplinar`
  - `ACT/CCT`
  - `Contratos`
  - `Outros`
- **Sub-abas por origem** dentro de cada tipo aplicável:
  - **Recebidos do DP** (padrão)
  - **Meus envios** (só onde faz sentido — Atestado, Outros)
- **Filtros**: Mês, Ano, Status, Busca (título/tipo).
- **Cards Pakere-style**: ícone do tipo, título, competência `MM/AAAA`, status colorido, botões **Visualizar** / **Baixar**; envios pendentes mostram **Cancelar envio** e motivo de recusa.
- **ACT/CCT**: puxar `dp_sindicato_negociacoes` da(s) unidade(s) do colaborador (read-only, apenas download/preview).
- **Disciplinar**: puxar `dp_registros_disciplinares` do colaborador logado (read-only).
- **Atestados**: puxar `dp_solicitacoes` do colaborador (read/write — enviar novo).

### Consolidação de dados
Hook novo `src/hooks/portal/useMeusDocumentos.tsx` que:
- Lê `dp_colaborador_of(user_id)`, unidade(s) associada(s), `possui_folha_ponto`.
- Agrega em memória docs de 4 fontes com um shape `UnifiedDoc` idêntico ao usado no `DpHistoricoCompleto` (`tipo_key`, `tipo_label`, `competencia`, `status_key`, `status_label`, `bucket`, `file_path`, `mime_type`, `titulo`, `origem: "dp" | "meu_envio"`).
- Aplica filtros por tab/sub-tab/mês/ano/status/busca.
- Exposto para `DpMeuDocumentos`, `DpMeuHistorico` e widgets do `DpMeuHome`.

### Rotas legadas do portal
- `/dp/portal/atestados`, `/dp/portal/disciplinar`, `/dp/portal/sindicato` — passam a redirecionar (via `<Navigate replace>`) para `/dp/portal/documentos?tipo=atestado|disciplinar|act_cct` para não quebrar links salvos.
- `/dp/portal/historico` mantém a timeline unificada com filtros por período e tipo (usando o mesmo hook).
- Sidebar do colaborador: manter apenas **Meus documentos** e **Meu histórico**; remover itens duplicados de Atestados/Disciplinar/Sindicato (a página unificada substitui).

## Portado do Pakere (mapa explícito)

| Origem (Pakere) | Destino (360°FOOD) |
| --- | --- |
| `src/lib/pdf-utils.ts` | `src/lib/pdf/render.ts` (novo) |
| `src/lib/documentos.ts::extractPeriodo` | `src/lib/dp/documentos/match.ts` |
| `DocumentImportForm::normalizeNome/findExactMatchInText` | `src/lib/dp/documentos/match.ts` |
| `DocumentImportForm::handleCriarColab` | Dialog em `BulkImportPanel.tsx` |
| `DocumentImportForm::handleDecisaoDuplicata` | Fluxo de duplicidade em `BulkImportPanel.tsx` |
| `DocumentosAdminBase` (atestados/disciplinar) | Ajustes em `DpAtestados.tsx` e `DpDisciplinar.tsx` |
| `DocumentosHistoricoCompleto` | `DpHistoricoCompleto.tsx` |
| `admin/DocumentosSindical` | `DpSindicatoNegociacoes.tsx` |
| `src/pages/Documentos.tsx` (colaborador — página única) | `DpMeuDocumentos.tsx` (visão consolidada) + `useMeusDocumentos.tsx` |

## Fora do escopo
- Sem alterações de schema/buckets — tabelas destino já existem.
- Edge Functions `dp-doc-bulk-ingest` / `dp-doc-bulk-approve` permanecem (já cobrem split, OCR e duplicidade). `dp-criar-acesso-colaborador` só será tocada se algum campo do formulário faltar (verificar antes).

## Resultado esperado
- **Admin**:
  - `/dp/documentos/{contracheque,ponto,adiantamento}` — painel único Pakere-style com bulk + histórico.
  - `/dp/documentos/atestados` e `/dp/disciplinar` — upload PDF+imagem, select unidade→colaborador, retorno calculado, edição rica.
  - `/dp/documentos/act-cct` — cadastro/edição/preview/exclusão paritário.
  - `/dp/documentos/historico` — timeline unificada com filtros.
  - `/dp/documentos/importar` deixa de existir.
- **Colaborador**:
  - `/dp/portal/documentos` — **única página** com abas por tipo (Contracheque, Adiantamento, Ponto*, Atestado, Disciplinar, ACT/CCT, Contrato, Outros) e sub-abas Recebidos do DP / Meus envios, com filtros e ações de download/preview/envio.
  - `/dp/portal/atestados|disciplinar|sindicato` → redirect para a aba correspondente em `/dp/portal/documentos`.
  - `/dp/portal/historico` — timeline pessoal alimentada pelo mesmo hook.

# Central de Documentos: Naturezas Agrupadas, Aprendizado da IA e Filtros de Planilha

## Sobre o atestado enviado pelo colaborador

Sim, continua exigindo aprovação. O atestado enviado pelo portal entra como solicitação (`dp_solicitacoes`, status pendente) e só vira documento disponível depois que o administrador aprova em Atestados. O que muda: quando o **administrador** cadastra o atestado (ou ele chega pela importação em lote), ele já entra aprovado/disponível, sem fila. Nada aqui será alterado — apenas registrado como regra.

## 1. Renomes

- "Importar Documentos" → **Importar** (menu, título da página, breadcrumbs).
- "Histórico de Documentos" → **Histórico**.
- "Registros Disciplinares" → **Disciplinares**.
- Dentro de Atestados e Disciplinares: aba/botão/título "Importar" → **Cadastrar** ("Cadastrar Atestado", "Cadastrar Registro Disciplinar", botão "Cadastrar").

## 2. Naturezas agrupadas (novo catálogo)

O catálogo de naturezas passa a ter grupo + item:

```text
REMUNERAÇÃO   Contracheque Mensal · Adiantamento Salarial · 13º Salário · Férias · PLR · Outros Pagamentos
JORNADA       Espelho de Ponto · Banco de Horas · Ajuste de Jornada
FÉRIAS        Aviso de Férias · Recibo de Férias · Outros (Férias)
ADMISSÃO      Contrato · Ficha de Registro · Termos · Outros (Admissão)
DESLIGAMENTO  Aviso Prévio · TRCT · Demonstrativo Rescisório · Outros (Desligamento)
FISCAIS/ANUAIS Informe de Rendimentos · Outros (Fiscais)
OUTROS        Atestado · Disciplinar · Outros
```

Naturezas novas a criar: PLR, Outros Pagamentos, Banco de Horas, Ajuste de Jornada, Ficha de Registro, Termos, Aviso Prévio, TRCT, Demonstrativo Rescisório, e os "Outros" por grupo. As existentes são reaproveitadas (contracheque, adiantamento, 13º, contracheque de férias, espelho/folha de ponto, aviso e recibo de férias, contrato, informe de rendimentos, atestado, disciplinar).

O mesmo catálogo alimenta importação, histórico, portal do colaborador e as edge functions.

## 3. Barra horizontal de naturezas no Histórico

- Acima da linha de filtros, uma barra com **todos os grupos e itens visíveis** (chips agrupados por grupo, com contador de documentos).
- Clicar no grupo filtra o grupo inteiro; clicar num item filtra só aquele; clique novamente remove. Seleção múltipla permitida.
- Em telas pequenas a barra rola horizontalmente, mantendo os grupos como rótulos.

## 4. Filtros na própria linha do cabeçalho (modo planilha)

- Abaixo do cabeçalho da tabela, uma linha de filtros por coluna: Colaborador (busca), Tipo (seleção), Competência (mês/ano), Unidade (seleção), Status e Aceite.
- Filtros combinam entre si e com a barra de naturezas; contador de resultados e botão "Limpar filtros".
- Os filtros gerais atuais continuam existindo (busca global, ordenação, paginação) — sem perda de recurso.

## 5. Aprendizado da IA na correção manual

- Quando a IA não reconhece a natureza (ou reconhece errado) e o usuário escolhe manualmente na revisão do lote, o sistema grava uma **regra aprendida** da empresa: assinatura do documento (padrão do nome do arquivo + trechos-chave do texto reconhecido, como cabeçalho/título) → natureza escolhida.
- Nas importações seguintes, a ordem de decisão passa a ser: regra aprendida da empresa → detecção da IA → heurística por palavras-chave → "A definir".
- Cada acerto reforça a regra (contador de uso + data do último uso); correções posteriores sobrescrevem a natureza da regra.
- Item da natureza mostra a origem da sugestão ("aprendido", "IA", "palavra-chave") para o gestor confiar ou corrigir.
- As regras aprendidas são por empresa (nunca cruzam clientes) e ficarão listadas/removíveis numa seção discreta da tela Importar.

## Detalhes técnicos

- Migração: novos valores no enum `dp_documento_tipo`; nova tabela `dp_doc_tipo_aprendizado` (`company_id`, `assinatura` normalizada, `tipo`, `origem`, `hits`, `last_used_at`, unique por empresa+assinatura) com GRANTs e RLS por empresa; leitura/escrita pelas edge functions com service role.
- `src/lib/dp/documentoTipos.ts`: adiciona `grupo` e `grupoLabel` a cada definição, novas naturezas, keywords e helper `DP_DOC_GRUPOS` para a barra de chips.
- `supabase/functions/_shared/doc-tipos.ts`: espelha grupos e novas naturezas; `dp-doc-bulk-ingest` consulta as regras aprendidas antes da IA e grava `tipo_origem` no item; `dp-doc-bulk-approve` inalterado além do novo tipo.
- `BulkReviewInline.tsx`: ao alterar a natureza de um item, chama nova função `dp-doc-tipo-aprender` (ou upsert direto via RPC) registrando a assinatura.
- `DpHistoricoCompleto.tsx`: barra de naturezas + linha de filtros por coluna, mantendo ordenação/paginação atuais.
- Renomes em `src/config/dpNavigation.tsx`, `DpDocumentosImportar.tsx`, `DpHistoricoCompleto.tsx`, `DpAtestados.tsx`, `DpDisciplinar.tsx` e no teste de paridade de navegação.

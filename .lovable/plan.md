# Conferência de Documentos por Unidade + Unidade na Importação

## Respostas às suas perguntas

**1. O sistema está validando todas as unidades?** Não. A conferência não parte das unidades — ela parte dos colaboradores e das flags do cadastro. Hoje ela só confere **dois** tipos: Folha de Ponto (quando `possui_folha_ponto` está marcado) e Adiantamento Salarial (quando `optante_adiantamento` está marcado). Contracheque mensal não é conferido.

Na Pakerê:
- Pakerê Garavelo: 9 ativos, 7 com folha de ponto, 4 com adiantamento → gera alerta.
- **Pakerê T-63: 1 ativo (Nordman Lima Brito Júnior), sem folha de ponto e sem adiantamento** → o sistema não espera nenhum documento dele, então a unidade nunca aparece.

**2. A importação em massa identifica a unidade pelo CNPJ?** Sim. A função de importação carrega `dp_unidades.cnpj`, extrai os CNPJs do OCR de cada página e usa a unidade detectada para restringir a busca do colaborador (não cruza colaborador de outra unidade). Porém a unidade detectada **não é gravada** no documento — só o CNPJ detectado — então o histórico e a conferência não usam essa informação.

## O que será feito

### 1. Conferência passa a cobrir todas as unidades
- Incluir **Contracheque mensal** como documento esperado de todo colaborador ativo na competência (independente de flags). É o documento que existe para 100% do quadro, o que faz T-63 e qualquer unidade nova aparecerem.
- Manter Folha de Ponto e Adiantamento condicionados às flags atuais.
- Agrupamento por unidade continua igual (lote completo por unidade / falta parcial com nomes).

### 2. Aviso de unidade sem cadastro suficiente
- Quando uma unidade ativa tem colaboradores ativos mas nenhuma flag marcada, exibir um aviso informativo (não erro): "Pakerê T-63: nenhum colaborador com Folha de Ponto ou Adiantamento marcado no cadastro — verifique as flags", com atalho para a lista de colaboradores filtrada pela unidade.
- Unidades ativas sem nenhum colaborador ativo são ignoradas.

### 3. Unidade detectada gravada na importação
- Gravar a unidade resolvida pelo CNPJ nos itens do lote e propagar para o documento salvo, para o histórico e a conferência usarem a unidade do documento (e não só a unidade do colaborador).
- Na revisão do lote, mostrar a unidade detectada por página e permitir corrigir manualmente.
- Se o CNPJ do PDF não casar com nenhuma unidade cadastrada, sinalizar na revisão ("CNPJ não cadastrado em Unidades") em vez de ignorar em silêncio.

## Detalhes técnicos

- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: adicionar o tipo `contracheque` à lista de tipos esperados e à consulta em `dp_documentos` (`.in("tipo", [...])`); calcular elegíveis de contracheque para todo colaborador ativo dentro da janela de admissão/desligamento; novo bloco de avisos por unidade a partir de `dp_unidades` (ativas) cruzado com a contagem de flags.
- `supabase/functions/dp-doc-bulk-ingest/index.ts`: além de `detected_cnpj`, persistir `unidade_id` resolvido em `dp_bulk_import_items`; se a coluna não existir, migração para adicioná-la (com GRANTs já existentes na tabela).
- `supabase/functions/dp-doc-bulk-approve/index.ts`: repassar a unidade do item ao criar o registro em `dp_documentos` (adicionando `unidade_id` se necessário, via migração).
- `BulkReviewInline.tsx`: exibir/editar a unidade por página e o alerta de CNPJ desconhecido.
- Sem mudança de escopo de RLS: todas as leituras seguem filtradas por `company_id`.

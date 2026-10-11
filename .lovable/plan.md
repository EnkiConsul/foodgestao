# Auditoria somente leitura: custos operacionais do módulo Pessoas (foco Pakerê Pizzaria)

Escopo: só leitura. Nenhum arquivo, migração, dado ou configuração será alterado. Nenhum segredo, token, ID interno ou dado pessoal aparece no relatório: só números agregados por empresa.

## 1. Inventário de provedores (código)
- Varrer `supabase/functions/` e `src/` atrás de chamadas de IA/OCR (`ai-gateway`, `generateText`, modelos citados), WhatsApp (`whatsapp-aveto`, `zapi-webhook`, `dp-send-broadcast`), e-mail (`auth-email-hook`, `handle-email-events`, transacionais), push (`dp-push-dispatch`), Storage (buckets e uploads do DP) e PDF/transcrição (`dp-comprovante-ler`, `dp-ata-transcrever`, `dp-ata-revisar`, `dp-doc-bulk-*`, varredura de ficha).
- Para cada função: o que dispara, com que frequência (agendamentos), modelo de IA usado e se a cobrança é externa (Z-API, provedor de e-mail etc.) ou incluída no Lovable (Cloud, Gateway de IA).

## 2. Uso medido da Pakerê (banco, consultas agregadas)
- Colaboradores ativos/inativos; documentos (`dp_documentos`, `dp_colaborador_documentos`, recibos, atas, pré-admissão) por mês.
- Tamanho em MB dos arquivos no Storage por empresa (metadados, sem baixar conteúdo).
- Notificações, fila de push e envios de WhatsApp (`dp_notificacoes`, `dp_push_fila`, `dp_whatsapp_envios`) por mês.
- Volume de leituras automáticas (comprovantes, fichas, importações em lote) a partir dos registros que já existem.
- Mesmas consultas para uma segunda empresa, em tabela separada, só como referência.

## 3. Uso de execução e custo registrado
- Registro de consumo de créditos do projeto (últimos 30 dias, em janelas), separando requisitado e efetivamente debitado, e o tipo de cobertura.
- Amostra de requisições do Gateway de IA (modelo, tokens), sabendo que é amostra e não total.
- Logs de chamadas das funções (contagem por função em janela definida), saúde do banco e tamanho das tabelas do DP.
- Agendamentos ativos ligados ao DP (lembretes de folga, autoatribuição, push, cobrança) e frequência.

## 4. Cálculos (só onde houver dado)
- Custo marginal por colaborador/mês = consumo atribuível à Pakerê ÷ ativos, marcado como medido, estimado ou não disponível.
- Custo fixo alocado (agendamentos e instância do banco) rateado por empresa ativa, com o critério explícito.
- Projeções de 12/24/36/60 meses: armazenamento acumulado (MB/mês × meses) e processamento recorrente; sem tarifa com fonte, o resultado fica em quantidade, não em R$.

## 5. Entrega (em português)
- Tabela por componente: provedor, modelo, cobrança (externa/incluída), uso da Pakerê, fonte da evidência (arquivo/tabela/consulta/período), confiabilidade.
- Lacunas: quais faturas e telas trazem o valor real em R$ (fatura do Lovable/créditos, painel e fatura do provedor de WhatsApp, do provedor de e-mail, se houver) e o que pedir ao responsável financeiro, sem credenciais.
- Recomendações de preço por colaborador e de retenção de arquivos, sem afirmar exigência legal que não tenha fonte.

## Detalhes técnicos
- Ferramentas: busca no código, `supabase--read_query` só com SELECT agregado (`storage.objects` por prefixo de empresa, contagens por `company_id`), `credits--get_cost_optimization_context`, logs de funções e do Gateway de IA, inventário de agendamentos pela interface própria.
- Sem `EXPLAIN ANALYZE`, sem consultas sem limite, sem baixar arquivos privados.

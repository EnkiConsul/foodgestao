-- 1. Índices para chaves estrangeiras sem índice (gargalo em escala)
CREATE INDEX IF NOT EXISTS idx_chart_account_templates_parent_code ON public.chart_account_templates (parent_code);
CREATE INDEX IF NOT EXISTS idx_dp_adicionais_tempo_servico_cargo ON public.dp_adicionais_tempo_servico (cargo_id);
CREATE INDEX IF NOT EXISTS idx_dp_adicionais_tempo_servico_sindicato ON public.dp_adicionais_tempo_servico (sindicato_id);
CREATE INDEX IF NOT EXISTS idx_dp_adicionais_tempo_servico_unidade ON public.dp_adicionais_tempo_servico (unidade_id);
CREATE INDEX IF NOT EXISTS idx_dp_beneficios_cargo ON public.dp_beneficios (cargo_id);
CREATE INDEX IF NOT EXISTS idx_dp_beneficios_unidade ON public.dp_beneficios (unidade_id);
CREATE INDEX IF NOT EXISTS idx_dp_beneficios_padroes_cargo ON public.dp_beneficios_padroes (cargo_id);
CREATE INDEX IF NOT EXISTS idx_dp_beneficios_padroes_unidade ON public.dp_beneficios_padroes (unidade_id);
CREATE INDEX IF NOT EXISTS idx_dp_bulk_import_items_detected_unidade ON public.dp_bulk_import_items (detected_unidade_id);
CREATE INDEX IF NOT EXISTS idx_dp_cargo_salarios_company ON public.dp_cargo_salarios (company_id);
CREATE INDEX IF NOT EXISTS idx_dp_cargo_salarios_sindicato_patronal ON public.dp_cargo_salarios (sindicato_patronal_id);
CREATE INDEX IF NOT EXISTS idx_dp_cargo_salarios_unidade ON public.dp_cargo_salarios (unidade_id);
CREATE INDEX IF NOT EXISTS idx_dp_colaborador_documentos_dependente ON public.dp_colaborador_documentos (dependente_id);
CREATE INDEX IF NOT EXISTS idx_dp_colaborador_documentos_documento ON public.dp_colaborador_documentos (documento_id);
CREATE INDEX IF NOT EXISTS idx_dp_convocacao_descumprimentos_ocorrencia ON public.dp_convocacao_descumprimentos (ocorrencia_id);
CREATE INDEX IF NOT EXISTS idx_dp_documento_aceites_company ON public.dp_documento_aceites (company_id);
CREATE INDEX IF NOT EXISTS idx_dp_documento_aceites_requisito ON public.dp_documento_aceites (requisito_id);
CREATE INDEX IF NOT EXISTS idx_dp_folha_lancamentos_assiduidade_abono_por ON public.dp_folha_lancamentos (assiduidade_abono_por);
CREATE INDEX IF NOT EXISTS idx_dp_operacao_alertas_dispensas_unidade ON public.dp_operacao_alertas_dispensas (unidade_id);
CREATE INDEX IF NOT EXISTS idx_dp_va_apuracoes_company ON public.dp_va_apuracoes (company_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_accounts_linked_credit_card ON public.pluggy_accounts (linked_credit_card_id);
CREATE INDEX IF NOT EXISTS idx_pluggy_v2_connections_created_by ON public.pluggy_v2_connections (created_by);
CREATE INDEX IF NOT EXISTS idx_pluggy_v2_raw_archive_archived_by ON public.pluggy_v2_transactions_raw_archive (archived_by);
CREATE INDEX IF NOT EXISTS idx_transaction_origin_changes_transaction ON public.transaction_origin_changes (transaction_id);

-- 2. Índices de ordenação/varredura sequencial vistos nos planos
CREATE INDEX IF NOT EXISTS idx_pluggy_v2_raw_created_at ON public.pluggy_v2_transactions_raw (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_card_invoices_company_due ON public.credit_card_invoices (company_id, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_company_due_date ON public.transactions (company_id, due_date);

-- 3. Remove a sobrecarga morta que gerava PGRST203 (ambiguidade de função)
DROP FUNCTION IF EXISTS public.chart_accounts_report(context_type, uuid, date, date, text, uuid[], boolean);
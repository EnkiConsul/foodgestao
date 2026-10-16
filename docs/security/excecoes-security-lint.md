# Exceções revisadas do security-lint (2026-10-16)

Aprovadas pelo cliente após revisão das regras no banco. Nenhuma permissão foi alterada.

| Checagem | Objeto | Motivo |
|---|---|---|
| table_no_policies | signup_whatsapp_otps | Lida/gravada só pelo servidor (service_role); sem policy = fechada a clientes. |
| associative_ownership_fallback | subscription_companies / "Titular e super admin leem cobertura" | Usa `titular_user_id` da conta de cobrança, não o criador da entidade. |
| dp_documentos_storage_member_read_bypass | dp_doc_bucket_read_atestado_proprio | Só o colaborador dono do atestado, na mesma empresa. |
| dp_documentos_storage_member_read_bypass | dp_doc_bucket_read_avisos | Anexo do Mural: membros e colaboradores da empresa, por desenho. |
| dp_documentos_storage_member_read_bypass | dp_doc_bucket_read_sindicato_negociacao | Visibilidade decidida por `dp_negociacao_visivel_colab`. |

Alertas 0028 (access_model_mode, dp_trocas_afastamentos) foram corrigidos revogando acesso de visitantes (migration 0095).
Se a regra de uma exceção mudar, a exceção deve ser revista.

## Linha de base dos avisos (2026-10-16)
`scripts/security-lint.baseline.json` lista os 372 avisos preexistentes (todos `0029_authenticated_security_definer`).
Build normal: críticos e avisos novos bloqueiam; avisos da linha de base aparecem no relatório sem bloquear.
Auditoria: `npm run security-lint:strict` falha em qualquer aviso. Ao corrigir um aviso, remova-o da linha de base; nunca acrescente itens sem revisão.

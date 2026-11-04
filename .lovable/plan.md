# Plano — Itens 2 a 6 (segurança, cobrança e testes)

Item 1 já aplicado. Regras mantidas: flags `access_model_v2`, `checkout_v2` e `emitir_nfse` intocadas; nenhuma cobrança em produção; nada publicado sem aviso.

## 2. Auditoria das funções que gravam dados
Situação levantada hoje: 429 funções SECURITY DEFINER em `public` que gravam; 263 executáveis por `authenticated`; por `anon`, só a do item 1 (já fechada).

- Gerar a tabela completa `função | quem executa | conferência de permissão (linha) | risco` por leitura automática do corpo de cada função (procura `auth.uid()`, `is_super_admin`, `is_company_admin_or_owner`, `tem_permissao`, `_billing_v2_can_manage_sub`, `auth.role() = 'service_role'`), revisada à mão nas que não tiverem nenhuma. Entrega em planilha nos Arquivos + resumo no chat.
- Já confirmadas sem conferência:
  - `dp_expirar_trocas` — expira trocas de **todas** as empresas; qualquer logado pode disparar. Correção: tirar de `authenticated` (fica só para o agendador/servidor); se a tela chamar, criar versão restrita à empresa do usuário.
  - `increment_rule_hit` — aumenta contador de qualquer regra pelo id. Correção: conferir que a regra pertence a empresa/usuário do chamador.
- Demais sem conferência: mesmo padrão do item 1 (REVOKE de PUBLIC/anon, checagem dono/admin/super admin dentro, ator = `auth.uid()` exceto service_role).
- Acesso público por desenho (manter, com justificativa): só as que o fluxo sem login exige — hoje nenhuma das que gravam está com `anon`; os fluxos públicos (convite de pré-admissão, recibo/ata por link, candidato) passam por funções do servidor.

## 3. Permissões padrão
- Antes: listar todas as funções chamadas via `supabase.rpc(...)` no `src/` e cruzar com políticas RLS e gatilhos que dependem delas; garantir `GRANT EXECUTE ... TO authenticated` explícito para cada uma.
- Depois: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` (e `supabase_admin`, se o papel da migração permitir) `IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`.
- Registrar a regra no AGENTS.md: toda função nova chamada pelo app recebe GRANT explícito na própria migração.

## 4. Desfazer upgrade — 1 por ciclo
- Servidor (`desfazerUpgrade`): antes de qualquer chamada ao Asaas, procurar evento `upgrade_desfeito` da assinatura dentro do ciclo atual; se existir → 409 "O upgrade deste ciclo não pode mais ser desfeito."
- Gravação final: se registrar `upgrade_desfeito` falhar após voltar o plano, tentar 1 vez; persistindo, desfazer a volta de plano/valor no Asaas; se não der, gravar `compensacao_pendente` com alerta.
- Tela: "Minha Assinatura" recebe `desfazer_disponivel` da RPC e esconde o botão quando já usado no ciclo.
- Atualizar a regra no `supabase/functions/AGENTS.md` (hoje diz "sem limite").

## 5. Carência vencida
- Rotina diária: `grace` com `grace_ends_at < now()` → `expired`, com evento em `subscription_events` (idempotente).
- Aplicar hoje à assinatura 3ef052c0 (CONSTRUTORA BRASIL REAL S.A — carência até 25/10, ainda `grace`), conferir `company_access_status` = bloqueado e a exibição no Cliente 360.

## 6. Testes (Sandbox, conta teste.billing.contratacao.fixo@aveto360.com)
| teste | esperado |
|---|---|
| Troca de plano por usuário comum chamando a função direto | recusada |
| Desfazer upgrade 1ª vez + conferência no Asaas | ok, cobrança cancelada |
| Desfazer 2ª vez no mesmo ciclo | 409 |
| Troca pela conta [TESTE] | autor preenchido no histórico |
| `dp_preadmissao_encerrar_rotina` por usuário sem vínculo | recusada (já obtido: 42501) |

Entrega final: tabela teste | esperado | obtido | evidência.

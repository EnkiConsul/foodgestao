# Fase 8 — ajuste de precedência: carência de 30 dias acima da situação comercial

## Regra final

Ordem de decisão do acesso ao Portal:

1. Bloqueio explícito de segurança → negado.
2. Empresa suspensa/bloqueada/inativa (segurança) → negado.
3. Vínculo inexistente ou ambíguo → negado.
4. Desligado com prazo vencido (mais de 30 dias) → negado.
5. Desligado dentro dos 30 dias → **somente documentos**, independentemente de assinatura vencida, plano cancelado ou módulo Pessoas desativado.
6. Colaborador ativo → regra atual inalterada: assinatura e módulo continuam valendo (sem plano / sem módulo bloqueiam).

Nenhuma funcionalidade operacional é liberada no modo somente documentos: folga, férias, troca, convocação e novas solicitações seguem negadas no banco.

## Alteração

Somente a rotina central de decisão do banco (`private.dp_portal_decisao`) muda: o cálculo do estado do vínculo (ativo / desligado no prazo / prazo vencido) passa a acontecer **antes** das verificações de assinatura e de módulo, e essas duas verificações passam a ser aplicadas apenas quando o estado é "ativo". A verificação de bloqueio, de empresa inativa e de vínculo continuam antes de tudo, como hoje.

Como as demais rotinas (`dp_pode_agir`, `dp_pode_ver_documentos`, `dp_colaborador_of`, `dp_colaborador_ativo_of`, `is_dp_colaborador*`, `dp_meu_acesso_portal`) já derivam dessa decisão central, a mesma regra passa a valer automaticamente em RPCs, RLS e Edge Functions — sem mudança de frontend.

### Detalhes técnicos

- Migration nova com `CREATE OR REPLACE FUNCTION private.dp_portal_decisao(uuid)`, mesma assinatura, `STABLE SECURITY DEFINER`, `SET search_path = public`, grants inalterados.
- Estados devolvidos permanecem os mesmos (`sem_vinculo`, `bloqueado`, `empresa_inativa`, `sem_plano`, `sem_modulo`, `ativo`, `desligado_no_prazo`, `desligado_expirado`) — nenhum contrato de tipo muda, portanto nada a alterar em `usePortalAcesso`, `PortalProtected` ou navegação.
- Rollback: reaplicar a definição anterior da função (uma única substituição).

## Testes

Novos casos em `supabase/tests/dp_portal_acesso.test.sql`, cobrindo, para um colaborador desligado dentro dos 30 dias:

1. assinatura ativa → somente documentos;
2. assinatura vencida → somente documentos;
3. plano cancelado → somente documentos;
4. módulo Pessoas desativado/suspenso → somente documentos;
5. nos quatro casos, `dp_pode_agir` falso (folga, férias, troca, convocação negadas);
6. bloqueio explícito de acesso → negado;
7. prazo vencido (31 dias) → negado, inclusive documentos;
8. documento de outro colaborador fora do vínculo;
9. regressão do colaborador ativo: assinatura vencida ou módulo desativado continuam bloqueando.

O arquivo roda em transação e termina com rollback, sem alterar dados de produção.

## Validações a executar

Testes, TypeScript, lint, build, `migrations:check`, isolamento multiempresa e security-lint (baseline 63 críticos), com relatório antes/depois.

## Entrega

Resposta final apenas com: regra implementada, arquivos/rotinas alterados, testes executados, resultado das validações e security-lint antes/depois.

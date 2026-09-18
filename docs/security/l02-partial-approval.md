# Aprovação parcial de convocações

## Falha e correção
A aprovação de proposta parcial falhava em dp_convocacoes_compatibilidade_check: a rotina grava parcial, mas a restrição só aceitava integral/incompativel. Além disso, o UPDATE mantinha remuneração e timestamps da jornada original.
Migration 20260918112238_fix_partial_approval_consistency.sql admite parcial e atualiza entrada/saída, intervalo efetivo, carga, início/fim previsto, encerramento operacional e snapshot de remuneração.

O valor unitário vem da oferta original, não do cadastro atual. Horista recebe a quantidade parcial; diária conserva uma diária. Benefícios e demais campos do snapshot permanecem. Oferta sem snapshot válido é recusada com INVALID_REMUNERATION_SNAPSHOT, preservando a proposta pendente; não se inventa valor histórico.

## Validação em homologação
Dados sintéticos, SET LOCAL ROLE, claims e ROLLBACK em utjhzpdbqzajrhnzcher:
- baseline reproduziu a violação da restrição ao aprovar;
- horário 09–17 reduzido para 10–14: 4 horas × 37 = 148, mesmo após cadastro mudar para 99;
- freelancer diarista: diária original 200 preservada, mesmo após cadastro mudar para 500;
- timestamps e encerramento atualizados;
- trabalhador e usuário de outra empresa não aprovam; gestor próprio aprova;
- segunda aprovação retorna INVALID_STATE, sem reaplicar a decisão;
- snapshot ausente impede aprovação e preserva estado pendente.

Scripts manuais: scripts/qa/l02-partial-hourly.sql, l02-partial-daily.sql e l02-partial-missing-snapshot.sql. Evidências locais: homologacao/l02-partial-*. Fixtures revertidas.
Advisor: sem aumento dos avisos (226 funções autenticadas, 4 anônimas); [referência](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Limites e próximo teste
Somente homologação; produção/histórico inalterados. Não cobre jornadas que atravessam meia-noite, reoferta, múltiplas vagas, navegador ou concorrência real.
Concorrência exige duas sessões independentes disputando a mesma ocorrência, com fixtures compartilhadas persistidas temporariamente e limpeza ao fim. Os testes desta etapa são sequenciais, transacionais, e não comprovam ausência de corrida ou deadlock.
A inspeção também encontrou reoferta_parcial sendo gravada pela rotina, embora a restrição origem_oferta atual só aceite convocacao/substituicao; reproduzir esse caminho antes de corrigir.

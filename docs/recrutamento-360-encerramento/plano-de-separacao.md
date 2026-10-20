# Plano de separação (Fase 2 — não iniciada, exige aprovação)

1. Confirmar tag criada e protegida; fazer backup do banco (export das tabelas `recrutamento_*`, fora do GitHub).
2. Bloquear novas gravações no servidor (flag/guard nas RPCs e na Edge Function) antes de retirar telas.
3. Retirar menu, card do Hub e rotas; URLs antigas (`/vagas`, `/carreiras`, `/candidato`) redirecionam para página informativa.
4. Desativar `recrutamento-candidato-auth`.
5. Manter tabelas, contas e consentimentos inicialmente; decidir LGPD (migrar com consentimento, anonimizar ou excluir) e comunicar titulares.
6. Validar Pessoas 360 e Financeiro 360 (login, menus, Pré-Admissão, cobrança).
7. Rollback: reativar flag e reverter commit de retirada visual; dados não são apagados nesta fase.
8. Exclusão definitiva de schema só após migração confirmada e nova aprovação.

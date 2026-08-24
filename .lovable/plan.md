# Registro auditável honesto da M13 e próximos passos

## Decisão aprovada

Não marcar a 3B.1 como encerrada. O estado oficial registrado será:

**3B.1 🟡 — implementação concluída e evidências estáticas aprovadas; validação funcional/concorrente pendente por indisponibilidade de ambiente isolado e credencial executável adequada. 3B.2 ⛔ bloqueada.**

## O que farei agora (somente documentação)

Atualizar `.lovable/plan/convocacoes-fase-3b-baseline-e-execucao.md` com:

1. `## 4. M13 — execução e evidências` dividida em:
   - **4.1 Migration e registro** — arquivo `20260824040005_07644834-ade9-4fe9-a367-e48764c13e53.sql`, aplicação no Cloud, verificação embutida de assinatura única.
   - **4.2 Correções entregues** — os 7 pontos da M13, com referências aos trechos do SQL.
   - **4.3 Evidências verificadas por catálogo** — assinatura única de `dp_convocacao_salvar_config`, `CHECK` de eventos fechado para `config_criada`/`config_atualizada`, grants finais, zero registros nas 7 tabelas de Convocações, ausência de chamador no frontend.
   - **4.4 Baseline final** — `npx vite build`, testes, lint e typecheck, comparados ao baseline pré-3B.
   - **4.5 Validação funcional e concorrente — NÃO EXECUTADA** — lista nominal dos cenários pendentes e o motivo técnico: papel `sandbox_exec` sem `EXECUTE` nas RPCs e ausência de ambiente isolado. Nenhum resultado presumido.
2. `### 3.9 Rollback` — incluir a M13: restaurar M11/M12 das 6 RPCs, helper `dp_convocacao_log_evento`, trigger `dp_conv_evento_deriva`, `CHECK` de eventos e assinatura anterior de `dp_convocacao_salvar_config`.
3. `## 2. Estado das fases` — atualizar para o estado 🟡/⛔ aprovado acima.

## O que NÃO farei

- Nenhuma migration nova.
- Nenhuma alteração de schema, backend, frontend ou `dp_convocacao_sync_escala`.
- Nenhuma gravação no banco produtivo.
- Não iniciar a 3B.2.

## Próximos passos (após este registro)

1. Provisionar ambiente isolado de validação:
   - Preferência: Supabase Branch (ambiente separado com banco e credenciais próprias).
   - Fallback: stack Supabase local via CLI, recriado a partir das migrations do repositório.
2. Criar fixtures sintéticas: duas empresas, usuários owner/admin e, quando necessário, usuários de empresas distintas. Nenhum dado real da produção.
3. Executar a bateria M13 em sessões PostgreSQL independentes e chamadas RPC com JWT authenticated reais. `service_role` apenas para preparar fixtures, consultar resultados e limpar.
4. Se todos passarem, atualizar o mesmo documento com resultados observados, zero resíduos e alterar o estado para 3B.1 ✅ encerrada.
5. Só então liberar a 3B.2.

## Critério de parada

Após atualizar o documento, paro e apresento o registro. Nenhuma ação além disso.

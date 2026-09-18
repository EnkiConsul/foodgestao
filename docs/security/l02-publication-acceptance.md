# L02 — publicação e aceite de convocações

## Falha funcional encontrada
O retorno de dp_convocacao_avaliar_candidato tinha apenas remuneracao. A publicação usa remuneracao_snapshot, regime_snapshot e compatibilidade. Sem horário específico por destinatário, a publicação ocorria sem o registro esperado dos valores de remuneração. Com horário específico, outro auxiliar preenchia a remuneração, mas dependia também do regime devolvido pelo avaliador.

A migration de origem 20260914003240_94ebd83d-3104-4f0a-879d-e3b0c6dc1fc7.sql contém esse retorno reduzido. A falha foi reproduzida na homologação por uma asserção sobre a oferta criada.

## Correção
Migration 20260918111309_preserve_convocacao_remuneracao_snapshot.sql acrescenta ao retorno apto:
- compatibilidade = integral;
- regime_snapshot do colaborador;
- remuneracao_snapshot sem a chave de controle elegivel.

Mantém remuneracao para compatibilidade e todos os cálculos/checagens existentes. Reafirma a restrição de EXECUTE do auxiliar, sem acesso direto para anon/authenticated. Aplica-se às novas avaliações/publicações; não reconstitui ofertas históricas.

## Testes
Executados no banco de homologação utjhzpdbqzajrhnzcher, por SET LOCAL ROLE e claims sintéticas, com ROLLBACK:
1. Cenário com horário específico por destinatário.
2. Cenário com somente horário geral.

Em ambos: publicação estrangeira negada; gestor correto publicou uma oferta; repetição idempotente; remuneração 37 × 8 = 296, regime intermitente e compatibilidade integral gravados; gestor não conseguiu aceitar pelo trabalhador; trabalhador próprio aceitou; repetição idempotente; apenas uma oferta e ocorrência preenchida.

Fixtures usaram datas relativas (32 dias no futuro). Foram revertidas. Catálogo posterior confirma zero colaboradores da fixture e EXECUTE negado a anon/authenticated. Advisor manteve 226 avisos de funções privilegiadas autenticadas e 4 anônimas; não houve aumento. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Scripts manuais versionados:
- scripts/qa/l02-publication-with-override.sql
- scripts/qa/l02-publication-without-override.sql

Evidências locais: homologacao/l02-publication-*.

## Limites
Aplicado somente na homologação. Não testa navegador/HTTP, concorrência real, aceite parcial/tardio, múltiplos candidatos, jornada individual ou todos os regimes. AUD-011 e aprovação global do lançamento permanecem pendentes. Histórico de ofertas sem snapshot requer diagnóstico próprio antes de qualquer reparo; não foi alterado.

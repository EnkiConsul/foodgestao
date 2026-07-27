## Onde estamos

A trilha Ponto → Folha foi entregue até a **Fase 17 (encargos legais: INSS, IRRF e FGTS)**. O roadmap escrito em `.lovable/plan.md` cobria só as 7 fases de Jornadas/Escalas (concluídas); não há um roadmap formal registrado para o que vem depois da folha — as fases abaixo são a proposta para fechar o ciclo.

Já existem no projeto: ponto, apuração, folha, holerite, rubricas avulsas, encargos, férias (`DpFerias`), benefícios (`DpBeneficios`), desligamento (`desligamento.ts`) e analytics.

## Faltam 4 fases

**Fase 18 — Férias e 13º na folha**
Gerar lançamentos de folha a partir das férias já cadastradas (aviso, adicional de 1/3, abono pecuniário) e o 13º em duas parcelas, com encargos próprios e holerite específico.

**Fase 19 — Rescisão (TRCT)**
Cálculo do acerto final ligado ao fluxo de desligamento existente: saldo de salário, aviso prévio, férias vencidas/proporcionais + 1/3, 13º proporcional, multa de FGTS por motivo de saída, com demonstrativo imprimível.

**Fase 20 — Benefícios e descontos recorrentes na folha**
Puxar VT/VA/plano de saúde do cadastro de benefícios para o contracheque automaticamente (com desconto legal de VT limitado a 6%), em vez de rubrica manual.

**Fase 21 — Relatórios legais e fechamento anual**
Resumo mensal por unidade (folha bruta, encargos, FGTS), guia consolidada, informe de rendimentos anual do colaborador e exportações em CSV/PDF.

## Notas técnicas

- Tudo segue o padrão atual: regras puras em `src/lib/dp/*.ts` com testes, hooks para dados, páginas mobile-first.
- Nenhuma tabela nova prevista para as fases 18 e 20 além de campos em `dp_folha_lancamentos`/detalhe JSON; a Fase 19 provavelmente exige uma tabela de rescisão.
- Integração eSocial fica fora do escopo (exige certificado digital e homologação do governo).

Se quiser outra ordem — por exemplo rescisão antes de férias/13º — é só dizer.

# Revisão crítica: adequação EC 141/2026 + simulador de cobertura (somente planejamento)

Nada foi alterado: só leituras de arquivos e buscas. Nenhum dado, banco, flag ou publicação foi tocado.

## 1. Diagnóstico e gaps reais (verificado nesta leitura)

Confirmado:
- Dois geradores: `src/lib/dp/escala-generator.ts` (linhas 136/143: `jaFolgaNaSemana` → `return`, ou seja, no máximo 1 folga gerada por semana) e `src/lib/dp/escala-mes.ts` + `escala-mes-base.ts`.
- `src/lib/dp/clt-alertas.ts:54` `LIMITE_SEMANAL_CLT = 44` fixo no código.
- `src/lib/dp/dsr-rules.ts` já tem `modo_frequencia_domingo`, `periodicidade_domingo` (padrão 3), versão mulher (`_mulher`, padrão 2) e `folgas_fds_por_mes`. Não reestruturar.
- Já existem e são reaproveitáveis: `dsr-consecutivo.ts`, `folga-autoatribuicao.ts`, `folga-isonomia.ts`, `folga-limites.ts`, `folga-janela.ts`, `troca-fds.ts`, `cobertura-utils.ts`, `operacao-extra.ts`, `convocacoes-planejamento.ts`, `convocacao-remuneracao.ts`/`convocacao-freela.ts` (únicas fontes de valor de diária encontradas), `ferias-programacao.ts`, `termos-compensacao.ts`, `termo-troca-gestor.ts`, `jornada-utils.ts`, `compensacao/` (motor puro já usado como simulação sem gravação).
- Rotinas agendadas relevantes: `dp-folga-autoatribuicao-diaria`, `dp-folga-autoatribuicao-lotes`, `dp-expirar-trocas`, `dp_convocacoes_encerramentos`, `dp-disponibilidade-lembretes-dia`; função `dp-sorteio-folgas`.
- Leituras legadas ainda usam `dp_colaboradores.folga_fixa_semana` (1 dia) em migrations de jul/2026.

Não verifiquei nesta rodada (fica para a F0): conteúdo atual de `dp_ferias_validar_programacao` (a busca por `_data_inicio + 1/2` nas migrations não encontrou o padrão; pode estar com outra grafia ou em migration mais recente); contagens do banco (61 configs, 62 ativos, 1 rascunho); políticas de RLS das tabelas de escala; existência de custo hora/encargo por cargo; texto oficial da EC 141 (datas exatas 15/16/17 de dezembro). Não vou supor nada disso.

Gaps reais:
- 2 folgas por semana não são geradas (gerador 1) e o limite de 44h é constante.
- Não existe norma legal versionada (base, vigência, fonte) nem antecipação por unidade.
- Não existe simulador de dimensionamento (quantos fixos, quais dias/turnos/funções, diárias a menos).
- Custo: só diária de convocação; falta custo de fixo (salário + encargos), hora extra e contratação, informados manualmente.
- Uma regra de "sábado + domingo juntos por mês" (Cliente A) não foi encontrada como modo explícito; `folgas_fds_por_mes` precisa ser conferido para saber se representa par sáb+dom.
- Segundo dia variável por semana (Cliente B) não tem modelo de escolha semanal.

## 2. Matriz de fases (ordem recomendada)

| Fase | Conteúdo | Depende de | Esforço |
|---|---|---|---|
| F0 | Inventário: fonte única de folga fixa, contagens, RLS, RPCs de folga/férias, validação jurídica do texto e das datas | — | P |
| F1 | Norma legal versionada (global) + adesão da unidade (manter / antecipar para data futura), auditoria; motor puro de limites | F0 | M |
| F3-MVP | Simulador independente, sem gravação: cobertura mínima manual, horas, custos manuais, comparação antes/depois, cenários salvos | F1 (só regras puras) | M |
| F2 | Folgas semanais 1/2/variável, mensal vs X semanas, sáb+dom juntos, feriado, compensado vs extra; unificar os dois geradores | F1 | G |
| F3-completo | Simulador usando o motor da F2 e convocações reais | F2 | M |
| F4 | Aprovação, rascunho, publicação transacional no servidor, portal (escolhas, reservas, trocas) | F2 | G |
| F5 | Férias pelo repouso efetivo na data de início, termos, extrato para contabilidade (S-2206 fora do app) | F2/F4 | M |
| F6 | Piloto com cenários sintéticos, homologação, observabilidade | todas | M |

Recomendação: sim, simulador MVP antes do motor completo, desde que honesto: heurística gulosa + verificação de regras duras, exibindo "estimativa, não ótimo" (mesmo padrão `buscaCompleta` já usado em `compensacao/`).

## 3. Problemas do plano proposto

- F2 e F3 misturadas com gravação: o simulador não pode chamar RPCs que gravam (`dp_folga_autoatribuir_competencia`). Precisa de motor puro compartilhado.
- Dois geradores divergentes: corrigir só um cria resultado diferente entre simulador, escala e portal.
- Data legal fixa no código repete o erro de `LIMITE_SEMANAL_CLT`.
- "Média de 2 DSR no mês" só com ACT/CCT válido e vigente; o plano anterior tratava como opção livre.
- Férias: não afirmar dobra automática (ADPF 501 derrubou a Súmula 450); só bloquear início que viole o art. 134 §3 usando a escala vigente na data de início, não a config `vigencia_fim IS NULL`.
- Feriado coincidente com folga: tratar como prioridade configurável, sem afirmar que anula o descanso.
- Headcount, FTE e diárias precisam ser métricas separadas; "economia" só aparece quando a cobertura mínima é atendida.
- Art. 8 (categoria diferenciada/alta remuneração): aplicação incerta → só sinalizar, depende de jurídico.

## 4. Recomendações práticas

- Tabela global de norma (`versão`, fonte/URL, vigência início, limites, mínimo de repousos), editável só por super admin; unidade guarda adesão (`norma_minima`, `data_inicio_futura`), nunca anterior à lei e nunca regressiva.
- Motor puro único em `src/lib/dp/` usado por simulador, gerador, portal e servidor (espelho em `supabase/functions/_shared/`, como já se faz no desligamento).
- Cobertura mínima reaproveita `dp_cobertura_minima` (por turno/vigência) estendida com função/setor; custos manuais por cenário.
- Cenários com versão, sem afetar colaboradores; "aplicar" gera só rascunho.
- Mão de obra extra: reaproveitar convocações existentes (não restrito a intermitente).
- Reservas de semana com feriado: controle de concorrência no servidor (bloqueio por linha + idempotência).

## 5. Critérios objetivos de aceite (resumo)

- Cliente A: em todo mês, cada pessoa tem exatamente 1 par sáb+dom consecutivo de folga; folga fixa preservada; nenhuma sequência > limite atravessando meses.
- Cliente B: terça fixa + 1 variável por semana + 1 domingo/mês; política extra vs substituição muda o total de folgas da semana conforme configurado.
- Transição: unidade "manter" muda limites só na data da norma; "antecipar 01/12" muda a partir de 01/12; nova versão da norma nunca devolve unidade antecipada para 44h.
- Simulador: nenhuma gravação (verificado por teste que conta escritas = 0); mostra déficit por dia/turno/função; separa fixos, FTE e diárias; se inviável, explica e diz quantas pessoas/diárias faltam, sem gerar escala ilegal nem 3ª folga silenciosa.
- Mês fronteira: sequência de 7 dias de 28/12 a 03/01 validada corretamente.
- Férias: início bloqueado nos 2 dias antes de repouso efetivo da escala vigente na data.
- Perfis/RLS: usuário de outra empresa não lê cenários; company_id do navegador ignorado no servidor.
- Idempotência: publicar duas vezes gera uma só escala.

## 6. Testes, rollback e riscos

- Por fase: testes unitários do motor puro com empresas sintéticas (A, B, unidade só com mulheres, menor, feriado em semana de domingo); nunca escrever na Pakerê. Banco de testes só em rascunho/rollback.
- Rollback: tudo atrás de adesão por unidade; desligar volta ao comportamento atual sem perder dados.
- Riscos: datas exatas da EC e art. 8 sem validação jurídica; CCTs locais divergentes; dados de custo informados pelo cliente; heurística não ótima.
- Parar ao fim de cada fase para aprovação. Nenhum código nesta conversa.

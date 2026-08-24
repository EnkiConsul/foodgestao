# Convocações — Correção final do Bloco 1

Correções pontuais no que já existe. Sem publicação, sem Bloco 2, sem novas migrations (M1–M14.1 intocadas).

## 1. Abas da tela principal
`DpConvocacoes.tsx`: abas **Próximas, Aguardando, Confirmadas, Realizadas, Histórico, Regras**.
- Próximas: rascunhos e futuras do novo fluxo.
- Aguardando / Confirmadas / Realizadas: estado vazio explicativo enquanto a publicação não existir (Bloco 2).
- Histórico: leitura dos registros legados preservada.

## 2. Multi-cargo no wizard
Trocar o `cargoId` único por seleção múltipla de cargos. Passos: Unidade → Mês/período → Cargos (multi) → Calendário por cargo → Datas → Vagas → Individual/Aberta → Público → Jornada → Revisar. Cada ocorrência guarda seu `cargo_id`; um mesmo dia pode ter vagas diferentes por cargo.

## 3. Rascunho editável
Ação "Continuar edição" nos grupos em rascunho. Abre o wizard carregando grupo + ocorrências existentes, preservando IDs e `updated_at`, salvando via `dp_convocacao_atualizar_grupo` / `dp_convocacao_atualizar_ocorrencia` com `expected_updated_at`. Nunca cria grupo novo ao editar; retry não duplica.

## 4. Competência e período
Competência fixa por convocação, com período (data inicial/final) dentro dela. O calendário só permite selecionar datas do período. Trocar a competência com datas já escolhidas pede confirmação e limpa/revalida as datas incompatíveis.

## 5. Calendário por cargo
Por dia e por cargo: com mínimo cadastrado, "Garçom 3/6 — faltam 3"; sem mínimo, "Garçom — 3 confirmados". Pendentes exibidos separados ("+2 aguardando") e nunca somados aos confirmados. Mínimo lido apenas de `dp_cobertura_minima`; nada de contador persistido.

## 6. Detalhe do dia
Clique em dia/cargo abre drawer somente leitura com cargo, trabalhadores, regime, modalidade, horário, origem, situação, vagas, confirmados e aguardando.

## 7. Prévia de elegibilidade real
Parar de enviar `jornada: null`. A prévia passa a ler dados reais: colaboradores da unidade e cargo, regime convocável, jornada vigente na data (resolvendo a jornada individual da pessoa quando a modalidade for `jornada_individual`), `dp_indisponibilidades`, `dp_convocacoes` em estados bloqueantes, `dp_escala_itens` e remuneração. Continua sendo prévia — a revalidação autoritativa é do Bloco 2.

## 8. Option A sobre todas as ocorrências
Aplicar a função determinística já existente a todas as ocorrências do grupo, ordenadas por data → entrada → saída → cargo_id → id, e mostrar quando alguém foi excluído de uma segunda necessidade por já estar reservado no mesmo dia.

## 9. Virada de dia separada
Em `RascunhoOcorrencia`, duas propriedades distintas: `necessidade_termina_no_dia_seguinte` e `termina_no_dia_seguinte` (horário ofertado). UI com as duas flags nos blocos corretos e `payloadHorario()` enviando cada uma para seu campo.

## 10. Antecedência
Texto corrigido: abaixo da antecedência sempre exige confirmação consciente na publicação; justificativa apenas quando `exige_justificativa_excecao = true`. Aqui só aviso/prévia.

## 11. Aba Regras
Item informativo "Consentimento do substituto — Obrigatório" (sem toggle). Reescrever o texto da folga dominical: "Permitir substituição por trabalhador fixo em folga dominical — somente no fluxo de substituição, com consentimento do trabalhador e reagendamento da folga."

## 12. Valor da diária
Manter como está: campo `valor_diaria` persistido e editável, sem conversão de salário mensal.

## 14. Testes
Novos testes cobrindo: vários cargos no mesmo grupo; edição de rascunho sem duplicação; competência/período; jornada individual resolvida; indisponibilidade na prévia; conflito com escala; Option A entre duas ocorrências do mesmo dia; virada de dia separada; pendente não conta como confirmado.
Depois: `npx vite build`, `npm test`, `npm run lint`, `npm run typecheck:strict` — resultado real reportado.

## Notas técnicas
- Arquivos tocados: `src/pages/dp/DpConvocacoes.tsx`, `src/components/dp/convocacoes/NovaConvocacaoWizard.tsx`, `MonthGridCalendar.tsx`, `ConvocacoesRegrasPanel.tsx`, novo drawer de detalhe do dia, `src/lib/dp/convocacoes-planejamento.ts`, `src/hooks/useDpConvocacaoGrupos.tsx` e testes.
- Sem alteração de schema; apenas uso das RPCs existentes.
- Publicação, ofertas, aceite/recusa, substituições e Portal ficam fora deste bloco.

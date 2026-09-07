# Pessoas 360° — o que foi planejado nos últimos 3 dias e ainda falta fazer

Revisei tudo que foi planejado de 5 a 7 de setembro e comparei com o que já está no ar. A grande maioria já está entregue: folgas (regras, limites, janela mensal, distribuição, remarcar/cancelar), trocas, conformidade de descanso, convocações (revisão, antecedência, aceite parcial, níveis), setores por dia, rotina do dia, férias nas 4 etapas, feriados, mão de obra extra com banco de folguistas, painel de indicadores e a importação da ficha de registro.

Sobraram três frentes.

## 1. Ocorrências — Etapa 2 (em andamento, é a prioridade)

Já feito: banco, regras de acesso e a lógica que classifica o dia (ausente, atrasado, saída antecipada), com testes.

Falta:
- Mostrar na Rotina do Dia os novos grupos "Ausências", "Atrasos" e "Saídas antecipadas", com quem está em cada situação.
- Selo de ocorrência na pessoa dentro do card, levando para a tela de Ocorrências já filtrada por aquela pessoa e dia.
- Montar a cobertura da ausência: escolher folguista, colaborador que não estava escalado ou convocar intermitente, com aprovação e confirmação de que a cobertura realmente aconteceu.
- Botão "Cobrir" e filtro por situação da cobertura na tela de Ocorrências.
- Bloco de ocorrências pendentes na central de pendências e o prazo de alerta configurável no cadastro de pendências.
- Testes das novas regras.

## 2. Ocorrências — Etapa 3

- Atestado gera as ausências automaticamente, uma por dia com jornada prevista, e o atestado entregue depois se liga à falta já registrada sem duplicar.
- Atestado recusado não apaga a ausência: ela é reclassificada.
- Trava contra registro repetido do mesmo fato no mesmo dia.
- Aba "Ocorrências" na ficha do colaborador, agrupada por mês.
- Indicadores do mês: atrasos e minutos, faltas, ausências cobertas e descobertas, coberturas previstas x realizadas, saídas antecipadas, pendências.
- Histórico completo de cada mudança para auditoria.

## 3. Importação da ficha de registro — último item

- Guardar o PDF enviado junto dos documentos do colaborador criado, indicando a página de origem.
- Na revisão, mostrar o trecho lido da ficha quando a leitura tiver baixa confiança.

Os outros três pontos daquele plano (campos de documentos e filiação na ficha, comparação lado a lado antes de atualizar e cargo/turno lidos por ficha) já estão prontos.

## Ordem sugerida

1. Fechar a Etapa 2 de Ocorrências (operação, cobertura e pendências).
2. Anexo da ficha original na importação (rápido).
3. Etapa 3 de Ocorrências (automação do atestado, histórico e indicadores).

## Detalhes técnicos

- Etapa 2: concluir `DpOperacaoPanorama.tsx` (chaves únicas por `colaborador_id + ocorrencia_id + avulso_id`, badges, novas categorias no filtro "Fora da Operação"); expor `ocorrencias` no retorno de `useDpOperacaoPanorama`; novos `src/components/dp/ocorrencias/OcorrenciaCoberturaDialog.tsx` e `SubstitutoPicker.tsx` usando as RPCs já criadas (`dp_ocorrencia_cobertura_criar/_decidir/_confirmar`); mutations e filtro em `useDpOcorrencias.tsx`; bloco em `useDpPendencias.tsx` lendo `dp_pendencias_config.alerta_ocorrencia_horas`; campo do prazo em `DpCadastroPendencias.tsx`; testes em `operacao-panorama.test.ts`.
- Etapa 3: migração com trigger idempotente em `dp_documentos` (tipo atestado), índice parcial de deduplicação, `dp_ocorrencia_eventos` e RPCs `dp_ocorrencias_indicadores`/`dp_ocorrencias_pendencias`; hooks `useDpOcorrenciasIndicadores`; aba em `ColaboradorFichaDialog`.
- Importação: gravar o PDF em storage e criar o registro em `dp_documentos` vinculado ao colaborador com a página de origem; expor `trecho`/confiança por campo em `FichaRevisaoCard`.
- Ao final: `bunx vitest run` e `bunx tsgo --noEmit -p tsconfig.json`.

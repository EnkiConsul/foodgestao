# Módulo de Ocorrências — Etapa 2: operação, coberturas e pendências

Levar as ocorrências para dentro da rotina diária: o gestor vê no painel de operação quem está com problema, consegue montar uma cobertura e encontra na central de pendências tudo que ainda precisa de análise ou tratativa.

## 1. Ocorrências no painel da operação

- O hook `useDpOperacaoPanorama` passa a carregar as ocorrências do mês/empresa (exceto canceladas) junto com os demais dados do panorama.
- `operacao-panorama.ts` ganha um novo input `ocorrencias` e, no `contarDia`, classifica o colaborador afetado como `ausente` ou `atrasado` quando a ocorrência for relevante para aquele dia:
  - Falta confirmada (`falta`) ou prevista (`previsao_falta`) → categoria `ausente`.
  - Atraso confirmado (`atraso`) ou previsto (`previsao_atraso`) → categoria `atrasado`.
  - Saída antecipada confirmada ou prevista → categoria `saida_antecipada`.
  - Atestado / ausência justificada → mantém o fluxo atual de `atestado`.
  - Esquecimento de marcação e divergência de jornada → sinalização leve (badge/ícone), sem mudar a categoria de trabalho.
- Novos cards no painel do dia: "Ausências", "Atrasos" e "Saídas antecipadas", mostrando quantas pessoas e quem.
- Cada pessoa no card ganha um badge de ocorrência quando houver registro para aquele dia, com link para a tela `/dp/ocorrencias` filtrada pelo colaborador/data.

## 2. Coberturas (Mão de Obra Extra)

- Quando uma ocorrência do tipo `falta`/`previsao_falta`/`saida_antecipada`/`previsao_saida_antecipada` for confirmada, o gestor pode marcar uma cobertura direto no card da operação ou na tela de ocorrências.
- A cobertura pode ser:
  - **Folguista avulso** (já existente como pessoa avulsa `folguista`).
  - **Colaborador cadastrado** que não estava escalado para o dia (registro manual de trabalho).
  - **Convocação de intermitente** (quando houver intermitentes aptos na unidade).
- A tabela `dp_ocorrencia_coberturas` (já existe) passa a ser populada: `ocorrencia_id`, `substituto_colaborador_id` ou `mao_de_obra_extra_id`, horário, status (`proposta` → `aprovada` → `realizada` ou `recusada`).
- RLS: gestores da empresa podem inserir/atualizar coberturas; colaboradores só visualizam as próprias.
- Quando a cobertura é aprovada/realizada, a ocorrência é marcada como `coberturaResolvida` no cálculo de cor e o substituto entra no card "Fixos Escalados" do dia (sem duplicar o colaborador original).
- Se a cobertura for recusada ou ainda não preenchida, o card fica em amarelo/vermelho e aparece na central de pendências.

## 3. Central de pendências

- `useDpPendencias` ganha um novo bloco: ocorrências pendentes de análise (`analise_status = 'pendente'`) ou de tratativa (`tratativa_status = 'pendente'`) ou sem cobertura definida (quando `relevancia_operacional = true` e tipo é falta/saída antecipada).
- Cada pendência leva para `/dp/ocorrencias` com filtros pré-aplicados (colaborador, data, tipo).
- Configuração de prazo: novo campo `alerta_ocorrencia_horas` em `dp_pendencias_config` — ocorrências informadas há mais que esse prazo viram pendência atrasada.

## 4. Ajustes na tela de ocorrências

- Novo filtro "Com cobertura pendente".
- Card da ocorrência ganha botão "Cobrir" quando aplicável, abrindo diálogo de escolha do substituto.
- Diálogo de confirmação de ocorrência passa a oferecer "Já tem cobertura?" (sim/não) para faltas/saídas antecipadas.

## 5. Notificações leves

- Quando uma ocorrência relevante é registrada, `dp_notificacoes` recebe um aviso para gestores da unidade/setor.
- Quando uma cobertura é aprovada ou recusada, o criador da ocorrência (colaborador ou gestor) é notificado.

## Detalhes técnicos

- Banco:
  - `dp_ocorrencias`: nenhuma coluna nova.
  - `dp_ocorrencia_coberturas`: adicionar policies `INSERT`/`UPDATE`/`DELETE` para `authenticated` via `is_company_member` (hoje só existe SELECT).
  - `dp_pendencias_config`: adicionar coluna `alerta_ocorrencia_horas smallint default 24`.
- Edge functions / RPCs:
  - Nova `dp_ocorrencia_cobertura_criar` (criar proposta).
  - Nova `dp_ocorrencia_cobertura_decidir` (aprovar/recusar).
  - Nova `dp_ocorrencia_cobertura_confirmar` (marcar como realizada).
  - Ajuste em `dp_ocorrencia_confirmar` para atualizar `relevancia_operacional` e, quando houver cobertura vinculada, propagar o status.
- Frontend:
  - `useDpOperacaoPanorama.tsx`: carregar `dp_ocorrencias` e passar para `contarDia`.
  - `operacao-panorama.ts`: tipos `OcorrenciaPanorama`, novas categorias e lógica de prioridade.
  - `DpOperacaoPanorama.tsx`: novos cards e badge de ocorrência nas pessoas.
  - Novos componentes: `OcorrenciaCoberturaDialog.tsx`, `SubstitutoPicker.tsx`.
  - `useDpPendencias.tsx`: bloco de ocorrências pendentes.
- Testes:
  - Testes unitários em `operacao-panorama.test.ts` para prioridade de ocorrências e coberturas.
  - Testes do hook `useDpPendencias` para contagem de ocorrências pendentes.
- Sem cálculo/pagamento/folha: ocorrências continuam como registro administrativo.

# Mão de obra extra com cadastro reaproveitável e convocação com prioridade

## 1. Erro ao publicar/salvar a convocação em rascunho (causa confirmada)

A tela envia, na atualização de um dia já salvo, um campo a mais (`p_grupo_id`) que a função de atualização não recebe. O banco então não encontra nenhuma função com aquela lista de campos e devolve a mensagem "Could not find the function ... in the schema cache" — exatamente o erro da imagem. É por isso que o rascunho existente não consegue ser revisado nem publicado.

Correção: na atualização, enviar apenas os campos que a função de atualização aceita (sem `p_grupo_id`), mantendo a criação como está.

## 2. Melhorias na tela de convocação

- Quantidade de vagas por dia com setinhas de aumentar/diminuir (mínimo 1), além da digitação.
- Cada dia selecionado pode ser expandido ali mesmo, mostrando a rotina daquele dia da unidade já com a convocação simulada (quem está escalado por turno + as vagas desta convocação), sem precisar abrir "Revisar e publicar".
- Mensagens de bloqueio na revisão continuam como estão (já dizem a data e o motivo).

## 3. Prioridade entre colaboradores na convocação

Quando mais de uma pessoa é selecionada, o gestor pode organizar níveis:

- Cada pessoa recebe um nível (1, 2, 3...), reordenável na própria lista de selecionados.
- Um campo "liberar o próximo nível após X horas" (por convocação).
- Ao publicar, só o nível 1 vê a convocação. Passado o intervalo, o nível 2 passa a ver também — e quem estava antes continua podendo aceitar (níveis acumulam). E assim por diante.
- No portal, quem ainda não foi liberado não vê a convocação.
- Sem níveis definidos, tudo funciona como hoje (todos veem ao mesmo tempo).

## 4. Mão de obra extra: telefone e banco de folguistas/testes

- No cadastro de Mão de Obra Extra, para folguista e teste: campo de telefone (obrigatório) e observação.
- Cada telefone cria/atualiza um registro no banco de pessoas de apoio, reaproveitado nas próximas vezes (autocompletar por nome/telefone, sem duplicar).
- Em Pessoas > Colaboradores, nova aba "Folguistas e testes": lista com nome, telefone, cargo, unidade, tipo, último dia trabalhado e quantidade de dias.
- Ficha simplificada editável: nome, telefone, cargo, unidade, e opcionais CPF, gênero, data de nascimento, observação.
- Botão "Aproveitar para contratação": abre o cadastro completo de colaborador já preenchido com esses dados e vincula o histórico anterior à pessoa contratada.

## Detalhes técnicos

- Correção do erro: `src/hooks/useDpConvocacaoGrupos.tsx` (`salvarOcorrencia`) — separar o payload de criação (`dp_convocacao_criar_ocorrencia`, com `p_grupo_id`) do de atualização (`dp_convocacao_atualizar_ocorrencia`, sem `p_grupo_id`, com `p_expected_updated_at`). Remover os `any` locais em `NovaConvocacaoPlanner.tsx` que esconderam o problema.
- Vagas: `DiasSelecionadosLista.tsx` — stepper (botões −/+) sobre o mesmo `onPatch({ vagas })`, clamp em 1.
- Simulação inline: novo `DiaSimulacaoInline.tsx` usando o panorama existente (`src/lib/dp/operacao-panorama.ts` / `useDpOperacaoPanorama`) para o dia+unidade, somando as vagas da convocação; colapsável por dia, carregado sob demanda.
- Prioridade (migração M31): `dp_convocacao_destinatarios.nivel integer not null default 1`, `dp_convocacoes`/grupo com `intervalo_niveis_horas integer` e `publicado_em` como base do relógio; `dp_convocacao_definir_destinatarios` passa a receber `p_niveis jsonb`; visibilidade no portal via função de elegibilidade (`nivel = 1 or now() >= publicado_em + (nivel-1) * intervalo`), aplicada nas RPCs de listagem do colaborador e nas policies de leitura. Testes de banco em `supabase/tests/`.
- Pessoas de apoio (migração M32): nova tabela `dp_pessoas_apoio` (company_id, nome, telefone, cargo_id, unidade_id, tipo, cpf, genero, data_nascimento, observacao, colaborador_id) com GRANTs + RLS por empresa e única por (company_id, telefone); `dp_pessoas_avulsas.pessoa_apoio_id` + `telefone`; RPC `dp_pessoa_apoio_upsert` chamada no salvamento do avulso; agregados de dias trabalhados por view/RPC.
- Frontend: `DpPessoaAvulsaDialog.tsx` (telefone + autocompletar), nova aba em `src/pages/dp/DpColaboradores*` com `DpPessoaApoioDialog.tsx`, e pré-preenchimento do cadastro completo na contratação. Sem `as any`; typecheck, lint e vitest ao final.

## Fora do escopo

Desistência, substituição e no-show; envio de mensagem por WhatsApp/SMS para folguistas; alteração de migrações antigas.

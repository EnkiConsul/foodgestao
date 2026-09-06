# Setor efetivo por dia + impacto em folgas + padrão habitual

Hoje o setor existe apenas no cadastro do colaborador. A escala do dia e a configuração por dia da semana não guardam setor, por isso a rotina sempre mostra o setor do cadastro.

Setor continua **opcional**: unidade sem nenhum setor cadastrado segue exatamente como hoje — sem filtro, sem agrupamento, sem "Sem setor", sem alerta e sem regra de folga por setor. A dimensão liga sozinha quando a unidade passa a ter pelo menos um setor ativo; nenhuma migração de colaborador é exigida.

## Setor efetivo em três níveis

```text
1. Setor do dia na escala publicada   -> exceção da data
2. Setor do dia da semana na jornada  -> rotina recorrente
3. Setor habitual do cadastro         -> padrão da pessoa
4. Sem setor
```

O primeiro que existir vence. Rascunho de escala não altera rotina, quota nem indicadores — só aparece como prévia dentro da própria tela de escala.

## O que o gestor passa a fazer

- **Rotina recorrente:** em Turno e Jornada, cada dia trabalhado ganha o campo opcional "Setor neste dia", com o texto "Em branco, será usado o setor habitual do colaborador". O campo só aparece quando a unidade tem setores.
- **Exceção da data:** na Rotina do Dia e no detalhe de pessoa/data da Rotina do Mês, a ação "Alterar setor deste dia" abre um diálogo com colaborador, data, setor habitual, setor atual, novo setor e motivo, além da opção "Usar setor padrão" (que apenas limpa o setor daquela data, preservando turno, horário, tipo, carga e observações).
- **Atalho separado:** ao lado dela, "Editar setor habitual do colaborador", que abre o cadastro na seção certa e volta para a Rotina já atualizada. Os textos deixam claro: uma vale só para aquela data, a outra muda a área padrão.
- **Leitura discreta:** setor igual ao habitual mostra só o nome; vindo da jornada mostra "rotina do dia"; vindo da escala mostra "alterado hoje". O detalhe mostra setor habitual, setor da data e a origem.
- **Visão da rotina:** seletor "Visão: Cargo / Setor" só quando a unidade tem setores. Na visão por setor, cada bloco mostra confirmados, habitual e a diferença, com os cargos dentro. Clicar no bloco abre quem está confirmado, de folga, ausente, aguardando convocação e quem teve setor alterado no dia.
- **Setor inativo:** setor em uso nunca é apagado — fica inativo, continua aparecendo no histórico e não é oferecido em novos ajustes.

## Folgas

- Regras de limite passam a aceitar também setor ou grupo de setores, junto de todos / cargo / colaboradores específicos. Vários setores na mesma regra dividem uma cota única ("Salão + Bar: máximo 2" = 2 no total).
- A quota por setor usa o **setor efetivo da data** (escala publicada → jornada do dia → cadastro), não o do cadastro.
- Trocar o setor do dia é sempre permitido e **nunca cancela folga já válida**. Se a troca gerar excesso, aparece o aviso "Cozinha ficará com 2 pessoas de folga neste dia. O limite configurado é 1.", com "Ver folgas do dia" e "Entendi". Se a troca liberar vaga, aparece uma informação discreta.
- Excesso já existente é preservado, mas novas solicitações naquele setor/data continuam bloqueadas enquanto ocupadas ≥ limite.
- Unidade sem setores: regras atuais intactas.

## Padrão habitual (não é cobertura mínima)

- O mecanismo de padrão histórico já existente na rotina (mediana das últimas 8 semanas do mesmo dia da semana e da mesma unidade, com tolerância de 20%) é **evoluído**, não substituído: passa a calcular também por cargo e por setor efetivo.
- Baseline por setor usa o setor efetivo de cada data passada — o passado não é reclassificado pelo cadastro atual.
- Confirmados = fixos previstos + convocações aceitas + substituições efetivas; convocações pendentes seguem separadas em "aguardando" e não entram no habitual do dia.
- Sem histórico suficiente (mínimo de 3 dias equivalentes) não há alerta; no máximo "Histórico insuficiente".
- Textos usam "padrão habitual" / "abaixo do habitual"; cobertura mínima continua sendo outra coisa e nunca é misturada. Nada disso bloqueia operação.

## Detalhes técnicos

Banco (migração única):
- `dp_escala_itens`: `setor_id uuid null` (FK `dp_setores`) e `setor_motivo text null`.
- `dp_colaborador_config_dias`: `setor_id uuid null` (FK `dp_setores`).
- Triggers de integridade nas duas tabelas: setor da mesma empresa e da mesma unidade efetiva do item/config, fail closed, erros `SETOR_UNIDADE_INVALIDA` / `SETOR_EMPRESA_INVALIDA` (já traduzidos em `traduzirErroSetor`).
- `dp_setor_previsto(p_colaborador_id uuid, p_data date)` retornando `setor_id, setor_nome, origem ('escala'|'config_dia'|'cadastro'|'nenhum'), unidade_id, referencia_id`; apenas escala publicada conta como origem `escala`.
- `dp_setor_previsto_periodo(p_unidade_id uuid, p_inicio date, p_fim date)` (ou view equivalente) para resolver em lote no panorama mensal — sem N+1.
- `dp_escala_definir_setor_dia(p_colaborador_id, p_data, p_setor_id, p_motivo)`: SECURITY DEFINER, deriva empresa/unidade do próprio item/escala (nunca do frontend), valida papel, localiza ou materializa apenas o item necessário preservando turno/horário/tipo/carga/observações, grava `setor_id` (NULL = usar padrão) e `origem` de ajuste manual, calcula quotas de folga antes/depois e devolve o resultado com eventual alerta de excesso; auditoria com setor efetivo anterior, origem anterior, novo setor, usuário, timestamp, motivo e, havendo impacto, `regra_id`, limite, ocupação antes/depois e excedente.
- `dp_folga_limite_regra_setores` (regra_id, company_id, setor_id, created_at) + valor `setor` em `dp_folga_limite_regras.tipo`; `dp_folga_limite_dia` e as RPCs de criação/solicitação/autoatribuição passam a contar pelo setor previsto da data.
- Índices: `dp_escala_itens(setor_id)` e `(colaborador_id, data)`, `dp_colaborador_config_dias(setor_id)`, `dp_folga_limite_regra_setores(regra_id, setor_id)` — sem duplicar índices já existentes. GRANTs e RLS no padrão das demais tabelas de DP.

Frontend:
- `src/lib/dp/setor-previsto.ts`: mesma precedência em memória, para telas que já carregam escala + config.
- `EscalaItemRow`/`EscalaItem`/`linhaParaItem()`/`gerarEscalaMes()`/`ajustarDia()` e o INSERT da regeneração passam a transportar `setor_id`, para que o ajuste manual sobreviva à regeneração.
- `operacao-panorama.ts`: setor efetivo por pessoa/dia, agrupamento Unidade → Setor → Cargo, `baselinePorDow` também por cargo e por setor, mínimo de amostras e rótulos de habitual.
- `DpOperacaoPanorama` e `DpEscalaMes`: seletor de visão, ações "Alterar setor deste dia" / "Editar setor habitual", diálogo de alteração, avisos de folga e invalidação das consultas de rotina, folga e panorama após a alteração.
- `ColaboradorJornadaPanel`: campo "Setor neste dia" por dia trabalhado, escondido quando a unidade não tem setores.
- `FolgaRegrasFormDialog`/`FolgaRegrasPanel`, `useDpFolgaLimites`, `src/lib/dp/folga-limites.ts`: tipo `setor`, `setor_ids`, cota compartilhada e precedência.

Testes (bloqueantes):
- Gerar escala → trocar Sara de Salão para Cozinha em 17/09 → regenerar preservando ajustes → 17/09 continua Cozinha.
- Alterar setor não altera turno, horário, tipo, folga nem observações.
- Precedência do setor efetivo (escala publicada > jornada do dia > cadastro > nenhum) e rascunho não influenciando rotina/quota.
- Quota de folga pelo setor efetivo, preservação de excesso e bloqueio de nova solicitação.
- Baseline por cargo/setor com mediana e mínimo de amostras; unidade sem setores sem nenhuma mudança de comportamento (teste de regressão).
- RLS/tenancy: setor de outra empresa ou de outra unidade recusado na função de alteração.

Rollback: remover `dp_folga_limite_regra_setores`, as funções novas e as colunas `setor_id` das duas tabelas; o setor do cadastro volta a ser a única fonte.

Observação: por estar em modo de plano, a tarefa ainda não foi registrada em `roadmap.md`; faço isso no início da execução.

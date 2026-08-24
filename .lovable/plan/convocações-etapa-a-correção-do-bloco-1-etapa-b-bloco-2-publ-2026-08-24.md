# Convocações — Etapa A (correção do Bloco 1) + Etapa B (Bloco 2: publicação, ofertas, portal)

Duas etapas na mesma execução. A Etapa B só começa se o gate da Etapa A passar. Nada de Bloco 3 (aceite/recusa, vagas, escala).

## Etapa A — remoção real de ocorrência de rascunho

Problema: remover data/cargo/ocorrência ao editar um rascunho só muda o estado do frontend; a ocorrência persistida continua ativa no banco.

Solução: nova RPC `dp_convocacao_cancelar_ocorrencia_rascunho(p_ocorrencia_id, p_expected_updated_at)` — sem DELETE físico, apenas `rascunho → cancelada`.

Comportamento:
- SECURITY DEFINER, exige `auth.uid()`, deriva `company_id` da própria ocorrência (nunca do frontend), valida membership e exige owner/admin **antes** do `FOR UPDATE`.
- Só aceita ocorrência em rascunho; publicada ou outro estado retorna `INVALID_STATE`; outra empresa retorna `FORBIDDEN` sem vazar dados.
- Idempotente: se já cancelada, sucesso sem novo evento. Evento append-only único em `dp_convocacao_eventos`.
- Grants: revoke de PUBLIC/anon; execute apenas para `authenticated` e `service_role`.

Frontend (`useDpConvocacaoGrupos.tsx`, `NovaConvocacaoWizard.tsx`, `DpConvocacoes.tsx`):
- Ao abrir "Continuar edição", guardar os IDs realmente persistidos.
- Remoções marcam a ocorrência como removida; ao salvar: atualiza grupo → cria/atualiza mantidas → cancela via RPC as persistidas removidas. Ocorrência só local nunca chama RPC.
- Leituras de planejamento ativo filtram `status = 'cancelada'`; histórico mantém.

Gate A → B: remoção persistente funcionando, sem DELETE físico, evento único, idempotência, isolamento multiempresa, rascunho reabre correto, sem regressão do Bloco 1.

## Etapa B — Bloco 2: publicação + ofertas + portal

### Backend
Nova RPC `dp_convocacao_publicar_grupo(p_grupo_id, p_expected_updated_at, p_confirmacoes_antecedencia jsonb)` — atômica, idempotente, fail closed, owner/admin, multiempresa. Ordem: auth → autorização → lock do grupo → revalidação → lock das ocorrências em ordem determinística (`data, necessidade_entrada, necessidade_saida, cargo_id, id`).

Por ocorrência, tudo derivado no backend:
- **Individual**: exige `colaborador_alvo_id` e `vagas = 1`; revalida empresa/unidade/cargo/ativo/regime/disponibilidade/conflito/jornada/remuneração. Se inelegível, falha a publicação com erro daquela ocorrência — nunca troca a pessoa.
- **Aberta**: backend deriva os elegíveis (mesma empresa/unidade/cargo, ativo, regime convocável via `dp_regime_convocavel`, sem indisponibilidade em `dp_indisponibilidades`, sem conflito em `dp_convocacoes`/`dp_escala_itens`, compatibilidade integral, Option A) e cria uma oferta por elegível, mesmo acima das vagas.
- Zero elegíveis → `PUBLICATION_NO_ELIGIBLE`. Abaixo das vagas → publica e devolve diagnóstico ("4 vagas, 2 elegíveis, faltam 2").
- Compatibilidade só integral ou incompatível.
- Jornada: `horario_unico` usa a ocorrência; `jornada_individual` resolve a jornada vigente no backend. Sempre com snapshot na oferta.
- Remuneração V1: intermitente horista e freelancer horista exigem `valor_hora > 0`; freelancer diarista exige `valor_diaria > 0`; freelancer mensalista inelegível. Sem converter salário mensal e sem usar `dp_cargo_salarios.salario_base`. Gera `remuneracao_snapshot` (forma, unidade, valor unitário, quantidade prevista, valor previsto, fonte). Não cria folha nem lançamento financeiro.
- Snapshots: `regime_snapshot`, `timezone_snapshot`, `inicio_previsto`/`fim_previsto` (timestamptz, respeitando virada de dia). Timezone ausente/inválido → fail closed.
- `inicio_previsto <= now()` → não publica (distinto da regra de 3 dias).
- Antecedência: backend calcula `antecedencia_dias`/`fora_antecedencia` por ocorrência. Abaixo de 3 dias exige confirmação consciente e, se `exige_justificativa_excecao`, justificativa; persiste `confirmado_fora_prazo_por/_em` e `justificativa_fora_prazo`.
- Prazos: `disponibilizada_em` = timestamp do backend; `prazo_resposta_base = disponibilizada_em + N dias úteis` via `dp_adicionar_dias_uteis` (config resolvida, padrão 1 dia útil); `prazo_resposta = prazo_resposta_base`, nunca encurtado; `encerramento_operacional = inicio_previsto`. `visualizada_em` NULL. `origem_oferta = 'convocacao'`.
- Status finais: grupo `publicado`, ocorrências `publicada`, ofertas `pendente`. Nada de `preenchida`.
- Eventos append-only: `grupo_publicado`, `ocorrencia_publicada` e o evento de materialização das ofertas. Retry coerente → sucesso idempotente sem eventos extras; publicado mas incoerente → `PUBLICATION_INCONSISTENT`.
- Publicação **não** cria escala; `dp_convocacao_sync_escala` fica intocado.

### Frontend
- Wizard: botão Publicar habilitado no passo Revisar, com resumo final (unidade, competência, período, modalidade, cargos, datas, vagas, horários, público, remuneração, exceções de antecedência) e confirmação explícita; captura das confirmações/justificativas de antecedência.
- `DpConvocacoes.tsx`: grupo publicado sai de rascunho e aparece em **Próximas**; ofertas pendentes em **Aguardando**; **Confirmadas** segue vazia. Pendente nunca conta como confirmado.
- `DiaDetalheSheet.tsx`: passa a mostrar as ofertas reais por ocorrência (cargo, vagas, convidados, aguardando, horário, regime, origem, remuneração resumida).
- `DpMinhasConvocacoes.tsx`: passa a ler também ofertas do novo fluxo (`ocorrencia_id IS NOT NULL`), com data, cargo, unidade, horário, remuneração prevista, modalidade, prazo e situação. Legado preservado. Aceitar/Recusar desabilitados com "Resposta disponível na próxima etapa" — nenhum UPDATE direto.
- Todo write do novo fluxo passa por RPC; nenhum insert/update direto em `dp_convocacoes`.

### Migrations
Novas e incrementais, sem tocar M1–M14.1, cada uma com rollback documentado:
- M15 — RPC de cancelamento de ocorrência em rascunho.
- M16 — helpers de backend necessários à publicação (elegibilidade, jornada vigente, timezone/materialização), sem `EXECUTE` para `authenticated`.
- M17 — RPC de publicação do grupo.
Grants: apenas `authenticated` + `service_role` nas RPCs públicas; sem PUBLIC/anon; sem policy permissiva nova que reabra DML direto. Tipos regenerados após as migrations.

### Testes
Etapa A: 7 cenários (remoção de data, remoção de cargo, troca de competência, retry idempotente, cross-company FORBIDDEN, publicada INVALID_STATE, ausência de DELETE físico).
Etapa B: os 32 cenários da especificação (individual, aberta, multi-cargo, multi-datas, horário único, jornada individual, virada de dia, matriz de remuneração, indisponibilidade, conflito, Option A, zero/poucos elegíveis, antecedência com e sem confirmação, justificativa, sexta + 1 dia útil = segunda, prazo não encurtado, ocorrência iniciada, timezone, retry, atomicidade, isolamento multiempresa, portal novo e legado, sem escala, sem DML no frontend).
Baseline real ao final: `npx vite build`, `npm test`, `npm run lint`, `npm run typecheck:strict`, comparado com o baseline anterior.

### Release blockers mantidos
Validação funcional concorrente da M13 e concorrência real das novas RPCs seguem pendentes por falta de ambiente isolado — registrados como release blockers, não declarados validados.

## Próximo passo após esta tarefa
Bloco 3 — aceite/recusa + fechamento de vagas + escala por aceite.

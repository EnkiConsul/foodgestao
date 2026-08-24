# Convocações — Fase 1 REVISADA (diagnóstico e desenho; nada implementado)

## 1. Resumo executivo revisado

O diagnóstico anterior está corrigido em dois pontos: (a) a indisponibilidade **pode sim** interferir na liberação de folgas, desde que passe pelo mesmo motor de cobertura já existente, e (b) as decisões de armazenamento (indisponibilidade e estrutura de Convocações) voltam com recomendação objetiva, mas seguem dependendo da sua aprovação.

Descoberta nova e importante: hoje **a liberação de folga não consulta cobertura nenhuma**. O único freio de capacidade é `dp_dia_config.limite_folgas` — "quantas pessoas podem folgar neste dia" — e ele nem sabe quantas pessoas precisam ficar. `dp_cobertura_minima` (unidade, cargo, dia da semana, turno, mínimo, vigência) existe e já é usada em Escala e Operação (`src/lib/dp/escala-mes.ts`, `src/lib/dp/operacao-dia.ts`, `src/components/dp/CoberturaMinimaCard.tsx`), mas **não é consultada em nenhum ponto da validação de folgas** (`dp_folgas_validar_unificado` não referencia essa tabela). Ou seja: o seu pedido do item 8 é viável e é exatamente a ponte que falta — sem criar um segundo conceito de cobertura.

Também não existe hoje nenhum campo do tipo "este colaborador compõe a equipe operacional": em `dp_colaboradores` os únicos campos próximos são `folga_fixa_semana`, `vinculo_label`, `domingos_folga_mes`. Esse campo precisará ser criado (proposta na seção 7).

## 2. Como funciona atualmente

Convocações
- `dp_convocacoes`: 1 linha = 1 colaborador + 1 data + 1 horário (`entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, status, prazo_resposta, respondida_em, escala_item_id`). **0 registros hoje.**
- `dp_convocacao_guard` (trigger): levanta exceção se o regime **não for `intermitente`** e valida prazo no aceite.
- `dp_convocacao_sync_escala` (trigger): aceite cria/atualiza `dp_escala_itens` com `origem='convocacao'`; recusa/cancelamento apaga o item. É essa a integração com Escala e, por consequência, com apuração/folha.
- Portal responde por UPDATE direto (RLS `dp_convocacoes_respond_self`), sem vaga, sem trava de concorrência. `remover` faz DELETE físico (`useDpConvocacoes.tsx`).
- Enum `dp_regime_trabalho` já inclui `freelancer` (hoje: 4 intermitentes, 0 freelancers).

Folgas
- `dp_folgas_validar_unificado` valida, em ordem: bloqueio manual da data (`dp_datas_bloqueadas`), regras dinâmicas (`dp_regra_bloqueia_data`), bloqueio individual (`dp_bloqueios`), **limite diário** (`dp_dia_config.limite_folgas`, contando folgas não-extra da unidade) e, só para `origem='solicitacao'`, as travas de autoatendimento (teto de fim de semana `folgas_fds_por_mes`, folga fixa, reserva de aniversariante), com sócio isento.
- Configurações da empresa/unidade: `dp_config_dp` (via `dp_config_resolvida(company, unidade)`), incluindo `folgas_fds_por_mes`, políticas de domingo/sábado/feriado, `troca_folga_modo`, `troca_folga_escopo`. Espelho no frontend: `src/lib/dp/dsr-rules.ts`; tela: `DpConfiguracoesJornada` dentro do hub Folgas.
- RLS `dp_folgas_self_insert` só admite `origem='solicitacao' AND tipo='normal' AND extra=false`.

Cobertura
- `dp_cobertura_minima` + `src/lib/dp/cobertura-utils.ts` (`resolverCoberturaMinima`, `avaliarCobertura`, regra sem turno vale para todos, a mais exigente prevalece, respeita vigência).
- `src/lib/dp/operacao-panorama.ts` conta por dia/cargo com categorias `fixo, convocado_aceito, convocado_pendente, folga_padrao, folga_extra, ferias, atestado`.

## 3. Correções em relação ao diagnóstico anterior

1. Indisponibilidade **passa a poder** reduzir capacidade e, com isso, bloquear/alertar folga — não como regra fixa, mas via regra da empresa (seção 6) + marcação individual (seção 7).
2. `dp_cobertura_minima` deixa de ser tratada apenas como "atende o item 100" e passa a ser a **fonte única** de necessidade também para folgas.
3. Fica registrado que hoje a folga não avalia cobertura alguma — logo, ligar cobertura à folga é funcionalidade nova (com risco de regressão controlado por flag padrão).
4. "Confirmados x Aguardando" é reafirmado como separação de domínio (seção 14), não só de rótulo.

## 4. Indisponibilidade — alternativas avaliadas

Alternativa A — entidade própria (`dp_indisponibilidades`: colaborador, data, unidade opcional, motivo, criado_por, timestamps; UNIQUE colaborador+data)
- Vantagens: zero risco de contaminar DSR, teto de folgas, folga dominical, conformidade, folha e relatórios (nenhum deles conhece a tabela); permite data passada proibida e regras próprias; RLS simples (self insert/delete futuro + leitura do admin); pode nascer com política de "não é folga" explícita.
- Riscos: nova tabela, novo hook, novo ponto a lembrar nas queries de elegibilidade e de cobertura.
- Impacto: `DpMeuCalendario` passa a ler duas fontes (folgas + indisponibilidades) para pintar o mês.

Alternativa B — reutilizar `dp_folgas` com `tipo`/`origem` novos (ex.: `tipo='indisponibilidade'`)
- Vantagens: calendário do Portal e Operação já leem essa tabela; menos código novo.
- Riscos (altos e concretos): `dp_folgas_validar_unificado` roda em **todas** as inserções e aplicaria bloqueio de data, limite diário e travas de autoatendimento a uma marcação que não é folga; a RLS `dp_folgas_self_insert` teria de ser afrouxada (hoje trava `tipo='normal'`), enfraquecendo uma policy de segurança já revisada; contagens de `dp_folgas` espalhadas (limite diário, conformidade DSR, folga dominical, VA/VT, relatórios) passariam a precisar de filtro negativo em cada consulta — qualquer esquecimento vira erro silencioso em cálculo trabalhista.
- Impacto: risco de regressão em folha/benefícios/DSR, justamente o que você pediu para não contaminar.

## 5. Recomendação para armazenamento da indisponibilidade

**Alternativa A — tabela própria `dp_indisponibilidades`.** Motivo: o efeito desejado (reduzir capacidade nas folgas) é obtido por leitura no motor de cobertura, sem precisar que a indisponibilidade seja uma folga. Assim ganhamos a interferência que você pediu **sem** herdar as validações CLT de `dp_folgas`.

Como será consultada: hook `useDpIndisponibilidades(competência, unidade)` no admin e leitura própria no Portal; no backend, entra em (i) elegibilidade de convocação, (ii) função de capacidade das folgas, (iii) painel Operação como categoria informativa.

## 6. Regra global de Folgas

Nova configuração em Regras de Folgas (nível empresa, com override por unidade porque `dp_config_dp` já tem `unidade_id` e `dp_config_resolvida`):

- "Considerar indisponibilidade de intermitentes e freelancers na cobertura da equipe ao analisar novas folgas" — **ativada por padrão**.
- Quando desativada: indisponibilidade não entra em nenhum cálculo de folga (comportamento atual preservado).
- Quando ativada: a capacidade do dia passa a descontar quem informou indisponibilidade **entre os que compõem a cobertura operacional**, e a decisão final continua sendo das regras de folga já existentes.

## 7. Configuração individual Intermitente/Freelancer

No cadastro do colaborador (aba Horário/Jornada, junto do vínculo com unidade), campo com linguagem simples:

- "Considerar este colaborador na cobertura operacional" — marcado por padrão para intermitente e freelancer; ausente/irrelevante para CLT (fixo sempre compõe) e sócio segue a regra de sócio já existente.
- Texto de apoio: "Desmarque se esta pessoa é chamada apenas em eventos e picos: nesse caso a ausência dela não reduz a equipe considerada para liberar folgas."

Como esse campo não existe (auditado: `dp_colaboradores` só tem `folga_fixa_semana`, `vinculo_label`, `domingos_folga_mes`, e `dp_colaborador_config_trabalho` trata unidade/turno/carga/folga), ele precisará ser criado. Recomendação: **uma coluna booleana em `dp_colaboradores`** (default `true`), e não em `config_trabalho`, porque é característica do vínculo e não de vigência de jornada — e porque `operacao-panorama.ts` já recebe o colaborador com `regime/unidade/cargo` e passaria a receber esse flag sem query extra.

## 8. Hierarquia das regras

```text
Regra da empresa (unidade > empresa)
"Considerar indisponibilidades na cobertura de folgas"
  ├── DESATIVADA → indisponibilidade não afeta folgas (estado atual)
  └── ATIVADA
        └── considera apenas quem tem "compõe cobertura operacional" = sim
              └── indisponibilidade reduz a capacidade do dia/cargo/turno
                    └── regras atuais de folga (mínimo de cobertura, limite
                        diário, bloqueios, autoatendimento) decidem
                        bloquear ou apenas alertar
```

Independente de tudo isso: indisponível = **não elegível** para convocação naquela data (seção 11).

## 9. Integração com cobertura mínima

Uma única função de capacidade, no banco (SECURITY DEFINER) e espelhada em `cobertura-utils.ts`, para data + unidade + cargo + turno:

```text
mínimo exigido   = dp_cobertura_minima (resolvida por vigência/dia/turno/cargo)
disponíveis      = fixos previstos (jornada/escala)
                 + intermitentes/freelancers que compõem cobertura
                 - folgas e férias já concedidas
                 - indisponibilidades (quando a regra da empresa estiver ativa)
folga solicitada → disponíveis - 1 < mínimo ?
```

Sem segundo conceito de cobertura: a necessidade continua vindo só de `dp_cobertura_minima`, e a contagem de pessoas reaproveita a lógica de `operacao-panorama.ts`.

## 10. Fluxo de concessão de Folgas

1. Validações atuais primeiro, na ordem já existente (bloqueio de data, regra dinâmica, bloqueio individual, limite diário, autoatendimento). Nada disso muda.
2. Nova etapa de cobertura, só quando houver regra de mínimo aplicável ao cargo/turno do solicitante:
   - **Bloquear** quando a folga derrubaria os disponíveis abaixo do mínimo e a origem é autoatendimento (`origem='solicitacao'`).
   - **Apenas alertar** quando o lançamento é do admin (`admin_manual`), quando não há regra de mínimo para aquele cargo/dia/turno, ou quando o déficit vem de indisponibilidade e a empresa marcou a regra como alerta.
   - Sem regra de mínimo cadastrada → comportamento idêntico ao de hoje (nada bloqueia).
3. Sócio, férias, licença e folga extra seguem as isenções atuais.

## 11. Impacto na elegibilidade para Convocações

- Indisponibilidade sempre remove a pessoa da lista de elegíveis daquela data, **inclusive** quando "compõe cobertura" = não.
- Convocação pendente na data: marcar indisponibilidade encerra a oferta e devolve a vaga.
- Convocação aceita: não permite marcar; oferece "Manter" ou "Solicitar substituição".
- Data passada: não permite marcar. Data bloqueada para folga: **permite** marcar indisponibilidade (não consome vaga de folga).
- Remover indisponibilidade futura devolve elegibilidade para novas convocações, sem reabrir ofertas encerradas.

## 12. Arquitetura de Convocações recomendada

**Recomendação objetiva: estrutura-pai + ocorrências, com `dp_convocacoes` reaproveitada como a tabela de OCORRÊNCIA.**

```text
dp_convocacoes_grupos   (empresa, unidade, competência, modalidade individual|aberta, status, criada/publicada)
        ↓ 1:N
dp_convocacoes          (ocorrência: data, cargo, vagas, vagas_preenchidas, titular,
                         snapshot de jornada e de remuneração, marcação de antecedência)
        ↓ 1:N
dp_convocacao_ofertas   (destinatário, status aguardando|aceita|recusada|sem_resposta|encerrada,
                         disponibilizada_em, visualizada_em, respondida_em)
        ↓
dp_convocacao_eventos   (timeline auditável, append-only)
```

Por que não uma tabela nova para ocorrência: `dp_convocacoes` já é ocorrência na prática (data + horário + snapshot + `escala_item_id`) e já tem os dois triggers e as três policies certas; recriá-la exigiria reescrever `dp_convocacao_sync_escala`, `operacao-panorama.ts`, o Portal e os tipos, sem ganho. Por que não in-place puro: sem tabela-pai e sem ofertas não há como representar convocação aberta, vários candidatos e aceites concorrentes com trava de vaga.

Fator decisivo de segurança: `dp_convocacoes` está **vazia** (0 registros) — a evolução não migra dado nenhum.

## 13. Compatibilidade com `dp_convocacoes`

- `dp_convocacao_guard`: precisa passar a aceitar `freelancer` — hoje **bloqueia** (P0). A checagem deve derivar da política de contrato, não de comparação literal de regime.
- `dp_convocacao_sync_escala`: mantido como está; a ocorrência continua sendo a linha que gera `dp_escala_itens`, então Escala, Operação, apuração e folha continuam lendo a mesma fonte.
- `dp_convocacoes_respond_self` (UPDATE direto do Portal): deve ser substituída por RPC atômica de aceite; manter a policy junto com vagas gera overbooking (P0).
- `remover` (DELETE físico): substituir por cancelamento/arquivamento após publicação.
- Portal: `DpMinhasConvocacoes` continua listando ocorrências; ganha agrupamento por grupo/mês.
- Folha/benefícios: nada muda, porque o vínculo continua sendo via item de escala.

## 14. Confirmados x Aguardando

`operacao-panorama.ts` já separa `convocado_aceito` de `convocado_pendente` e `trabalhando` já soma os dois. Para não quebrar a tela Operação: manter `trabalhando` como está e **derivar** dois números novos a partir das contagens existentes — `confirmados = fixo + convocado_aceito (+ substituição efetivada, que já chega como item de escala)` e `aguardando = convocado_pendente`. No calendário de Nova Convocação, o número grande é sempre `confirmados`; `aguardando` aparece como linha secundária. Isso é cálculo adicional sobre o retorno atual, sem alterar a semântica consumida hoje pela Operação.

## 15. Tabelas/campos reutilizáveis

- `dp_cobertura_minima` + `cobertura-utils.ts` → necessidade por cargo/dia/turno (folgas e convocações).
- `operacao-panorama.ts` + `DpOperacaoPanorama` → cobertura por dia/cargo e detalhe de pessoas.
- `dp_colaborador_config_trabalho` / `dp_colaborador_config_dias` / `config-trabalho.ts` → jornada habitual automática.
- `dp_convocacoes` (como ocorrência), `dp_convocacao_sync_escala`, `dp_escala_itens`.
- `dp_trocas` + `dp_processar_troca` / `dp_processar_troca_direta` + `dp_config_resolvida` + `dsr-rules.ts` → substituições com modo direto/aprovação.
- `dp_config_dp` (+ `unidade_id`) → todas as novas regras, herdando override por unidade.
- `dp_datas_bloqueadas`, `dp_dia_config`, `dp_bloqueios` → regras de data já existentes.
- `DpMeuCalendario` → calendário único do Portal.

## 16. Tabelas/campos que precisariam ser criados

- `dp_indisponibilidades` (seção 5).
- `dp_convocacoes_grupos`, `dp_convocacao_ofertas`, `dp_convocacao_eventos` (seção 12).
- Em `dp_convocacoes`: grupo, cargo, vagas, vagas preenchidas, titular, marcação e dados da exceção de antecedência, snapshot financeiro.
- Em `dp_colaboradores`: "compõe cobertura operacional" (default sim).
- Em `dp_config_dp`: considerar indisponibilidade na cobertura (default sim), bloquear ou alertar no déficit, antecedência padrão (3 dias), prazo de resposta (1 dia útil), matriz de trocas intermitente/freelancer/fixo dominical, modo de aprovação.
- Estrutura de desistência/falta com análise de justo motivo e referência de 50% (só intermitente).

## 17. Riscos

- **P0**: `dp_convocacao_guard` bloqueia freelancer; aceite sem atomicidade permite overbooking; RPCs novas precisam derivar `company_id` no backend (nunca do frontend).
- **P1**: ligar cobertura à folga é comportamento novo e pode bloquear folga que hoje passa — mitigar com regra padrão de mínimo só quando cadastrada, alerta em lançamento admin e testes de regressão em Folgas; generalizar `dp_trocas` sem quebrar troca de folga; consistência de `escala_item_id` em substituição.
- **P2**: expiração por silêncio precisa ser materializada (hoje só visual em `statusEfetivo`); custo do calendário mensal com muitos cargos; duas fontes no calendário do Portal (folgas + indisponibilidades).

## 18. Decisões que dependem da sua aprovação

1. Indisponibilidade em tabela própria (recomendado) — confirma?
2. Convocações: grupo-pai + `dp_convocacoes` como ocorrência + tabela de ofertas (recomendado) — confirma?
3. "Compõe cobertura operacional" como campo do colaborador (recomendado) — confirma?
4. Déficit de cobertura em folga: **bloquear** no autoatendimento e **alertar** no lançamento do admin — confirma?
5. Regras novas dentro de `dp_config_dp` com override por unidade (recomendado) — confirma?
6. Desistência/falta/multa: estrutura própria de análise ou reuso de `dp_registros_disciplinares`?

PARADO. Nada foi alterado em código, banco, migrations, Portal, Folgas, Convocações ou Operação. Aguardo sua aprovação da Fase 1 e as decisões acima para desenhar a Fase 2.

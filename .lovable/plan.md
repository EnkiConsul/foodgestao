# Ocorrências — presença, atrasos, faltas, cobertura e tratativas de ponto

Nova área dentro de Rotina, a camada entre o que estava planejado na jornada e o que realmente aconteceu: faltas, previsões, atrasos, saídas antecipadas, atrasos no retorno do intervalo, atestados, esquecimentos de marcação, divergências de jornada, cobertura da ausência e a decisão do gestor.

Ocorrências não é módulo de ponto: nada de marcação, correção, banco de horas, espelho ou folha. Registra o que aconteceu, quando, o que o colaborador informou, a justificativa e o que o gestor decidiu — para facilitar o tratamento do ponto depois, mesmo que esse tratamento siga fora do sistema.

Dimensões sempre separadas: **ocorrência** (o que aconteceu), **estado** (informado/previsto ou realmente aconteceu), **análise** (o gestor avaliou?), **cobertura** (ficou descoberto ou alguém assumiu?), **impactos** (assiduidade e férias) e **tratativa de ponto** (o que precisa ser considerado depois).

Entrega em 3 etapas.

## Etapa 1 — Registro e tela de Ocorrências

- Nova rota **Rotina → Ocorrências** (`/dp/ocorrencias`): central de consulta, registro e tratamento. Filtros de Hoje / Semana / Mês / Todas e por colaborador, unidade, setor, tipo, estado, análise, impacto na assiduidade, impacto nas férias, tratativa de ponto e pendências. Abre no período recente priorizando o que precisa de ação.
- Tipos iniciais: falta, previsão de falta, atraso, previsão de atraso, atestado, ausência justificada, saída antecipada, previsão de saída antecipada, esquecimento de marcação, atraso no retorno do intervalo, previsão de atraso no retorno do intervalo, outra divergência de jornada. Novos tipos entram depois sem refazer a tela.
- Esquecimento de marcação é um tipo único com `marcacao_alvo` (entrada, saída, início do intervalo, retorno do intervalo); na tela o colaborador vê as opções amigáveis.
- Horários padronizados: previsto, estimado (informado antes) e real. Minutos e antecedência são calculados no backend; a tela só faz prévia.
- **Data operacional**: a ocorrência pertence à data da rotina, não à data civil — uma saída às 00:10 de 07/09 pertence à rotina de 06/09.
- Ações rápidas do colaborador na jornada do dia: "Vou me atrasar" (10/20/30/45/60 min ou horário), "Não poderei comparecer", "Preciso sair mais cedo", "Informar problema com ponto". Ele não precisa conhecer a área administrativa.
- **Previsão e confirmação são a mesma ocorrência**: previsão de atraso em `aguardando_confirmacao` vira atraso `confirmada` com horário real; nada de dois registros. A virada fica na auditoria.
- Justificativa inicial nunca é sobrescrita: a final é gravada em separado e as duas ficam visíveis.
- Comunicar ausência não é pedir autorização: a rotina é atualizada na hora; ficam pendentes justificativa, cobertura, impactos e tratativa.
- Prazo retroativo configurável por empresa (`ocorrencia_prazo_retroativo_dias`) vale para o colaborador; gestor autorizado registra períodos anteriores.
- Edição pelo colaborador só enquanto pendente e dentro do prazo; depois de analisada, ele envia complemento/correção, que entra na auditoria sem sobrescrever.
- Gestor cria, complementa e corrige ocorrências manualmente.
- Estados: informada, aguardando_confirmacao, confirmada, cancelada. Análise: pendente, analisada, nao_se_aplica. Impactos em assiduidade e em férias: sim, nao, aguardando, nao_se_aplica, com padrão por tipo configurável e alteração pelo gestor registrando valor anterior, novo, quem e quando.

## Etapa 2 — Rotina do dia, coberturas e pendências

- Operação do Dia com contadores (equipe prevista, atrasos previstos, ausências, coberturas, saídas antecipadas) e selo na linha da pessoa.
- Previsto e confirmado visualmente diferentes: "⚠ Atraso previsto ~30 min" x "Atraso confirmado — 24 min"; "⚠ Pretende sair às 22:30" x "Saída antecipada às 22:27".
- Só ocorrências com relevância operacional aparecem na rotina; as administrativas (ex.: esquecimento de marcação) ficam na Central de Pendências.
- Cores: vermelho (problema operacional agora), amarelo (atenção/previsão/cobertura aguardando), verde (coberto ou resolvido), neutro (administrativo).
- Cobertura só com gente cadastrada: colaborador cadastrado ou **Mão de Obra Extra** já existente. Nada de nome livre nem cadastro paralelo. Cadastro rápido reutiliza a estrutura atual de Mão de Obra Extra com nome e telefone obrigatórios e checagem de telefone repetido, oferecendo selecionar a pessoa existente.
- Aprovação da cobertura configurável por empresa: sempre, colaborador_cadastrado (interno aprova automático, mão de obra extra continua exigindo aprovação) ou mesmo_cargo.
- **Aprovada ≠ realizada**: a cobertura guarda status (proposta, aprovada, recusada) e execução (prevista, realizada, nao_realizada). Na rotina: "↳ Marcos 🟡 cobertura prevista" e depois "↳ Marcos 🟢 cobertura realizada".
- Cobertura não apaga a falta: o registro de que a pessoa escalada não trabalhou permanece.
- Central de Pendências em três blocos — Operação, Tratativas de ponto e Administrativo — cada item com a ação que falta.
- Tratativa de ponto: confirmar informação ou solicitar ajuste, com observação, e o aviso explícito "esta tratativa não altera o ponto". Status: pendente, concluida, nao_se_aplica.

## Etapa 3 — Automação, histórico e indicadores

- Atestado cadastrado gera as ocorrências automaticamente — uma por data afetada em que exista jornada prevista, todas ligadas ao mesmo documento.
- Atestado apresentado depois da falta localiza a ocorrência compatível do dia e vincula/reclassifica, sem criar segunda ausência.
- Atestado recusado não cancela a ausência: ela permanece e é reclassificada; cancelamento só quando o fato foi registrado errado.
- Deduplicação nas RPCs por empresa, colaborador, data operacional, jornada e tipo/contexto: se o gestor registrar o mesmo atraso já informado, o sistema aponta ou reutiliza o registro existente.
- Aba **Ocorrências** no perfil do colaborador, agrupada por mês.
- Indicadores no painel: atrasos e minutos no mês, atrasos de intervalo, faltas, ausências cobertas e sem cobertura, coberturas previstas x realizadas, saídas antecipadas, esquecimentos, ocorrências e tratativas pendentes, comunicações antecipadas.
- Auditoria por tipo de evento (ocorrencia_criada, previsao_confirmada, justificativa_enviada, justificativa_complementada, cobertura_proposta/aprovada/recusada/realizada, tratativa_concluida, impacto_alterado, atestado_vinculado, ocorrencia_cancelada).

## Detalhes técnicos

Banco — migrações por etapa, sempre com `company_id`, GRANT e RLS:

- Enums `dp_ocorrencia_tipo`, `dp_ocorrencia_estado` (`informada|aguardando_confirmacao|confirmada|cancelada`), `dp_ocorrencia_impacto` (`sim|nao|aguardando|nao_se_aplica`), `dp_ocorrencia_origem` (`colaborador|gestor|sistema`), `dp_ocorrencia_analise_status`, `dp_ocorrencia_cobertura_status` (`proposta|aprovada|recusada`), `dp_ocorrencia_cobertura_execucao` (`prevista|realizada|nao_realizada`), `dp_ocorrencia_marcacao`, `dp_ocorrencia_tratativa_status`.
- `dp_ocorrencias`: company_id, colaborador_id, unidade_id, setor_id (setor efetivo via `dp_setor_previsto_id`), data_operacional, tipo, estado, origem, previsto_entrada/saida, horario_previsto, horario_estimado, horario_real, minutos, justificativa_inicial, justificativa_final, impacta_assiduidade, impacta_ferias, relevancia_operacional, analise_status, analisado_por/em, tratativa_ponto, tratativa_status, tratativa_decisao, tratativa_observacao, marcacao_alvo, documento_id (FK `dp_documentos`), solicitacao_id, informada_em, antecedencia_minutos, criado_por, created_at, updated_at. Índice parcial para deduplicação por empresa+colaborador+data+tipo entre registros não cancelados.
- `dp_ocorrencia_coberturas`: company_id, ocorrencia_id, substituto_colaborador_id, mao_de_obra_extra_id (FK `dp_pessoas_apoio`, a entidade atual de Mão de Obra Extra), entrada, saida, status, execucao_status, aprovado_por/em, realizado_confirmado_por/em, motivo_recusa, timestamps. CHECK garante exatamente um dos dois vínculos.
- `dp_ocorrencia_eventos`: tipo_evento, campo, valor_anterior, valor_novo, metadata (jsonb), autor_id, created_at — alimentada por trigger e pelas RPCs.
- `dp_config_dp`: `ocorrencia_prazo_retroativo_dias`, `ocorrencia_cobertura_aprovacao` (`sempre|colaborador_cadastrado|mesmo_cargo`); `dp_ocorrencia_tipo_config` com padrões por tipo (impactos, relevância operacional, tratativa) e seed por empresa.
- RPCs `SECURITY DEFINER`: `dp_ocorrencia_registrar` (resolve data operacional, previsto, antecedência, dedup e prazo retroativo), `dp_ocorrencia_confirmar`, `dp_ocorrencia_complementar`, `dp_ocorrencia_classificar`, `dp_ocorrencia_analisar`, `dp_ocorrencia_tratar`, `dp_ocorrencia_cancelar`, `dp_ocorrencia_cobertura_propor` / `_decidir` / `_confirmar_execucao`, `dp_ocorrencias_listar`, `dp_ocorrencias_pendencias`, `dp_ocorrencias_do_dia`, `dp_ocorrencias_indicadores`, `dp_pessoa_apoio_por_telefone`. Trigger em `dp_documentos` (tipo `atestado`) cria, vincula ou reclassifica de forma idempotente.

Frontend: `src/lib/dp/ocorrencias.ts` (tipos, rótulos, cores, data operacional, prévia de minutos/antecedência, textos de erro) com testes em `src/lib/dp/__tests__/`; hooks `useDpOcorrencias`, `useDpOcorrenciasDia`, `useDpOcorrenciasConfig`, `useDpOcorrenciasIndicadores`, `useMinhasOcorrencias`; página `src/pages/dp/DpOcorrencias.tsx`; componentes em `src/components/dp/ocorrencias/` (cartão, diálogos de registro, confirmação, classificação, tratativa e cobertura, painel de pendências), reaproveitando `DpStatusBadge`, `MotivoDialog`/`RecusaDialog` e o cadastro rápido de Mão de Obra Extra; ações rápidas em `DpMeuHome.tsx`/`DpMeuEscala.tsx`; integração em `DpOperacaoPanorama.tsx` e `useDpOperacaoPanorama.tsx`; aba no perfil via `ColaboradorFichaDialog`; item "Ocorrências" no grupo Rotina de `src/config/dpNavigation.tsx` e rota em `src/App.tsx`.

# Pré-Admissão pelo Candidato — Relatório do Incremento 1 (Backend)

Status geral da fase: **EM ANDAMENTO**. Este incremento entrega apenas o backend
(schema, RLS/grants, funções de servidor, regras e testes). Frontend, integração
com Colaboradores/Pendências, pacote para contabilidade e QA desktop/mobile
ficam para o incremento seguinte. Nada foi publicado.

## 1. Fase executada
Pré-Admissão pelo Candidato — camada de dados e de servidor. Nenhuma outra fase
foi iniciada. Cadastro Manual e Importar Ficha não foram alterados (nenhum
arquivo desses fluxos foi tocado).

## 2. Modelo de dados (aplicado)
Tabelas novas em `public`, todas com `company_id`, RLS e GRANTs:

| Tabela | Papel |
| --- | --- |
| `dp_preadmissoes` | Staging da ficha: candidato, WhatsApp, cargo/unidade previstos, `trabalho_apos_22h`, `status`, `dados` (candidato) e `admin_dados` (gestor), `colaborador_id` (efetivação) |
| `dp_preadmissao_convites` | `token_hash` único, `expires_at`, `revoked_at`, `last_sent_at` |
| `dp_preadmissao_pessoas` | Dependentes e familiares do Sesc na mesma linha (`finalidade_dependente`, `finalidade_sesc`), com RG |
| `dp_preadmissao_documentos` | Arquivo por requisito e titular, versão e `substituido_em` (histórico preservado) |
| `dp_preadmissao_eventos` | Auditoria sanitizada da pré-admissão |
| `dp_requisito_cargos` / `dp_requisito_unidades` | Requisito documental ligado ao Cargo/Unidade canônicos (nunca pelo nome do cargo) |

Legado preservado: `dp_doc_req_aplica_chk` foi **ampliado** (novos valores
`cargo`, `unidade`, `estado_civil_solteiro`, `dependente_ate_5`,
`dependente_6_14`, `dependente_ate_14`, `sesc`). As faixas ≤5 / 6–14 valem só
neste fluxo; `src/lib/dp/documentos-requisitos.ts` continua intacto.

Regras de integridade no banco: `status` restrito à lista dos 12 estados;
`concluido` exige `colaborador_id`; índice único parcial garante **um único
colaborador por pré-admissão**; um único documento vigente por requisito e
titular; documento limitado a 20 MB; pessoa precisa de ao menos uma finalidade.

## 3. RLS, grants e promoção
- Todas as tabelas: `private.is_company_admin_or_owner(auth.uid(), company_id) OR public.is_super_admin(auth.uid())`, em USING e WITH CHECK. Nenhuma política para `anon`.
- GRANTs explícitos para `authenticated` (somente leitura em eventos) e `service_role`.
- `dp_preadmissao_guard()` (trigger, SECURITY DEFINER, EXECUTE revogado de public/anon/authenticated): recusa cargo, unidade ou colaborador de outra empresa.
- `dp_preadmissao_efetivar(preadmissao, colaborador)`: `FOR UPDATE` na linha, exige administração da empresa, **só aceita status `registro_recebido`** (ou seja, somente depois da ficha oficial recebida e conferida), é idempotente (retorna `ja_aplicado`), revalida o bloqueio de menor + 22h no servidor, copia dependentes sem duplicar e vincula os documentos ao colaborador **sem copiar arquivos**.

## 4. Funções de servidor (implantadas)
- `dp-preadmissao-convite` — criar / reenviar / revogar. Exige dono ou administrador; valida cargo e unidade da empresa; WhatsApp normalizado (país+DDD); token aleatório de 32 bytes, gravado só como SHA-256; validade padrão 7 dias, configurável (1–60) e renovável no reenvio (o convite anterior é revogado).
- `dp-preadmissao-publica` — ler / salvar / enviar, sem login. Empresa vem sempre do convite validado; allowlist estrita de campos (`CAMPOS_CANDIDATO`); rate limit por IP; mensagens sem detalhe técnico; ao enviar valida obrigatórios e documentos e responde "Seus dados e documentos foram enviados para análise da empresa."
- `dp-preadmissao-arquivo` — upload do candidato e URL temporária para o gestor. Bucket **privado** `dp-documentos`; caminho montado pelo servidor (`empresa/preadmissao/ficha/...`); MIME restrito a JPG/PNG/WEBP/HEIC/PDF; máximo 10 MB; titular validado como pessoa daquela ficha; versão anterior marcada como substituída; leitura só por administrador da mesma empresa, com link de 120 s.
- `dp-preadmissao-gestor` — ler (ficha + checklist + pendências + bloqueio + eventos), solicitar correção, salvar dados administrativos, alterar cargo/unidade/22h previstos (recalcula o checklist sem apagar arquivos), preparar para contabilidade e avançar situação em transições permitidas.

## 5. Bloqueio de menor + trabalho após as 22h
Regra única em `supabase/functions/_shared/preadmissao-checklist.ts`
(`bloqueioMenorNoturno`): `bloqueado` para menor de 18, `pendente` quando falta
data de nascimento, `ok` nos demais casos. Não existe caminho de override em
nenhuma função. O bloqueio é aplicado ao preparar para a contabilidade e
revalidado dentro de `dp_preadmissao_efetivar`.

## 6. Checklist documental
Fonte única no mesmo módulo: gerais (identidade com CPF ou CNH, carteira de
trabalho, foto 3x4, título, CNS, comprovante de endereço) + requisitos do Cargo
e da Unidade + condicionais da pessoa (certidão conforme estado civil,
reservista) + dependentes (RG e CPF até 14, vacina até 5, declaração escolar
6–14) + Sesc (RG, CPF, foto), sem duplicar quem é dependente e familiar.

## 7. Validações executadas
| Verificação | Resultado |
| --- | --- |
| Migrations aplicadas | 2 migrations, sucesso |
| `deno check` das 4 funções | sem erros |
| Implantação das 4 funções | sucesso |
| Typecheck do projeto (`tsgo --noEmit`) | sem erros |
| `src/test/unit/preadmissaoRegras.test.ts` | 16 testes, todos passando |
| `src/test/rls/preadmissao.rls.test.ts` | 16 testes, todos passando |
| Bateria de integridade no banco (dados fictícios, transação desfeita) | T0–T9 todos verdadeiros |

Bateria de banco (todas recusadas como esperado, nada gravado): cargo de outra
empresa, colaborador de outra empresa, `concluido` sem colaborador, status
inválido, promoção sem sessão autenticada, arquivo acima do limite, segunda
versão vigente do mesmo documento, pessoa sem finalidade. Status inicial
observado: `aguardando_preenchimento`.

Nenhum teste usa dado real de candidato; nenhum log grava token, CPF completo ou
arquivo.

## 8. Limites deste incremento
Não implementado ainda: telas do candidato e do gestor, aba de Pré-Admissões em
Colaboradores, pendência canônica e notificação, pacote para contabilidade,
conferência com Importar Ficha, verificação de duplicidade de CPF na efetivação
pela tela, QA desktop/mobile nas resoluções pedidas.

## 9. Rollback deste incremento (não destrutivo)
1. Remover as 4 funções implantadas (`dp-preadmissao-*`) e os arquivos em `supabase/functions/`.
2. Remover os arquivos de teste `src/test/unit/preadmissaoRegras.test.ts` e `src/test/rls/preadmissao.rls.test.ts`.
3. Banco: **não** apagar tabelas com conteúdo. Fazer inventário primeiro (`select count(*)` em cada tabela nova). Havendo qualquer linha, apenas revogar grants e manter os dados. Estando tudo vazio, o SQL de reversão está comentado no final da migration da fase.
4. `dp_doc_req_aplica_chk` só volta ao formato antigo se nenhum requisito usar os novos valores.

## 10. Bloqueio técnico real
Nenhum. O incremento seguinte pode começar pelo frontend.

## Incremento 2 — correções da revisão do commit f276cab

Cada item abaixo saiu de um risco apontado na revisão e tem comportamento verificado.

| Risco apontado | Correção aplicada |
| --- | --- |
| Candidato salvava/enviava após revisão | `candidatoPodeEditar` (estados: aguardando_preenchimento, em_preenchimento, correcao_solicitada, aguardando_nova_versao); `salvar`, `enviar` e `upload` devolvem 409 fora deles |
| Upload não travava fases posteriores | Trava também no banco: `dp_preadmissao_documento_registrar` recusa com `fase_encerrada` |
| Whitelist filtrava em silêncio (req. 70) | `camposNaoPermitidos` rejeita o pedido com 400 e lista os campos indevidos |
| `salvar`/`alterar_previsto` respondiam com estado velho | `carregar()`/`montar()` releem a ficha, pessoas e documentos do banco |
| Gravações ignoravam `error` | Todas as gravações checam retorno; pessoas, transições e documentos falham explicitamente |
| Pessoas apagadas fisicamente | Coluna `removido_em`: remoção lógica, titular e histórico dos documentos preservados |
| Preparar contabilidade sem mínimos e aceitando correção pedida | `PODE_PREPARAR` sem `correcao_solicitada`; exige mínimos da ficha e administrativos (admissão, regime, salário, forma de pagamento, jornada) |
| Upload confiava no MIME do cliente | `tipoRealDoArquivo` confere assinatura (PDF/JPG/PNG/WEBP/HEIC); extensão vem do tipo real |
| Upload aceitava código/titular arbitrários | Só passa item presente no checklist recalculado, com o mesmo titular vigente |
| Troca de versão sem atomicidade | Substituição + nova versão + evento em uma transação travada (RPC); falha remove o arquivo já enviado |
| Requisito personalizado barrado por `DOCUMENTOS[codigo]` | Validação passou a usar o checklist (cargo/unidade/empresa), não o catálogo fixo |
| Escrita direta contornando transições | `REVOKE INSERT/UPDATE/DELETE` de `authenticated` e `REVOKE ALL` de `anon` nas 5 tabelas (+ requisitos) |
| Validação de conteúdo ausente | CPF com dígitos verificadores, e-mail, datas reais, nascimento futuro/improvável/idade mínima, sexo e estado civil por lista, UF/CEP/PIS |
| Reservista improvisado como regra universal | Só entra no checklist quando a empresa configurou o requisito (e então por sexo/idade) |
| Faixas de filhos aplicadas a qualquer parentesco | Faixas ≤5 / 6–14 / ≤14 só para filiação (filho, enteado, tutelado, menor sob guarda) |
| Menor + 22h contornável pela configuração legada | `dp_validar_jornada_menor`: idade mínima, noturno e insalubre passaram a ser absolutos; `exige_validacao_menor` só afeta regras de norma coletiva. Promoção revalida por conta própria |
| Concorrência em transições e save/upload | `dp_preadmissao_transicionar` e `dp_preadmissao_documento_registrar` com `SELECT ... FOR UPDATE` e estado esperado |
| Retorno da ficha oficial era só mudança de situação | `marcar_status` não leva a `registro_recebido`; nova ação `ficha_oficial` exige arquivo + conferência (`ficha_oficial_conferida_em/por`), e `dp_preadmissao_efetivar` bloqueia sem os dois |

### Evidências
- `deno check` das 4 funções: OK. `tsgo --noEmit`: OK.
- `src/test/unit/preadmissaoEndurecimento.test.ts` (13 testes) + regras (16) + RLS/funções (16): 45 passaram.
- Bateria SQL transacional (T1–T6, com ROLLBACK, dados fictícios): estado esperado errado não grava; versão 1 → 2 com uma só vigente; titular removido rejeitado; fase encerrada rejeitada; promoção sem ficha oficial conferida falha.
- Grants conferidos: `authenticated` só com SELECT, `anon` sem nenhum privilégio.

### Rollback
Cada migração deste incremento traz o bloco de rollback comentado no próprio SQL (remoção das duas RPCs, devolução dos grants e das colunas). Nenhum passo apaga dados.

### Falta (fora deste incremento)
Frontend do gestor e página pública, integração de Pendências/notificações, pacote da contabilidade legível e reuso de Importar Ficha, checagem de duplicidade CPF/recontratação na promoção pela tela, testes de interface e QA nas resoluções combinadas.

## Incremento 3 — complemento da revisão SQL (integridade, RLS e promoção atômica)

### Migrations aplicadas (todas com bloco de rollback comentado no próprio SQL, sem apagar dados)
1. **Integridade composta e anti-cascata** — `UNIQUE (id, company_id)` em `dp_preadmissoes`, `dp_documento_requisitos` e `UNIQUE (id, preadmissao_id, company_id)` em `dp_preadmissao_pessoas`; FKs de `dp_preadmissao_pessoas`, `_documentos`, `_eventos` e `_convites` passaram a ser `(preadmissao_id, company_id) → dp_preadmissoes(id, company_id) ON DELETE RESTRICT`; documento de familiar usa `(pessoa_id, preadmissao_id, company_id)`; `dp_requisito_cargos`/`dp_requisito_unidades` usam `(requisito_id, company_id)` e `(cargo_id|unidade_id, company_id)`. Triggers `BEFORE DELETE` em todas as tabelas de pré-admissão bloqueiam exclusão física (escape explícito de manutenção: `SET LOCAL dp.permitir_exclusao_preadmissao = 'on'`).
2. **Cliente somente leitura** — policies `FOR ALL` substituídas por `FOR SELECT`; `REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` de `authenticated`, `REVOKE ALL` de `anon`, `GRANT ALL` a `service_role`. Status, token, conferência e metadados só mudam pelas RPCs de transição.
3. **Promoção atômica** — colunas `vinculo_admissao_em` e `ficha_importacao_item_id` (FK composta com `dp_ficha_importacao_itens`); índice único global `dp_preadm_colaborador_uk` substituído por `dp_preadm_colab_admissao_uk (colaborador_id, vinculo_admissao_em)`, liberando recontratação futura; `dp_preadmissao_efetivar(pa, colaborador, item)` agora exige CPF idêntico (11 dígitos, comparação por dígitos), ficha oficial vigente e não recusada + `ficha_oficial_conferida_em`, e opcionalmente valida o item de importação aplicado àquele colaborador; documentos passam a preservar titular/finalidade/origem na descrição, entram como `pendente` (só `aprovado` se aprovado na pré-admissão) e **recusados não são copiados**; nova RPC `dp_preadmissao_efetivar_com_ficha(...)` aplica `dp_ficha_aplicar` **ou** `dp_recontratar_colaborador` e conclui a pré-admissão na mesma transação, com `pg_advisory_xact_lock` + `FOR UPDATE`, idempotência e bloqueio de CPF com colaborador ativo.
4. **Limpeza** — assinatura antiga `dp_preadmissao_efetivar(uuid, uuid)` (sem conferência de CPF) removida; `EXECUTE` revogado de `PUBLIC`/`anon` nas novas funções. Linter voltou ao baseline de 234 avisos pré-existentes (nenhum novo).

### Testes SQL executados (dados fictícios, sempre com ROLLBACK)
| Teste | Resultado |
| --- | --- |
| T2 familiar com empresa diferente da ficha | bloqueado (`dp_preadm_pessoa_pre_fk`) |
| T3 documento com titular de outra ficha | bloqueado (`dp_preadm_doc_pessoa_fk`) |
| T4/T4b DELETE de familiar e de ficha | bloqueado pelo trigger |
| T5 exigência documental com cargo de outra empresa | bloqueado (`dp_req_cargo_cargo_fk`) |
| T6 efetivar sem ficha oficial conferida | bloqueado |
| T7 efetivar com CPF divergente | bloqueado |
| T8 efetivação correta | 1 dependente e 2 documentos (recusado ignorado), titular/finalidade preservados, ambos `pendente` |
| T9 segunda chamada | idempotente (`ja_aplicado: true`, 0 gravações) |
| T10 nova pré-admissão do mesmo colaborador em outra admissão | permitido |
| T11 mesmo colaborador na mesma admissão | bloqueado (`dp_preadm_colab_admissao_uk`) |
| T12 promoção com ficha de CPF diferente | bloqueada |
| T13–T16 sessão `authenticated` (dono da empresa) | lê a ficha; alterar status, alterar token e apagar familiar → `permission denied` |

Concorrência: garantida por `pg_advisory_xact_lock` na ficha, `SELECT ... FOR UPDATE` na ficha e no colaborador, verificação de estado esperado nas transições e pelo índice único de vínculo — evidenciada por T9 (idempotência) e T11 (segunda gravação recusada).

### Observação de compatibilidade
O frontend do gestor (ainda não construído) deve ler diretamente e escrever apenas via Edge Functions/RPCs; nenhum código atual chamava a assinatura removida.

## Incremento 4 — Telas (gestor, candidato e pendências)

- Rotina `dp-preadmissao-gestor`: nova ação `listar` (empresa autorizada pelo servidor,
  validade do convite vigente) e `avaliar_documento` (aprovar/recusar com motivo obrigatório,
  recusa exige justificativa, versão substituída não pode ser avaliada, evento registrado).
- `src/hooks/dp/useDpPreadmissoes.ts`: leitura da lista/detalhe, convite (criar/renovar/cancelar),
  ações de revisão, abertura de documento por URL assinada e anexo da ficha oficial conferida.
  Mensagens de erro sempre vêm da rotina do servidor (nunca texto técnico do invoke).
- `/dp/colaboradores/pre-admissoes` (`DpPreadmissoes.tsx`): lista com busca, situação, cargo/unidade,
  validade do link, gerar novo link (invalida o anterior) e cancelar. Cartões no celular, tabela no desktop.
- `PreadmissaoConviteDialog`: cria o convite (validade padrão 7 dias, renovável), mostra o link uma
  única vez e oferece envio pelo WhatsApp.
- `PreadmissaoRevisaoDialog`: dados do candidato, familiares (dependente/Sesc), documentos com
  visualização e análise, pendências, aviso de bloqueio (menor de 18 + após 22h), dados administrativos,
  pedido de correção, preparar/enviar à contabilidade, anexar e conferir a ficha oficial e, só em
  `registro_recebido`, "Conferir Dados E Criar Cadastro" → Importar Ficha com `?preadmissao=`
  (conclusão atômica por `dp_preadmissao_efetivar_com_ficha`).
- `/pre-admissao` (`PreAdmissao.tsx`): página pública em etapas (dados, contato, endereço, documentos e
  registros, familiares, envio de arquivos), retomada pelo mesmo link, upload por foto, mensagens claras
  para link inválido/expirado/fase encerrada; `noindex`.
- Pendências: `useDpPendencias` passou a listar pré-admissões em `aguardando_revisao`,
  `aguardando_nova_versao`, `pronto_contabilidade` e `registro_recebido`, com a ação esperada.

### Verificações
- `npx tsgo --noEmit` sem erros; 29 testes unitários de regras verdes.
- QA real no navegador: `/pre-admissao` com link inválido em 390×844 e 1366×768 (mensagem amigável,
  sem erro de console) e `/dp/colaboradores/pre-admissoes` autenticado em 390×844 e 1440×900
  (item no menu, lista vazia com orientação, sem erros de console).
- Nada publicado. Rollback do incremento: remover rota/itens de tela; o banco não mudou nesta etapa.

### Ainda pendente
- Testes de integração das telas (critérios 110–123), aviso/notificação no sino, aviso de CPF já
  cadastrado antes do convite e QA nas demais resoluções combinadas.

## Incremento 5 — Concorrência na ficha do candidato

Revisão atendida (código 3c3195): gravação de dados + familiares/remoções acontecia fora da transição.

### Banco (migração com rollback documentado no próprio SQL)
- `dp_preadmissoes.versao` (integer, default 1) como controle otimista; `dp_preadmissao_documento_registrar`
  e a avaliação de documento também incrementam a versão.
- `dp_preadmissao_salvar_candidato(...)`: advisory lock por ficha + `SELECT ... FOR UPDATE`; confere estado
  editável e versão esperada; grava dados, campos derivados, familiares (insert/update) e remoções lógicas
  numa única transação. Valida nome, parentesco (lista fechada), finalidade dependente/Sesc, parentesco
  elegível ao Sesc, CPF, data ISO real, nascimento futuro/impossível e recusa `UPDATE` de 0 linhas
  (familiar de outra ficha/empresa) com `pessoa_desconhecida`.
- `dp_preadmissao_enviar(...)`: só a partir dos estados editáveis e com a versão conferida sob lock.
- `dp_preadmissao_transicionar_versionado(...)`: transição com lock + versão esperada.
- `dp_txt_norm` passou a normalizar sublinhado (o formulário grava `menor_guarda`); `normaliza()` do
  checklist idem, e a lista de filiação aceita as duas grafias.
- Todas as funções: `REVOKE` de `anon`/`authenticated`, `EXECUTE` só para `service_role`.

### Edge Functions (reimplantadas)
- `dp-preadmissao-publica`: `carregar` devolve a versão; `salvar` recusa chave estranha na raiz
  (`CAMPOS_RAIZ_CANDIDATO`), em `dados` e em cada familiar (`familiar N: campo`) e grava por
  `salvarCandidato`; `enviar` usa `enviarFicha` com a versão lida, nunca o status recebido do cliente;
  409 para fase encerrada/versão alterada/familiar desconhecido, 400 para conteúdo inválido.
- `dp-preadmissao-gestor`: `salvar_admin`, `alterar_previsto` e `avaliar_documento` passam por
  `transicionarComVersao`; `preparar_contabilidade` exige a versão conferida e responde 409
  ("A ficha mudou enquanto você conferia. Recarregue e confira novamente.").

### Verificações
- Testes no banco: 11 casos de validação + 3 provas de concorrência real com duas sessões
  (`docs/security/preadmissao-concorrencia.report.json`, SQL em `preadmissao-concorrencia.sql`),
  em Postgres 17.9 local descartável com réplica mínima e as definições reais das funções; nenhum dado
  real tocado. Destaques: envio concorrente ficou 3,03 s bloqueado no lock e foi recusado por versão
  alterada; salvar após o envio recusado por fase encerrada; de duas gravações simultâneas com a mesma
  versão, uma gravou e a outra foi recusada.
- 36 testes unitários verdes (novo `preadmissaoConcorrencia.test.ts` com 7), `deno check` nas três
  funções e `npx tsgo --noEmit` sem erros.
- QA no navegador: `/pre-admissao` com link inválido em 390×844 e 1366×768 (mensagem amigável).
- Linter do banco: 234 avisos, os mesmos de antes da migração (nenhum novo).
- Nada publicado. Rollback: restaurar as versões anteriores das três funções (o SQL antigo está no
  histórico de migrações) e remover a coluna `versao` não é necessário — ela é aditiva e sem efeito
  se as funções antigas voltarem.

### Ainda pendente
- Testes de integração das telas, aviso de CPF já cadastrado antes do convite e QA nas demais resoluções.

## Incremento 6 — Recontratação no caminho de conclusão

### Achado (revisão do caminho feliz)
Na migração `20260917000527`, o ramo de recontratação de `dp_preadmissao_efetivar_com_ficha`
chamava `dp_recontratar_colaborador` mas **não vinculava o item da importação** ao colaborador.
Em seguida, `dp_preadmissao_efetivar(pa, colab, p_item_id)` exige item da mesma empresa com
`status in ('criado','atualizado')` e `colaborador_id` correspondente — logo, toda conclusão por
recontratação falhava e a transação era revertida. Consolidado com a revisão de `salvar`+`enviar`
(incremento 5): as duas correções tratam a mesma classe de risco — mutação fora do escopo
validado/travado da transição.

### Correção (migração nova, sem alterar dados)
Ordem em `dp_preadmissao_efetivar_com_ficha`, agora com **toda validação antes de qualquer mutação**:
1. ficha, permissão, lock por pré-admissão, idempotência, status `registro_recebido` + ficha oficial
   conferida, CPF da pré-admissão igual ao CPF da ficha conferida;
2. item da importação: existe, é da **mesma empresa**, o CPF extraído (quando houver) é o mesmo,
   não foi aplicado a **outro** colaborador e não aponta para outro cadastro;
3. colaborador existente pelo CPF: ativo → recusa; ex-colaborador → checa que a nova admissão é
   posterior ao desligamento (mensagem clara, antes de escrever qualquer coisa).
Só então muta, na mesma transação: item passa a apontar para o cadastro existente →
`dp_ficha_aplicar(..., p_atualizar_existente := true)` aplica os **dados pessoais conferidos** e
vincula o item (`status = 'atualizado'`, `colaborador_id`) → `dp_recontratar_colaborador` grava o
**novo vínculo administrativo** (admissão, cargo, unidade, setor, salário, regime, forma de
pagamento, histórico canônico) → `dp_preadmissao_efetivar` conclui e leva familiares e documentos.

### Teste do caminho feliz (importação sintética válida)
`supabase/tests/dp_preadmissao_recontratacao.sql`, executado no banco com fixtures fictícias
(`*@example.test`) e **encerrado com erro proposital** — a transação é abortada, nada persiste.
Resultado: `modo = recontratacao`, `documentos = 1`, colaborador do CPF reativado com
`data_admissao = 2026-09-20`, `data_desligamento = null`, `nome_mae` conferido preservado,
`salario_base = 2500`, histórico de condições com vigência na nova admissão, item da importação
`atualizado` e vinculado, pré-admissão `concluido` com `ficha_importacao_item_id` e
`vinculo_admissao_em`.

### Prova de implementação × teste simultâneo (correção do relatório)
- **Prova de implementação (sequencial):** a segunda chamada da mesma rotina devolveu
  `ja_aplicado = true` (idempotência). Chamadas sequenciais e índices únicos **não** são teste de
  concorrência — passam a ser descritos assim em todo o relatório.
- **Teste simultâneo real (duas sessões concorrentes):** feito para `salvar`/`enviar` da ficha do
  candidato (incremento 5, `docs/security/preadmissao-concorrencia.report.json`: lock de 3,03 s,
  recusa por versão alterada e por fase encerrada). Para `dp_preadmissao_efetivar_com_ficha` a
  proteção implementada é `FOR UPDATE` na pré-admissão + `pg_advisory_xact_lock` por ficha +
  `FOR UPDATE` no item e no colaborador; o teste com **duas sessões simultâneas** desse caminho
  segue **pendente** (exige banco descartável com réplica das tabelas da importação).

### Interface
- Conclusão pela conferência da ficha oficial devolve o modo; quando é recontratação, a tela avisa:
  "Recontratação registrada: o cadastro anterior foi reativado com um novo vínculo e os dados
  conferidos." A lista de pré-admissões é recarregada junto.
- 36 testes unitários verdes, `npx tsgo --noEmit` sem erros, linter do banco com os mesmos 234 avisos
  pré-existentes. Nada publicado.

### Rollback
Recriar a versão anterior de `dp_preadmissao_efetivar_com_ficha` (SQL na migração
`20260917000527`). Nenhuma coluna, índice ou dado é alterado por esta correção.

### Ainda pendente
- Teste de concorrência simultânea da efetivação com ficha; testes de integração das telas;
  aviso de CPF já cadastrado antes do convite; QA nas demais resoluções.

## Incremento 7 — Consolidação da fila de revisões, telas e pacote da contabilidade

### Backend (validação real: `deno check` + 36 testes unitários + typecheck)
- `preparar_contabilidade` aceita **apenas** `aguardando_revisao`; `aguardando_nova_versao` foi
  removido (o candidato ainda pode editar nesse estado). A tela seguiu a mesma regra.
- `montar()` lê a ficha do banco **antes** dos requisitos, então cargo/unidade recém-alterados
  valem imediatamente no checklist (nunca `pa` em memória). Idem no `carregar` da ficha pública.
- `salvar_admin` e `alterar_previsto`: recusam fichas encerradas (`concluido`, `cancelado`,
  `expirado`) com 409; validam allowlist (`CAMPOS_ADMIN`), tipos, faixas de salário, enums de
  regime/forma de pagamento e referências canônicas (cargo/unidade/setor da própria empresa);
  releitura da ficha fresca antes da transição versionada.
- **Anexar ≠ conferir:** `dp-preadmissao-arquivo/ficha_oficial` apenas anexa e registra
  `ficha_oficial_recebida`. A conferência virou ação própria do gestor
  (`conferir_ficha_oficial`), que exige `confirmado = true`, documento vigente
  `ficha_oficial` da mesma ficha/empresa, grava `ficha_oficial_conferida_em/por` e o evento
  `ficha_oficial_conferida`. Nada é conferido automaticamente pelo upload.
- Novo `url_candidato` em `dp-preadmissao-arquivo`: o candidato revê os **próprios** arquivos por
  URL temporária (120 s) autenticada pelo convite; a ficha oficial (documento interno da
  contabilidade) é negada.
- `cpf_existente` no retorno da revisão: aviso (não bloqueio) quando o CPF já existe na empresa,
  distinguindo cadastro ativo de ex-colaborador (recontratação).
- Aviso interno no sino: ao enviar a ficha, o candidato gera `dp_notificacoes`
  (`preadmissao_enviada`, `para_admins`), com falha silenciosa para não invalidar o envio.
  Migration apenas adiciona o valor ao tipo de notificação; rollback = parar de gerar o aviso
  (o valor permanece sem uso, nada é removido).

### Frontend (QA real em 390×844, 1366×768 e 1440×900)
- Revisão: botões distintos "Anexar Ficha Oficial" / "Abrir Ficha Oficial" / "Registrar
  Conferência"; aviso de CPF já cadastrado; campos canônicos do DP nas informações administrativas.
- "Imprimir Pacote Da Contabilidade": folha imprimível com dados do candidato, informações
  administrativas, familiares e documentos vigentes.
- Ficha do candidato: link "Ver o que você enviou" por arquivo e aviso quando um documento foi
  recusado.
- QA: lista `/dp/colaboradores/pre-admissoes` autenticada nas três resoluções (item no menu, estado
  vazio orientando o convite) e `/pre-admissao` com link inválido ("Link Indisponível", mensagem
  amigável). Sem erros de console além dos avisos de `forwardRef` pré-existentes do App.

### Item 124 — situação
- **Validado de verdade:** regras/checklist/bloqueios (36 testes unitários), isolamento e negação
  por RLS (`docs/security/preadmissao-isolamento.report.json`), concorrência simultânea de
  `salvar`/`enviar` (`docs/security/preadmissao-concorrencia.report.json`), caminho feliz de
  admissão nova e de recontratação em banco descartável, `deno check`, `tsgo`, QA de tela.
- **Não executado:** teste com duas sessões simultâneas de `dp_preadmissao_efetivar_com_ficha`
  (proteção implementada com `FOR UPDATE` + advisory lock, mas sem prova simultânea); testes
  automatizados de integração das telas (o QA foi manual pelo navegador).
- **Pendente de produto:** e-mail/WhatsApp automático do convite (hoje o link é copiado ou enviado
  pelo WhatsApp manualmente) e publicação do frontend (não autorizada).

## Incremento 8 — Conferência da ficha oficial contra o staging + auditoria do Storage

### Comparação com o staging revisado (não com o cadastro)
- Nova fonte única `src/lib/dp/preadmissao/comparacaoFicha.ts`: mapa de campos comparáveis entre a
  ficha lida (`dados_extraidos`, com endereço em objeto) e os dados JÁ CONFERIDOS da pré-admissão
  (`dp_preadmissoes.dados`), comparação tolerante (caixa/acento/pontuação), lista de divergências,
  divergências sem decisão e montagem dos dados que vão ao cadastro.
- Regra aplicada: **o conferido é a referência**. A ficha só substitui um campo quando o gestor
  escolhe explicitamente "Ficha oficial" naquele campo. Campo vazio na ficha é completado com o
  conferido; nada é sobrescrito em silêncio.
- `FichaRevisaoCard` (com `preadmissaoId`) lê a pré-admissão pelo painel do gestor, exibe a seção
  "Conferência com a pré-admissão" com um par de botões por divergência (`aria-pressed`), bloqueia
  a conclusão enquanto houver divergência sem decisão e recusa concluir sem os dados conferidos
  carregados.
- Caminho **"Somente anexar a ficha"**: conclui mantendo todos os valores conferidos (nenhum campo
  alterado) e, quando já existe cadastro do CPF, envia `p_campos = []`, de modo que a rotina do
  banco não grava coluna nenhuma. Nenhum cadastro é criado antes da conferência da ficha oficial —
  a rotina continua exigindo `ficha_oficial_conferida_em`.

### Validação real
- `src/test/unit/preadmissaoComparacaoFicha.test.ts` — 7 testes verdes: equivalência tolerante,
  divergências reais, manutenção do conferido sem escolha, troca só no campo escolhido, "somente
  anexar" ignorando escolhas, preenchimento do campo ausente na ficha e lista de pendências.
- `tsgo` sem erros.

### Auditoria das policies reais de `storage.objects` (bucket `dp-documentos`)
Consulta em `pg_policies` (estado real do banco), avaliada para o prefixo
`{company_id}/preadmissao/{preadmissao_id}/…`:
- `dp_doc_bucket_read_autorizado` (SELECT, `authenticated`): libera quem é dono/admin da empresa do
  primeiro segmento do caminho, ou super admin; o ramo do colaborador exige `dp_documentos` com
  `colaborador_id = dp_colaborador_ativo_of(auth.uid())`, o que **não existe** para arquivos de
  pré-admissão. Resultado: membro autenticado da mesma empresa **sem** papel de dono/admin não lê os
  arquivos do candidato.
- `dp_doc_bucket_colab_insert` (INSERT): exige que o **segundo** segmento seja o id do colaborador
  ativo do próprio usuário; em pré-admissão esse segmento é o literal `preadmissao`, então nunca
  casa — nenhum membro consegue gravar dentro do prefixo. O upload do candidato continua sendo feito
  pela função `dp-preadmissao-arquivo` (service role, caminho montado no servidor).
- `dp_doc_bucket_admin_write` (ALL): escrita/remoção restrita a dono/admin da empresa do caminho.
- Conclusão: bucket privado **mais** as policies acima restringem leitura/escrita ao gestor
  autorizado da própria empresa; o candidato só alcança os próprios arquivos por URL temporária de
  120 s emitida pela função e autenticada pelo convite.
- Observação (pré-existente, fora do escopo desta fase): `dp_doc_bucket_read_autorizado` faz
  `split_part(name,'/',1)::uuid`, que só é seguro porque os caminhos legados de prefixo `documentos/`
  são atendidos pela policy própria.

### O que ainda NÃO foi testado (declaração honesta)
- Teste HTTP/Storage com sessões reais A/B/sem permissão: **não executado**. A auditoria acima é
  leitura das policies reais em produção do projeto, não um teste de download/list/write com três
  sessões; e o banco descartável usado nos incrementos anteriores **não** exercita HTTP nem Storage
  (é clone de SQL apenas).
- Teste com convite sintético válido + sessão de gestor percorrendo preenchimento, upload, retomada,
  correção, contabilidade e importação: **não executado**. O QA de tela feito até aqui cobriu a lista
  autenticada e a página de link inválido, o que **não** comprova formulário nem painel.
- Teste simultâneo (duas sessões) de `dp_preadmissao_efetivar_com_ficha`: **não executado**;
  a proteção (`FOR UPDATE` + advisory lock + idempotência) está implementada e provada apenas por
  chamadas repetidas em sequência, que não valem como concorrência.

## Incremento 9 — Revisão do commit d5c25a6 (atomicidade, versão na chamada real, análise de documento)

### Correções aplicadas
1. **Gravação parcial de familiares eliminada.** `dp_preadmissao_salvar_candidato` confere TODOS os
   familiares antes de escrever qualquer linha (PASSO 1 sem escrita, PASSO 2 gravação). Um familiar
   inválido, desconhecido, de outra ficha/empresa ou repetido recusa o pedido inteiro; nada é gravado
   e a versão não sobe.
2. **Defeito real encontrado pelo teste e corrigido.** A conferência do familiar já cadastrado usava
   `SELECT count(*) … FOR UPDATE`, combinação que o Postgres rejeita (`0A000`): toda gravação que
   reenviava um familiar existente falhava. Agora trava a própria linha (`SELECT id … FOR UPDATE`),
   mantendo a exigência de mesma ficha E mesma empresa.
3. **Versão da chamada real.** `dp-preadmissao-publica` (ação `salvar`) lê `versao` do corpo, valida
   que é inteiro não negativo (senão 400 com aviso para recarregar) e repassa como `p_versao_esperada`.
   A tela já enviava a versão que acompanhou os dados; ao receber `versao_alterada` ela recarrega o
   número da versão **sem descartar** o que está preenchido e avisa a pessoa (aviso no topo + toast).
4. **Análise de documento atômica.** `dp-preadmissao-gestor` usa `dp_preadmissao_avaliar_documento`
   (advisory lock + `FOR UPDATE`), que muda situação/motivo e incrementa a versão na MESMA transação;
   não existe mais o intervalo em que um preparo para a contabilidade passava com pendências velhas.
5. **Versão só sobe em transição aceita** (`dp_preadmissao_transicionar_versionado`).
6. **Sesc com avô/avó** alinhado entre tela (`PARENTESCO`) e banco (`c_sesc`).

### Validação real executada
- Teste de comportamento no banco do projeto dentro de uma transação **desfeita ao final** (bloco
  `DO` encerrado com exceção proposital; conferido depois: nenhuma ficha sintética permaneceu):
  - `A0/A1` versão inicial 1; familiar 1 válido + familiar 2 com parentesco inválido →
    `{"ok":false,"motivo":"pessoa_parentesco","indice":2}`, nome do familiar 1 **inalterado**,
    1 familiar, versão **1**, `dados` inalterado (ZERO alterações).
  - `A2` familiar 1 válido + id de OUTRA ficha → `pessoa_desconhecida` índice 2; nada alterado nas
    duas fichas, versão **1**.
  - `A3` gravação válida → `ok:true`, versão 1 → 2 (uma única vez).
  - `B1` avô e avó no Sesc aceitos (3 familiares vivos); `B2` irmão no Sesc → `pessoa_sesc_parentesco`.
  - `C1` recusa de documento → `ok:true`, situação `recusado` + motivo gravados e versão 3 → 4 na
    mesma operação; `C2` motivo curto → `motivo_obrigatorio` e versão inalterada; `C3` documento
    substituído → `documento_substituido` e versão inalterada.
  - `D1` transição inválida → `status_inesperado` e versão inalterada.
- `src/test/unit/preadmissaoContratoVersao.test.ts` (4 testes) prova o contrato da chamada real:
  a versão do navegador chega ao banco como `p_versao_esperada`, ausência vira nulo, `versao_alterada`
  volta com aviso pronto e a análise de documento usa uma **única** chamada de rotina.
- 18 testes verdes nas suítes de pré-admissão executadas; `deno check` nas quatro funções da
  pré-admissão e `tsgo` sem erros; linter do banco no mesmo patamar de antes (234 avisos
  pré-existentes, nenhum novo).

### Rollback não destrutivo
Restaurar as versões anteriores das funções `dp_preadmissao_salvar_candidato`,
`dp_preadmissao_transicionar_versionado` e deixar de chamar `dp_preadmissao_avaliar_documento`
(a rotina permanece sem uso). Nenhum dado é alterado ou apagado.

### O que continua NÃO testado
- Teste HTTP real da rotina pública `salvar` com convite válido (contrato coberto por teste unitário,
  não por requisição HTTP ponta a ponta).
- Os três itens já declarados acima: Storage com sessões A/B/sem permissão, ponta a ponta com convite
  sintético e sessão de gestor, e concorrência simultânea da efetivação com ficha.

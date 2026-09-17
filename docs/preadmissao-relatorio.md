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

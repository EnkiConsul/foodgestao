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

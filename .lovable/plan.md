# Diagnóstico — Pré-Admissão pelo Candidato

LEITURA DO PLANO
- Plano integral localizado: SIM
- Marcador final localizado: SIM (`<<< FIM DO PLANO — PRÉ-ADMISSÃO >>>`)
- Fase avaliada: Pré-Admissão pelo Candidato
- Outras grandes fases iniciadas: NÃO
- Implementação nesta mensagem: NÃO (somente diagnóstico, conforme pedido)

## O que já existe e será reaproveitado (verificado no código/banco)

- **Fluxos atuais de cadastro**: `src/pages/dp/DpColaboradores.tsx` já abre `NovoCadastroMetodoDialog` (Cadastro Manual / Importar Ficha) e já usa abas (`DpTabsBar`). Cabe uma terceira opção e uma aba "Pré-Admissões" sem novo item de menu.
- **Importar Ficha**: `src/pages/dp/DpFichaRegistroImportar.tsx` + função `dp-ficha-registro-parse` + tabelas `dp_ficha_importacoes` / `dp_ficha_importacao_itens`. Serve para o retorno da contabilidade; não será criado outro importador.
- **Link seguro sem login**: padrão pronto em `dp_portal_access_tokens` (guarda só `token_hash`, com `expires_at`, `consumed_at`, `claimed_at`), `supabase/functions/_shared/portal-access.ts` e página pública `src/pages/AtivarAcesso.tsx` (`?t=` + `?c=`). Limite de tentativas pronto em `_shared/rate-limit.ts` (`auth_rate_limits`).
- **Autorização de gestor**: `_shared/authz.ts` (`requireColaboradorAdmin`, `requireCompanyAccess`, `canAdminister`) — dono/owner/admin da empresa.
- **Documentos**: bucket **`dp-documentos` é privado** (confirmado em `storage.buckets`); tabelas `dp_documentos` (arquivo, versão, aprovação) e `dp_colaborador_documentos` (vínculo requisito × dependente).
- **Motor de checklist**: `src/lib/dp/documentos-requisitos.ts` + `dp_documento_requisitos` (regra única, já centralizada).
- **Cargos e Unidades canônicos**: `dp_cargos` (com `exige_cnh`, `exige_epi`) e `dp_unidades`.
- **Dependentes**: `dp_dependentes` (nome, nascimento, parentesco, cpf, deficiência...).

## Lacunas reais (bloqueiam parte do escopo sem decisão sua)

1. **Requisito por Cargo e por Unidade não existe.** `dp_documento_requisitos.aplica_a` é um CHECK fechado (`todos, cargo_dirige, veiculo_proprio, veiculo_empresa, menor, regime_pj, regime_clt, estado_civil_casado, exige_epi, dependente, dependente_ate_7, dependente_acima_7, dependente_invalido`). Não há `cargo_id` nem `unidade_id`. Itens 6, 30, 31, 32, 40 exigem vínculo requisito × cargo e requisito × unidade.
2. **Faixas de idade do dependente divergem do documento.** Hoje: até 7 / acima de 7. O documento pede até 5 (vacina) e 6–14 (declaração escolar), e RG+CPF até 14 anos.
3. **Não existe "Familiar para Sesc"** nem campo **RG** em `dp_dependentes`. Precisa de pessoas relacionadas com finalidades múltiplas (dependente e/ou Sesc) sem duplicar a pessoa (itens 46–50).
4. **Nada de pré-admissão existe** (busca por `pre_admissao`/`pré-admiss` não retorna nada). `dp_cadastro_solicitacoes` é outra coisa: pedido interno de cadastro (nome, cpf, cargo texto, status), sem convite, sem documentos, sem staging — não serve como base.
5. **Pendências são materializadas por motor próprio** (`dp_pendencias_config`, `dp_pendencias_materializadas`, função `dp-refresh-pendencias`). Incluir "Pré-Admissão para Revisar" significa entrar nesse motor (decisão de arquitetura).
6. **Sem política de retenção definida** para candidato cancelado/não admitido e convite expirado (item 90). Não implemento exclusão automática sem sua regra.
7. **Checklist operacional do item 34** contém itens que não existem como requisito padrão hoje (SUS, foto 3x4, título de eleitor, licenciamento do veículo, certidão por estado civil solteiro).
8. **Permissões**: não há chave de permissão de Pessoas por módulo; o padrão real do DP é dono/owner/admin. Vou seguir esse padrão (sem inventar recurso novo).

## Decisões que preciso de você antes de implementar

1. **Faixas de idade dos dependentes**: adotar as do documento (≤5 vacina, 6–14 declaração escolar, ≤14 RG+CPF) tornando as faixas configuráveis (`idade_min`/`idade_max` no requisito), mantendo as atuais até/acima de 7 para o que já está em uso? (recomendo sim)
2. **Retenção (LGPD)**: prazo para guardar dados/documentos de candidato cancelado, não admitido e convite expirado. Enquanto não houver regra, nada é apagado automaticamente.
3. **Validade do convite**: sugiro 7 dias, renovável pelo gestor. Confirma?
4. **Quem cria/revisa a Pré-Admissão**: dono, owner e admin da empresa (padrão atual do DP). Confirma?
5. **Pendência do gestor**: entrar no motor de pendências existente (aparece junto das demais) — confirma?
6. **Efetivação**: promover a Pré-Admissão criando o colaborador direto, ou sempre depois da ficha oficial da contabilidade? (o documento admite os dois momentos)

## Caminho de implementação proposto (após suas respostas)

**Banco (migration com rollback)**
- `dp_preadmissoes`: company_id, candidato_nome, whatsapp, email, cargo_previsto_id → `dp_cargos`, unidade_prevista_id → `dp_unidades`, trabalho_apos_22h boolean, dados pessoais em staging (jsonb + colunas canônicas), status (enum com os estados do item 60), timestamps, quem criou/revisou, colaborador_id após efetivação (único).
- `dp_preadmissao_convites`: token_hash, expires_at, revoked_at, reenviado_em (mesmo padrão de `dp_portal_access_tokens`).
- `dp_preadmissao_pessoas`: pessoa relacionada com finalidades (`dependente`, `sesc`) — uma pessoa, várias finalidades; inclui RG.
- `dp_preadmissao_documentos`: requisito, titular (candidato/pessoa relacionada), arquivo no bucket privado, status, versão.
- `dp_preadmissao_eventos`: auditoria sanitizada (item 97).
- `dp_requisito_cargos` e `dp_requisito_unidades`: vínculo do requisito ao Cargo/Unidade; ampliar `aplica_a` para `cargo`, `unidade`, `estado_civil_solteiro` e faixas por idade.
- RLS em todas: leitura/escrita só para dono/owner/admin da empresa (`private.is_company_owner` / vínculo em `company_members`), GRANT para `authenticated` e `service_role`; candidato **não** acessa tabela alguma — nenhum grant para `anon`.

**Edge Functions (service role só no servidor)**
- `dp-preadmissao-convite` (criar/reenviar/revogar — exige gestor autorizado).
- `dp-preadmissao-publica` (validar token, ler ficha, salvar parcial, enviar; rate limit por IP e por token; empresa vem sempre do convite, nunca do payload; campos do gestor rejeitados no servidor).
- `dp-preadmissao-arquivo` (upload e URL temporária; MIME e tamanho validados no servidor; caminho gerado pelo servidor, nunca aceito do cliente).
- `dp-preadmissao-pacote` (ficha legível + documentos para a contabilidade, sem IDs técnicos).

**Frontend**
- `DpColaboradores.tsx`: terceira opção "Enviar Link de Pré-Admissão" e aba "Pré-Admissões" (tabela no desktop, cards no mobile).
- Diálogo de criação (nome, WhatsApp normalizado, Cargo Previsto, Unidade Prevista, trabalho após 22h) + copiar link / abrir WhatsApp.
- Página pública em etapas (mobile-first, uma coluna, salvar e continuar), sem sidebar nem termos técnicos.
- Tela de revisão do gestor: dados, validações, bloqueio de menor + após 22h (sem "ignorar"), solicitar correção, complementar dados administrativos, preparar/baixar pacote, status da contabilidade, e retorno via Importar Ficha (Conferir Dados ou Somente Anexar, sem sobrescrever nada em silêncio).
- Regra única de idade/bloqueio em `src/lib/dp/preadmissao/` reutilizada pelo candidato, pelo gestor e pela validação da jornada definitiva.

**Testes** (a escrever de fato, não espelho da implementação): convite válido/inválido/expirado/revogado; candidato A não abre ficha de B; empresa A não vê pré-admissão de B; payload tentando alterar cargo/unidade/22h; menor + após 22h (casos A–G do item 117); checklist por cargo/unidade e mudança de cargo; dependentes por faixa de idade; Sesc sem duplicar pessoa; efetivação idempotente com duplo clique.

**Rollback**: migration reversa listando tabelas, políticas, enum e índices criados; funções removidas por nome; rotas e arquivos novos apagados; nenhum dado de pré-admissão ou documento apagado sem inventário e sua aprovação.

## Status

**NÃO APROVÁVEL AINDA** — implementação pode começar assim que as 6 decisões acima forem respondidas (as de nº 1, 2 e 6 afetam schema e comportamento e não podem ser assumidas por mim).

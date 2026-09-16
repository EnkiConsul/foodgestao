# Diagnóstico complementar — Pré-Admissão pelo Candidato (sem implementação)

LEITURA DO PLANO
- Plano integral localizado: SIM — Marcador final localizado: SIM
- Fase avaliada: Pré-Admissão pelo Candidato — outras fases: NÃO
- Nada de schema, storage ou código foi alterado nesta etapa.

Decisões já fechadas por você: faixas ≤5 e 6–14 novas para pré-admissão preservando as atuais (até/acima de 7); Pendências canônicas; sem exclusão automática (item 90); convite renovável com padrão 7 dias; permissões conforme padrão canônico verificado abaixo.

## 1. Cadastro manual — pessoal x administrativo

`src/components/dp/ColaboradorFormDialog.tsx` (3.237 linhas) já é organizado em abas: **dados, jornada, remuneracao, dependentes, documentos** (linhas 1770–1825), com indicador de pendência por aba (linha 1030).
- Bloco pessoal reutilizável já isolado: `src/lib/dp/documentos-pessoais.ts` (`DOCUMENTOS_PESSOAIS`, `documentosPessoaisParaBanco`) cobre RG, CTPS, título, reservista, filiação, nacionalidade, naturalidade, raça/cor, grau de instrução, deficiência — exatamente o conjunto que o candidato preenche.
- Bloco administrativo está em componentes separados: `RemuneracaoFields.tsx`, `ColaboradorJornadaPanel.tsx`, `AssiduidadeFields.tsx`, `DependentesPanel.tsx`.
- Consequência prática: a etapa do candidato reaproveita `documentos-pessoais.ts` + validações de CPF/endereço já existentes; nada do bloco administrativo é exposto ao candidato.

## 2. Importador — comparação e "Somente Anexar"

- Comparação real já existe: `src/lib/dp/ficha-registro/payload.ts` → `compararComCadastro()` devolve `DiferencaFicha[]` (`coluna, label, atual, novo, apenasCompleta`) e **só considera colunas em que a ficha trouxe valor** — a ficha nunca apaga cadastro.
- Aplicação é transacional no banco: RPC `dp_ficha_aplicar(p_item_id, p_dados, p_dados_extraidos, p_campos text[], p_atualizar_existente, p_cargo_id, p_unidade_id, p_setor_id, p_turno_id, p_regime, p_forma_pagamento, p_possui_folha_ponto, p_optante_adiantamento, p_jornada)` — retorna `colaborador_id`, `status: criado|atualizado`, `ja_aplicado` (idempotência) e o caminho autoritativo do arquivo, "nunca vem do cliente" (`aplicarFichaRpc.ts`). Existe também `dp_ficha_ignorar`.
- "Somente Anexar" também já existe na prática: `anexarFichaRecorte.ts` recorta as páginas da pessoa do PDF do lote, grava em `${companyId}/${colaboradorId}/ficha-registro-${itemId}.pdf` e trata corrida/duplicidade (`ja_anexado`, código 23505) sem alterar campos.
- Conclusão: o retorno da contabilidade usa `p_campos` (conferir e escolher) ou apenas `anexarFichaRecorte` (somente anexar). Não é preciso novo importador.

## 3. Identidade, duplicidade e recontratação

- `dp_colaboradores`: `UNIQUE (company_id, cpf)` (`dp_colaboradores_company_id_cpf_key`) e `UNIQUE (id, company_id)` — base para detectar CPF já existente por empresa sem varredura global.
- Recontratação canônica: RPC `dp_recontratar_colaborador(p_colaborador_id, p_data_admissao, p_regime, p_forma_pagamento, p_cargo_id, p_unidade_id, p_setor_id, p_salario_base, p_valor_hora, p_matricula, p_justificativa)`, usada por `useRecontratarDpColaborador` (`src/hooks/useDpColaboradores.tsx`), com elegibilidade em `src/lib/dp/desligamento.ts` (`sim | nao | com_ressalvas`).
- Efetivação da pré-admissão seguirá o mesmo desenho de `dp_ficha_aplicar`: uma RPC transacional, com `ja_aplicado` e unicidade `preadmissao_id` no colaborador para nunca gerar dois cadastros (protege duplo clique e concorrência).

## 4. Bloqueio de menor e jornada definitiva — já existe no backend

Trigger `public.dp_validar_jornada_menor()` (SECURITY DEFINER, lida no banco) já barra, na gravação da jornada: menor de 14 (CF 7º XXXIII), menor de 16 fora de aprendizagem (403), **trabalho noturno 22h–5h para menor de 18 (404 CLT / 67 ECA)**, cargo insalubre/perigoso (405), intervalo fracionado (411–413) e carga de aprendiz — respeitando `dp_config_dp.exige_validacao_menor`.
Ou seja, o item 28 (jornada posterior ultrapassa as 22h) já é impedido pelo banco. Falta apenas a validação **antecipada** da pré-admissão (idade + "após 22h" previsto), que será a mesma regra, sem override, e com estado "Validação de Idade Pendente" quando não houver data de nascimento.

## 5. RLS, grants e Storage observados

- Storage é privado em todos os buckets (`storage.buckets`: `dp-documentos`, `dp-disciplinar`, `dp-bulk-import`, `transaction-attachments`, `ped-*` todos `public=false`).
- Padrão canônico de autorização no Storage: primeira pasta = `company_id` e `private.is_company_admin_or_owner(auth.uid(), split_part(name,'/',1)::uuid)` — políticas `dp_doc_bucket_admin_write` (ALL), `dp_doc_bucket_read_autorizado` (SELECT), `dp_doc_bucket_colab_insert` (INSERT, exige que a segunda pasta seja `dp_colaborador_ativo_of(auth.uid())`), `dp_doc_bucket_legacy_read`. Todas com `TO authenticated`; **nenhuma para `anon`**.
- Portanto o candidato (não autenticado) não pode enviar nem ler arquivo direto: upload e visualização passam obrigatoriamente por Edge Function com service role, que gera o caminho e a URL temporária. Nenhum grant novo para `anon`.
- Autorização de gestor no backend: `supabase/functions/_shared/authz.ts` (`requireCompanyAccess`, `canAdminister` = dono/owner/admin) e, no banco, `private.is_company_admin_or_owner`. É esse o padrão que a fase seguirá — não há chave de permissão por módulo de Pessoas.
- Convite: reaproveitar exatamente o desenho de `dp_portal_access_tokens` (`token_hash`, `purpose`, `expires_at`, `consumed_at`, `claimed_at`, `claim_expires_at`) e o limitador `_shared/rate-limit.ts` (`auth_rate_limits`, janela horária, por IP). Observação: nessa tabela `user_id` e `colaborador_id` são NOT NULL, então o convite do candidato precisa de tabela própria com o mesmo padrão (extensão de schema, não impedimento).

## 6. Pendências e notificações

- Arquitetura canônica das pendências do gestor é o hook `src/hooks/useDpPendencias.tsx` (1.445 linhas), que monta itens `{ tipo, titulo, subtitulo, url, ... }` por área (Solicitação, Troca, Ocorrência, Férias, Licença, Negociação, Regras, Rescisão...). Há também `dp_pendencias_materializadas` (para apuração pesada) e `dp_pendencias_config` (limiares por empresa: dias de alerta por assunto).
- Integração da pré-admissão: novo bloco no hook com `tipo: "Pré-Admissão"` e `url: /dp/cadastros/colaboradores?aba=preadmissoes&id=...`, aparecendo junto das demais pendências; notificação ao gestor pelo caminho existente (`dp_notificacoes` / `DpNotificacoesBell`).

## 7. Infraestrutura do pacote para a contabilidade

Dependências presentes: `pdf-lib` e `pdfjs-dist`. **Não existe biblioteca de ZIP no projeto.** Opções técnicas (sem decisão de produto):
a) ficha + documentos consolidados em um único PDF com `pdf-lib` (imagens convertidas em páginas) — sem nova dependência;
b) adicionar uma biblioteca de ZIP e montar o pacote no navegador a partir de URLs temporárias;
c) downloads individuais organizados + ficha em PDF.
Recomendação: (a) para a ficha e os documentos em imagem, com download individual para PDFs grandes — evita cópia permanente redundante (item 74).

## 8. Única decisão de produto pendente

**Momento da efetivação do colaborador**: criar o cadastro definitivo já na aprovação da Pré-Admissão pelo gestor, ou somente depois do retorno/importação da ficha oficial da contabilidade? Não vou assumir nenhuma das duas — as demais regras (bloqueio de menor, checklist, pacote, importação) são iguais nos dois casos; muda só onde a RPC de promoção é disparada e qual status antecede "Concluído".

Extensões de schema necessárias (tabelas de pré-admissão, convite, pessoas relacionadas com finalidade Sesc, documentos, eventos, vínculo de requisito a cargo/unidade, faixas de idade) estão tratadas como extensão normal, não como impedimento.

Nota: `roadmap.md` não foi editado porque nesta etapa só o arquivo de plano pode ser alterado; a tarefa será registrada lá na implementação.

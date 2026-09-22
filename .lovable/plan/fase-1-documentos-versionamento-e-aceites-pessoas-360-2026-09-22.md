# Fase 1 — Documentos, Versionamento e Aceites (Pessoas 360)

Somente Fase 1. Nada do módulo financeiro é tocado.

## Diagnóstico confirmado (leitura e consultas feitas agora)

1. **Aceite não amarra documento ao titular.** A regra de gravação do próprio colaborador exige apenas que o colaborador seja ele mesmo e que o autor seja o usuário logado. Não confere se o documento pertence a esse colaborador nem se é da mesma empresa. As chaves estrangeiras são independentes, então um pedido manipulado pode registrar aceite de documento de outra pessoa ou de outra empresa. Vulnerabilidade confirmada.
2. **Aceite é gravado direto pela tela** (aviso de assinatura do portal), sem operação de servidor.
3. **A "impressão digital" do documento não é real.** Todos os 19 aceites existentes têm no campo de conteúdo o caminho do arquivo, não um resumo criptográfico (0 de 19 com SHA-256).
4. **Versão existe na tabela de documentos** (versão, substitui/substituído por, ciclo) e o lote já publica novas versões, **mas** a substituição pelo Histórico troca o arquivo no mesmo registro e **apaga os aceites** — apaga evidência e permite conteúdo novo sobre versão já aceita.
5. **A exclusão pelo Histórico apaga os aceites** antes de excluir o documento.
6. **Certificado** usa o último aceite do documento e não confere se o arquivo atual é o mesmo conteúdo aceito.
7. Inventário atual: 104 documentos, 19 aceites, 0 aceites órfãos, 0 divergências de empresa ou de colaborador nos dados existentes. Nenhum dado histórico precisará ser apagado.

## O que será feito

### 1. Uma única porta de entrada para o aceite
- Nova função de servidor de aceite que recebe apenas o identificador do documento e a impressão digital do conteúdo conferida no servidor.
- O servidor deriva usuário logado, colaborador, empresa e titular; confere que o documento é daquele colaborador, daquela empresa, que exige aceite, que está ativo (não arquivado nem substituído) e que o vínculo permite o portal.
- Qualquer divergência: recusa com mensagem de negócio, sem detalhe técnico.
- A gravação direta pela tela deixa de ser permitida (a permissão de gravação própria passa a exigir a operação de servidor).

### 2. Impressão digital real do conteúdo (SHA-256)
- Função de borda lê os bytes do arquivo no armazenamento privado e calcula SHA-256.
- O resumo é guardado na versão do documento; se já houver um e o arquivo tiver mudado, o aceite é recusado.
- O aceite registra o resumo da versão exata aceita.
- Aceites antigos ficam preservados e passam a ser marcados como "registro anterior ao controle de conteúdo" — nada é apagado nem reescrito.

### 3. Versão aceita passa a ser imutável
- Regra de banco impede trocar arquivo, tamanho, tipo, titular ou competência de um documento que já tem aceite.
- A substituição pelo Histórico deixa de apagar aceites: passa a publicar **nova versão**, preservando a anterior e o aceite dela, e a nova versão nasce pendente de novo aceite.
- A exclusão deixa de apagar aceites; passa pela rotina de exclusão/arquivamento do servidor, mantendo a evidência histórica.
- Remoção de aceite deixa de ser permitida pela aplicação.

### 4. Certificado correto
- O certificado passa a ser montado a partir da versão que foi aceita (não do arquivo atual), exibindo documento, versão, resumo do conteúdo, titular, quem assinou, empresa e data/hora.
- Se o conteúdo atual não corresponder ao resumo aceito, o certificado indica isso em linguagem de negócio.

### 5. Duplo clique e sessões simultâneas
- Unicidade por documento + signatário e trava por documento durante a gravação: dois cliques ou duas sessões produzem um único aceite.

### 6. Lote e demais caminhos
- Os caminhos de lote (envio, aprovação, descarte, processamento) passam a usar as mesmas regras de versão, titular, empresa e resumo de conteúdo.

### 7. Mensagens ao usuário
- "Uma nova versão deste documento foi enviada e precisa ser aceita novamente."
- "Este documento não está disponível para você."
- Nenhum termo técnico exposto.

## Detalhes técnicos

- Migration isolada da fase: coluna de resumo (`arquivo_sha256`) e origem do resumo em `dp_documentos`; colunas `documento_versao` e `hash_origem` em `dp_documento_aceites`; índice único parcial `(documento_id, aceito_por)`; trigger de imutabilidade em `dp_documentos` quando existir aceite; revisão de grants (sem DELETE para `authenticated` em `dp_documento_aceites`); `updated_at`; sem DROP de dados.
- RPC `public.dp_documento_aceitar(p_documento_id uuid, p_conteudo_hash text)` SECURITY DEFINER, `search_path` fixo, `pg_advisory_xact_lock` por documento, idempotente, grant apenas `authenticated`.
- Nova Edge Function `dp-documento-aceitar`: valida JWT do usuário, resolve caminho pelo servidor, calcula SHA-256 dos bytes, chama a RPC. Nenhum caminho de arquivo vindo do cliente.
- Ajustes: `src/components/dp/portal/DocumentoAssinaturaGate.tsx`, `src/lib/dp/historicoDocAcoes.ts` (substituir → `dp_documento_versao_publicar`; excluir → rotina de servidor), `supabase/functions/dp-documento-certificado/index.ts`, hooks de documentos/pendências, `src/integrations/supabase/types.ts`.
- Backfill: somente marcação de origem do resumo nos 19 aceites atuais, com relatório antes e depois. Nenhuma exclusão.
- Validações: relatório de inventário; testes de aceite próprio, aceite de documento de outro colaborador, entre empresas, versão 1 aceita + versão 2 pendente, certificado por versão, resumos diferentes quando o arquivo muda, duplo clique, duas sessões simultâneas, lote, substituição pelo Histórico, link temporário não autorizado, documento arquivado; `bunx tsgo`, lint, build, `deno check` das funções alteradas.
- Rollback: reverter trigger, índice, RPC e Edge Function pela migration inversa; colunas novas permanecem vazias e inofensivas; nenhum dado histórico é perdido.

## Parada
Ao concluir a Fase 1, apresentar evidências no formato exigido e **parar**. Fases 2 a 10 não serão iniciadas.

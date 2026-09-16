# Corrigir o erro ao anexar comprovante de pagamento

## O que está acontecendo

Ao anexar o comprovante (adiantamento da Hanna, entre outros), o envio falha com
`invalid input syntax for type uuid: "comprovantes"` e o usuário só vê "Erro".

Causa confirmada: o arquivo do comprovante é gravado numa pasta que começa com o
texto `comprovantes/`, mas a regra de acesso do repositório de arquivos do DP exige
que a **primeira pasta seja o identificador da empresa**. Ao tentar interpretar
`comprovantes` como identificador, o servidor recusa o envio. Nenhum comprovante
foi gravado até agora por esse caminho, então não há arquivo a migrar.

Segundo ponto: mesmo com o caminho corrigido, a regra de leitura só autoriza o
colaborador a abrir o arquivo principal do documento — não o comprovante. O
colaborador continuaria sem conseguir abrir o comprovante que a empresa anexou.

## O que será feito

1. **Envio (código)** — gravar o comprovante em
   `<empresa>/<colaborador>/comprovantes/<arquivo>`, mantendo a mesma pasta da
   empresa usada pelos demais documentos. Nada muda no visual nem no fluxo.
2. **Leitura (regra de acesso)** — ampliar a regra de leitura do repositório para
   reconhecer também o arquivo de comprovante do documento, com exatamente as
   mesmas condições já usadas hoje: mesma empresa, documento do próprio
   colaborador, documento não disciplinar e ativo/arquivado. Administração e super
   administrador continuam como estão.
3. **Verificação** — anexar, visualizar, baixar, substituir e remover o comprovante
   como administração; abrir o comprovante como colaborador; confirmar que a
   pendência de comprovante é baixada ao anexar.

## Detalhes técnicos

- `src/hooks/useDpComprovantePagamento.tsx`: `path` passa de
  `comprovantes/${companyId}/...` para `${companyId}/${colaboradorId ?? "geral"}/comprovantes/${Date.now()}-${nome}`.
  A remoção do arquivo anterior continua usando o caminho gravado na linha, então
  registros antigos seguem funcionando.
- Migration nova (incremental): recriar a policy `dp_doc_bucket_read_autorizado`
  em `storage.objects` acrescentando o ramo
  `d.comprovante_file_path = objects.name` ao lado do atual `d.file_path`, mantendo
  `d.company_id = split_part(name,'/',1)::uuid`, `d.colaborador_id = dp_colaborador_ativo_of(auth.uid())`,
  `d.tipo <> 'disciplinar'` e `d.ciclo_status in ('ativo','arquivado')`. Rollback:
  recriar a policy anterior. `dp_doc_bucket_admin_write` já cobre a escrita porque
  valida só a primeira pasta.
- `dp_documento_arquivo` já trata a variante `comprovante` — nenhuma mudança nela.
- Sem alteração de layout, sem publicação, sem mexer em outros achados.

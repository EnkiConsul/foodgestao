# Negociações Sindicais Dentro Da Unidade

As negociações coletivas (ACT/CCT/aditivos) passam a ser cadastradas e consultadas dentro da aba **Sindicato** do cadastro da unidade. A tela separada de Negociações Sindicais deixa de existir e os arquivos das negociações somem do Histórico de Documentos.

Todas as 4 negociações já cadastradas têm unidade vinculada, então cada uma aparece automaticamente na sua unidade — nada precisa ser remigrado nem reimportado.

## O Que Muda Para O Usuário

**Aba Sindicato da unidade** (em Cadastro > Unidades > editar unidade) ganha, abaixo do sindicato patronal vinculado, o bloco **Negociações Coletivas** daquela unidade:
- Lista das negociações da unidade (tipo ACT/CCT/Aditivo, mês/ano base, sindicato patronal e laboral, arquivo).
- Nova negociação, editar, excluir, visualizar e baixar o PDF — igual a hoje, com a unidade já preenchida.
- Botão **Aplicar Aos Cargos** (piso negociado) mantido.
- Em unidade nova, o bloco pede para salvar a unidade primeiro.

**Menu**: o item "Negociações Sindicais" sai do menu de Cadastro e do hub de Cadastro. As rotas antigas (`/dp/cadastros/negociacoes-sindicais`, `/dp/documentos/act-cct`, `/dp/sindicatos/negociacoes` etc.) passam a redirecionar para Unidades.

**Histórico de Documentos**: as linhas de negociação sindical não aparecem mais, e a natureza "Negociação Sindical" sai da barra de filtros. Excluir/substituir de negociação passa a ser feito só dentro da unidade.

**Pendências**: os alertas de negociação coletiva continuam existindo, apenas apontando para Unidades.

## O Que Não Muda

- Mesma tabela e mesmos vínculos: piso salarial por unidade, enquadramento sindical do cargo/colaborador, contexto de regras de folgas e o acesso do colaborador aos documentos da negociação no portal seguem funcionando.
- Sindicatos laborais permanecem em Cargos e Salários.

## Detalhes Técnicos

- Novo `src/components/dp/unidades/UnidadeNegociacoesPanel.tsx`: recebe `unidadeId`/`unidadeNome`, reaproveita a lógica atual de `DpSindicatoNegociacoes.tsx` (query filtrada por `unidade_id`, upsert com upload em `dp-documentos`, delete, `createSignedUrl`, `AplicarPisoUnidadeDialog`), com os selects de sindicato patronal/laboral filtrados pelos vínculos da unidade e o campo Unidade removido do formulário.
- `src/components/dp/unidades/UnidadeSindicatoPanel.tsx`: renderiza o novo painel após o bloco de vínculo patronal (ou o painel é composto na aba `sindicato` de `UnidadeFormDialog.tsx`).
- `src/App.tsx`: remove o lazy import e a rota da página; `cadastros/negociacoes-sindicais` passa a `Navigate` para `/dp/cadastros/unidades`. Deletar `src/pages/dp/DpSindicatoNegociacoes.tsx`.
- `src/config/dpNavigation.tsx`, `src/pages/dp/DpCadastrosHub.tsx`, `src/components/dp/favoritablePages.ts`: remover o item Negociações Sindicais.
- `src/pages/dp/DpHistoricoCompleto.tsx`: remover a consulta `sindRes` a `dp_sindicato_negociacoes`, o mapeamento `sind:` e a natureza `act_cct` da barra de filtros.
- `src/hooks/useDpPendencias.tsx`: apontar as URLs de negociação para `/dp/cadastros/unidades`.
- `src/lib/dp/historicoDocAcoes.ts`: a origem `sind` deixa de ser usada pelo histórico (pode permanecer como suporte legado).
- Sem migração de banco.

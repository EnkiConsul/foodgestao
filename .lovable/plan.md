# Pró-labore da sócia: recibo importado deve encerrar a pendência

## O que está acontecendo

A folha de julho da T-63 foi importada com as duas páginas: Nordman e Tamires. Só que a Tamires está cadastrada como **Sócia com pró-labore**, e para sócio o sistema não espera "contracheque" — espera "Recibo de Pró-Labore".

As duas páginas entraram com o tipo `contracheque`. Resultado: a conferência continua cobrando o pró-labore de julho da Tamires e, pela mesma regra, ainda pode marcar o contracheque dela como documento inconsistente (contracheque para quem não é empregado).

Ou seja: o documento certo já está no sistema, só está com o rótulo errado.

## O que será feito

1. **Na importação:** quando a página for vinculada a um sócio remunerado por pró-labore, o documento passa a ser gravado como "Recibo de Pró-Labore", mesmo que a leitura do PDF tenha sugerido "contracheque". O título fica no padrão já usado ("Recibo de Pró-Labore · 07/2026").
2. **Na conferência:** um recibo de pagamento já importado para sócio com pró-labore vale como pró-labore daquele mês. Assim nada fica cobrado em duplicidade e o alerta de "inconsistente" deixa de aparecer nesse caso.
3. **Documentos já importados:** os recibos de sócio que ficaram como "contracheque" são reclassificados para "Recibo de Pró-Labore", sem apagar nem reenviar arquivo. Isso resolve julho da Tamires e também junho.
4. **Sócio sem pró-labore (só lucros):** continua sem cobrança de documento mensal, como hoje.

## Detalhes técnicos

- `src/lib/dp/ficha-registro`/motor de tipos: aplicar a resolução de tipo por vínculo no ponto onde o item do lote é confirmado (`dp-doc-bulk-approve` / criação em `dp_documentos`), usando `vinculo_label` + `socio_remuneracao` do colaborador.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: no bloco de checks do sócio, tratar `contracheque` como equivalente a `pro_labore` e excluir esse caso da regra de "inconsistente".
- Regra pura nova em `src/lib/dp/` (ex.: `documento-tipo-por-vinculo.ts`) com testes: entra vínculo + remuneração + tipo lido, sai tipo canônico.
- Migração de dados única: `update dp_documentos set tipo='pro_labore'` apenas para documentos `contracheque`/`contracheque_13` de colaboradores sócios com `socio_remuneracao='pro_labore'`, registrando em `dp_documento_eventos`.
- Sem mudança de RLS, permissões, multiempresa ou motor de leitura de PDF.

## Verificação

- Testes da regra pura e da conferência.
- Conferir na tela: julho/2026 da T-63 sem pendência de pró-labore da Tamires, contracheque do Nordman intacto, nenhum novo alerta de inconsistência.

## Reversão

- Reverter os arquivos alterados e, se preciso, voltar os documentos reclassificados para `contracheque` pelos eventos registrados.

# Cargo Sócio, vínculo automático e natureza pró-labore na conferência

Três problemas confirmados no código, todos no caminho "cadastrar pessoa durante a conferência do documento".

## 1. Cargo Sócio já sugere o vínculo Sócio

Hoje o vínculo abre sempre em "CLT efetivo", independente do cargo escolhido. Passa a funcionar assim:

- Ao escolher um cargo cujo nome é Sócio (aceitando "Socio", "Sócio", "Sócia", "Sócio administrador"), o vínculo muda automaticamente para **Sócio**, com remuneração **Pró-labore** como padrão.
- É apenas sugestão: se a pessoa trocar o vínculo à mão, o sistema não sobrescreve mais.
- Vale no cadastro rápido da conferência e também no cadastro completo do colaborador.

## 2. Nome do recém-cadastrado aparece na hora

O cadastro rápido grava a pessoa, mas a lista de colaboradores da tela continua com os dados antigos — por isso o Luiz não apareceu nem vinculado na página nem na lista para escolher manualmente. Após o cadastro, a lista é recarregada e a página passa a exibir o nome imediatamente.

## 3. Natureza do documento acompanha o vínculo

Quando a página é vinculada a alguém (recém-cadastrado ou escolhido na lista), a natureza é recalculada:

- Sócio com pró-labore → **Recibo de Pró-Labore**, mesmo que a leitura do PDF tenha dito "Contracheque".
- CLT e demais vínculos → segue como contracheque, sem mudança.
- Sócio só com lucros → mantém o que foi lido.
- Ao desvincular a página, a natureza não é alterada.
- A checagem de documento repetido usa a natureza já corrigida, evitando falso duplicado.

## Detalhes técnicos

- Nova regra pura em `src/lib/dp/cargos.ts` (ou módulo próprio): `cargoSugereVinculoSocio(nomeCargo)` com normalização de acentos/caixa; testes unitários.
- `src/components/dp/documentos/NovoColaboradorInlineDialog.tsx`: estado `vinculoTocado` para não sobrescrever escolha manual; `onValueChange` do cargo aplica a sugestão; após o insert, `queryClient.invalidateQueries({ queryKey: ["dp_colaboradores"] })` e só então `onCreated`.
- `src/components/dp/ColaboradorFormDialog.tsx`: mesma sugestão ao definir `cargo_id` (inclusive no atalho de criação de cargo), sem tocar em piso salarial, benefícios ou regras de risco jurídico.
- `src/components/dp/documentos/BulkReviewInline.tsx` (e espelho em `BulkReviewDialog.tsx`): na mutação `setColab`, após resolver o colaborador, calcular `tipoCanonicoPorVinculo(tipo_detectado ?? batch.tipo, colab)` usando `vinculo_label`/`socio_remuneracao` do registro e gravar `tipo_detectado` quando mudar (com `tipo_origem: "vinculo"`). O recém-cadastrado é buscado na lista já revalidada.
- Sem migração, sem alteração de RLS, permissões, isolamento por empresa ou do motor de leitura de PDF.
- Verificação: testes da regra pura e de `documento-tipo-por-vinculo`, typecheck e suíte de DP; conferir no Garavelo 07/2026 que o Luiz aparece vinculado e a natureza sai como Recibo de Pró-Labore.

## Reversão

Reverter os arquivos alterados; nada persistido é migrado.

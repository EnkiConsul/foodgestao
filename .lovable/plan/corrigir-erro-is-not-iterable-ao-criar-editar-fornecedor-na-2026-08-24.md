# Corrigir erro "$ is not iterable" ao criar/editar fornecedor na conciliação

## Causa confirmada

Na tela de conciliação, ao salvar o cadastro (criação ou edição), a lista de fornecedores/clientes é recarregada assim:

```ts
const cts = await fetchAllCompanyContacts(selectedCompanyId);
setContacts((cts ?? []) as ContactOpt[]);
```

Mas `fetchAllCompanyContacts` devolve um objeto `{ data, error }`, não um array. O estado `contacts` passa a guardar esse objeto e, no próximo render, o seletor tenta percorrer/espalhar a lista — daí o erro "is not iterable" e a tela de falha. No carregamento inicial da tela o retorno é desestruturado corretamente (`{ data: cts, error: ctsError }`), por isso o problema só aparece depois de salvar.

## Correção

Em `src/pages/ConciliacaoPluggy.tsx`, nas duas funções pós-salvamento (`handleContactSaved` e `handleContactEdited`):

- Desestruturar `{ data, error }` do retorno.
- Alimentar `setContacts` apenas com `data ?? []`.
- Se vier `error`, exibir toast de falha ao atualizar a lista (mantendo o vínculo já aplicado na linha), em vez de quebrar a tela.

Para evitar repetição do erro, extrair um pequeno helper local `recarregarContatos(companyId)` usado pelos dois fluxos.

## Verificação

Abrir a conciliação, cadastrar um novo fornecedor pelo seletor e editar um já vinculado: em ambos os casos a tela deve continuar funcionando, o contato aparecer na lista e o vínculo permanecer na linha.

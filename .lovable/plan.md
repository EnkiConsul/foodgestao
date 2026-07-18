# Corrigir erro "Invalid key" ao anexar PDF em Nova Negociação

## O que aconteceu

O Storage do backend rejeita chaves (caminhos de arquivo) que contenham caracteres não-ASCII ou pontuação como `Ç`, `Ã`, `(`, `)` e espaços. O arquivo enviado se chamava `CNPJ_ALTERAÇÃO_(1).pdf`, então o caminho gerado ficou:

```
9293.../sindicato-negociacoes/ba21.../1784356619394-CNPJ_ALTERAÇÃO_(1).pdf
```

Os caracteres `Ç`, `Ã`, `(` e `)` são inválidos como chave de storage → erro `Invalid key`.

Hoje o código em `src/pages/dp/DpSindicatoNegociacoes.tsx` (linha 141) só substitui espaços por `_`, e mantém acentos e parênteses no path enviado ao Storage.

## Correção proposta

Sanitizar apenas o **nome usado como chave do Storage**, preservando o nome original que já é salvo separadamente em `arquivo_nome` (usado no display e download).

Em `src/pages/dp/DpSindicatoNegociacoes.tsx`, no bloco de upload:

1. Normalizar o nome removendo acentos: `file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`.
2. Substituir qualquer caractere fora de `[A-Za-z0-9._-]` por `_`.
3. Colapsar múltiplos `_` consecutivos.
4. Usar esse nome saneado apenas no `path` do `storage.upload`. O `arquivo_nome` gravado na tabela continua sendo o `file.name` original, então o usuário continua vendo/baixando com o nome bonito.

Nada muda no banco, nas policies, nem em outros fluxos.

## Detalhes técnicos

Trecho equivalente após a correção (arquivo `src/pages/dp/DpSindicatoNegociacoes.tsx`, ~linha 141):

```ts
const safeName = file.name
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")     // remove acentos
  .replace(/[^A-Za-z0-9._-]+/g, "_")   // troca caracteres inválidos por _
  .replace(/_+/g, "_");                // colapsa _

const path = `${selectedCompanyId}/sindicato-negociacoes/${form.unidade_id}/${Date.now()}-${safeName}`;
```

## Validação

- Reenviar `CNPJ_ALTERAÇÃO_(1).pdf` → upload deve concluir sem erro.
- Card da negociação deve continuar exibindo `CNPJ_ALTERAÇÃO_(1).pdf` como nome do arquivo (via `arquivo_nome`).
- Botão "Baixar" deve funcionar normalmente.

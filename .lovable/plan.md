# Sanitizar nome de arquivos em todos uploads do Módulo DP

## Causa comum

Supabase Storage rejeita chaves com caracteres não-ASCII (`ç`, `ã`, acentos) e pontuação como `( )`, gerando erro `Invalid key: ...`. Vários uploads do DP concatenam `file.name` cru no path.

## Ação

1. **Criar helper compartilhado** `src/lib/storage.ts` com:

```ts
export function sanitizeStorageFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")      // remove acentos
    .replace(/[^A-Za-z0-9._-]+/g, "_")    // substitui inválidos
    .replace(/_+/g, "_")                  // colapsa _
    .replace(/^_+|_+$/g, "");             // trim _
}
```

2. **Aplicar em todos os uploads do módulo DP**, substituindo o uso de `file.name` (ou `file.name.replace(/\s+/g, "_")`) na composição do `path`. O nome original continua sendo gravado nas colunas de exibição (`arquivo_nome`, `original_name`, etc.) — só o path do bucket é saneado.

Arquivos a alterar:

| Arquivo | Linha | Bucket |
|---|---|---|
| `src/pages/dp/DpDisciplinar.tsx` | 181 | `dp-disciplinar` |
| `src/pages/dp/DpAtestados.tsx` | 162 | `dp-documentos` |
| `src/pages/dp/DpAvisos.tsx` | 80 | `dp-documentos` |
| `src/pages/dp/DpDocumentos.tsx` | 125 | `dp-documentos` |
| `src/pages/dp/DpDocumentosPorTipo.tsx` | 198 | `dp-documentos` |
| `src/pages/dp/DpDocImportBulk.tsx` | 106 | `dp-bulk-import` |
| `src/pages/dp/portal/DpMeuAtestados.tsx` | 70 | `dp-documentos` |
| `src/pages/dp/portal/DpMeuDocumentos.tsx` | 128 | `dp-documentos` |
| `src/pages/dp/DpSindicatoNegociacoes.tsx` | 141 | `dp-documentos` — já corrigido (refatorar para usar o helper) |

## Escopo

Somente sanitização do nome usado na chave do Storage. Nada de mudanças em UI, banco, policies ou lógica de negócio. Sem novo upload nem migração.

## Validação

- Enviar arquivo com "ç", acento ou parênteses em Disciplinar, Atestados, Avisos, Contracheques/Folhas/Adiantamentos, Importação em Massa e Portal do Colaborador → upload conclui sem `Invalid key`.
- Exibição e download continuam com o nome original.

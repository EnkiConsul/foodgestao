# Selo Reclame Aqui na página inicial

A página inicial pública do sistema (`/`) é a tela de entrada (login/cadastro). O selo verificado do Reclame Aqui será exibido logo abaixo do cartão de login, centralizado, para visitantes.

## Comportamento

- O selo aparece somente na tela de entrada, abaixo do cartão, com espaçamento discreto e centralizado.
- Carregamento é assíncrono: se o Reclame Aqui estiver fora do ar ou for bloqueado por bloqueador de anúncios, a área simplesmente não aparece — nada de erro, nada de espaço quebrado no layout.
- Não aparece no ambiente de homologação (nenhum script externo de terceiro é carregado lá).
- Sem alteração de cores, fontes ou do restante do layout.

## Detalhes técnicos

1. Novo componente `src/components/marketing/ReclameAquiSeal.tsx`:
   - `div` alvo com `id="ra-verified-seal"` e um `useEffect` que cria o `<script>` do bundle oficial (`https://s3.amazonaws.com/raichu-beta/ra-verified/bundle.js`) com os atributos `data-id`, `data-target="ra-verified-seal"` e `data-model="compact_1"`, anexando-o ao contêiner.
   - Guarda de idempotência (não injeta duas vezes em re-render / StrictMode) e limpeza na desmontagem.
   - Retorna `null` quando `isHomologacao()` (`src/lib/env/appEnv.ts`).
2. Render em `src/pages/Auth.tsx`, após o `</Card>`, dentro da `section` já existente.
3. CSP (`src/lib/security/csp.ts`): nova entrada `reclameAqui: ["https://s3.amazonaws.com"]` incluída em `script-src`, `img-src` e `connect-src`; `frame-src` não é necessário para o modelo compacto. O JSON de cabeçalhos em `docs/security/csp-headers-phase1.json` é regerado por `scripts/gerar-csp-headers-json.ts`.
4. Teste em `src/test/unit/csp.test.ts` (asserção da nova origem) e teste de renderização do componente (injeta o script uma única vez; não injeta em homologação). O teste existente "nenhum SDK de marketing é carregado pela página" continua válido: nada é adicionado ao `index.html`.

## Fora do escopo

- Nenhuma publicação em produção.
- Nenhuma mudança de banco, rota ou fluxo de autenticação.

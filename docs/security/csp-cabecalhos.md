# CSP e cabeçalhos de segurança — estado real e configuração pronta

## 1. Impedimento confirmado na hospedagem atual

- A hospedagem da Lovable **não envia cabeçalhos HTTP personalizados** e **não
  processa `public/_headers`** (essa é uma convenção da Netlify). Confirmado na
  documentação oficial da Lovable.
- Evidência em produção (18/09/2026, `x-deployment-id: d4b269e8-f49b-43f0-b3ea-dae051897a76`):

```bash
curl -sS -D- -o /dev/null https://aveto360.com
curl -sS -D- -o /dev/null https://aveto360.com/auth
```

Resposta (raiz e deep link, idênticas): `strict-transport-security`,
`referrer-policy`, `x-content-type-options` presentes (postos pela borda da
própria hospedagem), **sem** `content-security-policy`,
**sem** `content-security-policy-report-only` e **sem** `x-frame-options` —
apesar de `public/_headers` declarar `X-Frame-Options` e `Permissions-Policy`.
Isso prova que o arquivo é ignorado.

- `Content-Security-Policy-Report-Only` e `frame-ancestors` **só existem em
  cabeçalho HTTP**. Não há equivalente em `<meta http-equiv>`; portanto não
  existe solução dentro do código do app. Nenhuma meta tag de CSP foi adicionada.

**Conclusão:** o achado S1 **não pode ser encerrado** com alterações no
repositório. Ele depende de uma camada de CDN/proxy reverso colocada na frente
da hospedagem — decisão de infraestrutura, não código.

Estado real do domínio hoje (confirmado pelo proprietário): `aveto360.com` está
registrado na Namecheap, com nameservers `registrar-servers.com` e registro A
apontando direto para `185.158.133.1` (hospedagem da Lovable). **Não existe zona
Cloudflare do proprietário.** Logo, não há nenhum ponto onde inserir cabeçalho
hoje — nem via este repositório, nem via painel atual do domínio.

A própria documentação da Lovable trata esse cenário na seção *Advanced* de
[custom domain](https://docs.lovable.dev/features/custom-domain): quem precisa
controlar tráfego, cabeçalhos ou região mantém **a sua própria CDN ou proxy
reverso na frente da Lovable**, administrando o SSL e as regras nessa camada. É
exatamente esse o caminho para a fase 1 aqui: passar a servir `aveto360.com` por
uma camada intermediária de propriedade do cliente, que responde ao navegador e
repassa para a hospedagem, e configurar os cabeçalhos ali.

Enquanto essa camada não existir e não houver `curl` mostrando o cabeçalho na
resposta, **não há CSP ativo em produção** — nada nesta preparação liga a
política por si só. Este documento não recomenda mexer no registro A atual nem
ativar proxy sobre ele: a troca do modo de entrega do domínio é decisão do
proprietário e envolve SSL e janela de indisponibilidade.

## 2. Valores de cabeçalho da fase 1 (fonte única)

Fonte: `src/lib/security/csp.ts`. Os valores **literais**, prontos para colar em
qualquer painel, ficam em `docs/security/csp-headers-phase1.json`, gerado a
partir da fonte por:

```bash
bun scripts/gerar-csp-headers-json.ts
```

Fase 1 = observação + anticlickjacking:

| Cabeçalho | Efeito |
| --- | --- |
| `Content-Security-Policy-Report-Only` | não bloqueia nada; só relata |
| `Content-Security-Policy: frame-ancestors <lista>` | bloqueia embutir o app em sites de terceiros |
| `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | reforço padrão |

Sem `report-uri`/`report-to`: **nenhum coletor público foi criado**. As
violações são observadas no console do navegador, via o ouvinte sanitizado
`installCspViolationLogger()` (registra apenas diretiva + origem; descarta
caminho, query string, `sample`, CPF, senha e token).

### `frame-ancestors`: somente origens exatas

A lista é `'self'`, `https://aveto360.com`, `https://www.aveto360.com`,
`https://lovable.dev` e a origem exata do preview deste projeto
(`https://id-preview--ceeb4a17-6191-46b0-a351-c97a8211c03e.lovable.app`).

**Proibido curinga**: `https://*.lovable.app` (e `https://*.lovable.dev`) é
espaço multi-inquilino — qualquer pessoa publica um app nesse domínio e passaria
a poder embutir a nossa tela de login em iframe, o que é exatamente o ataque que
esta diretiva existe para impedir. Um teste em `src/test/unit/csp.test.ts`
falha se algum curinga voltar para a lista. Se o editor precisar de outra
origem, acrescente a origem exata — nunca um curinga.

## 3. Onde aplicar: CDN/proxy reverso próprio na frente da Lovable

A hospedagem não expõe configuração de cabeçalhos, e hoje o domínio vai direto
para ela (Namecheap → A `185.158.133.1`), sem camada intermediária. A rota
suportada é a da seção *Advanced* de
[custom domain](https://docs.lovable.dev/features/custom-domain): manter **uma
CDN ou proxy reverso do próprio cliente na frente da Lovable**, com o SSL e as
regras administradas nessa camada. Em termos práticos, a camada escolhida passa
a ser quem responde ao navegador em `aveto360.com`, encaminha as requisições
para a hospedagem e acrescenta os cabeçalhos da fase 1 na resposta.

Decisões que **não** estão tomadas aqui e dependem do proprietário: qual
provedor de CDN/proxy usar, como o domínio passará a ser entregue por ele e o
tratamento do certificado. Nada neste repositório altera DNS, e este documento
não instrui ativar proxy sobre o registro A atual.

## 4. Configuração pronta — nginx (proxy reverso próprio)

Valores literais em `docs/security/csp-headers-phase1.json`; o exemplo abaixo
mostra o `frame-ancestors` final, sem curinga:

```nginx
add_header Content-Security-Policy-Report-Only "<valor de csp_report_only no JSON>" always;
add_header Content-Security-Policy "frame-ancestors 'self' https://aveto360.com https://www.aveto360.com https://lovable.dev https://id-preview--ceeb4a17-6191-46b0-a351-c97a8211c03e.lovable.app" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

Se a camada escolhida for o Cloudflare do próprio cliente, os mesmos valores vão
em Rules → Transform Rules → Modify Response Header → *Set static*, com
expressão `(http.host in {"aveto360.com" "www.aveto360.com"})`. Isso pressupõe a
zona já operando lá — o que hoje não é o caso.


## 5. Como verificar depois de aplicar

```bash
for u in https://aveto360.com/ https://aveto360.com/auth https://aveto360.com/dp; do
  echo "== $u"; curl -sS -D- -o /dev/null "$u" | grep -i -E 'content-security-policy|x-frame|permissions-policy'
done
```

O achado só pode ser marcado como resolvido quando esses comandos mostrarem os
cabeçalhos na resposta HTML da raiz **e** dos deep links.

## 6. Inventário de origens em uso (base da allowlist)

Backend/Storage/Functions `*.supabase.co` (inclui WebSocket) · Google Analytics
(`googletagmanager.com`, `google-analytics.com`, `region1.google-analytics.com`)
· Meta Pixel (`connect.facebook.net`, `www.facebook.com`) · Cloudflare Turnstile
(`challenges.cloudflare.com`) · Pluggy Open Finance (`cdn.pluggy.ai`,
`connect.pluggy.ai`, `api.pluggy.ai`) · Fontes (`fonts.googleapis.com`,
`fonts.gstatic.com`) · Logotipos de bancos (`img.logo.dev`) · CEP/CNPJ
(`viacep.com.br`, `brasilapi.com.br`) · `blob:`/`data:` para PDF, workers do
pdf.js, pré-visualização de documentos e exportações CSV.

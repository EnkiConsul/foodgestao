# Importar dados reais do Pakerê e re-rodar o E2E do DP

## Escopo em 3 fases

### Fase 1 — Sondar acesso (1 requisição, read-only)

Antes de qualquer coisa, testo se a anon key `sb_publishable_...` consegue ler as tabelas `dp_*` de `pjogistzpszkcjucktrv.supabase.co`.

```bash
curl -s -H "apikey: <key>" \
  "https://pjogistzpszkcjucktrv.supabase.co/rest/v1/dp_colaboradores?select=id&limit=1"
```

**3 desfechos possíveis:**
- **200 com dados** → seguimos pra fase 2.
- **200 vazio** (RLS bloqueando anon) → paro e reporto: precisaria de sessão autenticada de admin daquele Pakerê. Sem isso, não dá pra importar. Volto ao seed sintético.
- **401/permission denied** → mesmo caso acima.

Reporto o desfecho antes de continuar.

### Fase 2 — Extração + normalização (se Fase 1 passar)

Puxo cada tabela do DP do Pakerê via REST, na ordem de dependência:

1. `dp_unidades`, `dp_cargos`, `dp_sindicatos`, `dp_sindicato_negociacoes`
2. `dp_colaboradores`
3. `dp_solicitacoes`, `dp_trocas`, `dp_bloqueios`, `dp_registros_disciplinares`
4. `dp_avisos`, `dp_mensagens`, `dp_documentos` (só metadados, **sem baixar arquivos** do storage)
5. `dp_folha_periodos`, `dp_folha_lancamentos`

Para cada tabela:
- Comparo colunas do Pakerê com nossa schema (`\d dp_*` já mapeada) e monto um **mapeamento explícito**.
- Colunas que só existem lá → descarto e listo no relatório.
- Colunas que só existem aqui → ficam com default/NULL.
- Enums divergentes (ex.: `dp_troca_status`, `dp_disciplinar_tipo`) → mapeio pro valor equivalente nosso; se não houver, viro `NULL` ou default.

**Remapeamento obrigatório:**
- `company_id` → **sempre** ClicSorte `ec47f19b-27ef-4189-b903-43d133aaa541` da nossa base (não Raptor Systems).
- `user_id` (em colaboradores) → só preencho no colaborador que corresponde ao seu login (`rcbruto77@gmail.com`); demais ficam `NULL`. Nunca herdo `user_id` de outro auth.
- `criado_por`, `autor_id`, `aplicado_por`, `created_by` → seu `uid` ou `NULL`.
- FKs internas (colaborador → cargo/unidade/sindicato, solicitação → colaborador) → mantenho **mapa antigo→novo** por UUID.
- IDs finais → **novos UUIDs** (`gen_random_uuid`). Não reuso UUIDs do Pakerê pra evitar colisão futura.

**Prefixo `PAKERE_` em todos os `nome`/`titulo`** pra ficar fácil identificar/limpar depois. Antes de inserir, **deleto o seed `TESTE_E2E_*`** que criei no teste anterior (já deixei um script preparado).

### Fase 3 — Re-executar E2E (mesmo script anterior)

Mesmo Playwright, 29 rotas, mesmos critérios (renderiza / dados aparecem / console errors / network 4xx-5xx). Diferença: agora os dados são reais do Pakerê. Espero:

- Cobertura maior → mais chance de expor bugs de queries que só quebram com volume real (ex.: campos NULL não esperados, muitos registros num select sem paginação).
- Novos bugs de UI que só aparecem com strings longas ou caracteres especiais.

Entrego o mesmo formato de relatório (tabela + lista numerada de bugs + screenshots).

## Riscos e limites que você precisa aceitar

1. **LGPD** — nomes, CPFs, e-mails, telefones e possíveis dados sensíveis de colaboradores reais do Pakerê ficarão armazenados no **nosso** Supabase (Lovable Cloud da ClicSorte). Se quiser, eu **anonimizo CPF/telefone/e-mail** no import (substituo por `***.***.***-**`, `(00) 00000-0000`, `xxxx@example.com`) preservando só nome e estrutura organizacional — me diga se quer isso.
2. **Arquivos (contracheques, ACT-CCT em PDF)** — **não vou baixar** do storage do Pakerê. Só metadados. As telas de Documentos vão mostrar as linhas mas o "baixar" retornará 404. Aceito reportar isso como esperado.
3. **Edge functions do Pakerê** (`sorteio-folgas`, etc.) **não** existem no nosso backend — qualquer botão que chame edge function via RPC vai falhar. Reporto onde encontrar.
4. **Diferenças de schema** — se uma tabela do Pakerê tiver colunas que nossa versão nem tem (ex.: `dp_sindicatos.sigla` que mencionei no bug anterior), a coluna é ignorada. Não faço `ALTER TABLE` sem sua aprovação explícita.
5. **Volume** — se o Pakerê tiver, por exemplo, 5000 colaboradores, importo os primeiros N (proponho N=200) pra teste caber em tempo razoável. Você me diz o limite.

## Reversibilidade

Tudo importado leva prefixo `PAKERE_` no campo `nome`/`titulo`. Um único `DELETE FROM dp_* WHERE nome LIKE 'PAKERE_%'` (com CASCADE via FKs) limpa 100% se você quiser voltar atrás.

## Fora de escopo
- Baixar arquivos do storage do Pakerê
- Copiar edge functions do Pakerê pra cá
- Copiar `user_roles` do Pakerê (nossos usuários são outros)
- Manter os dados importados após o teste (a menos que você peça)
- Alterar schema da nossa base pra igualar 1:1 ao Pakerê

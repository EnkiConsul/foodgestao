# Teste de carga ponta a ponta

Dois harnesses, ambos somente leitura (nenhum cenário escreve no banco):

| Script | O que mede | Relatório |
|--------|------------|-----------|
| `scripts/load-test.mjs` | API pública + RPCs com VUs concorrentes: p50/p90/p95/p99, req/s, taxa de erro por cenário | `reports/load-test.json` |
| `scripts/load-test-db.mjs` | Consultas críticas em sessões persistentes, planos (`EXPLAIN ANALYZE`), FKs sem índice, maiores tabelas | `reports/load-test-db.json` |

## Como executar

```bash
# banco (usa as variáveis PG* gerenciadas)
node scripts/load-test-db.mjs --conns=10 --rounds=20 --require

# API (autenticado; nenhuma credencial é impressa)
LOAD_TEST_ACCESS_TOKEN=... node scripts/load-test.mjs --vus=20 --duration=30 --require
# ou TEST_USER/TEST_PASS, ou ~/.cache/lovable-auth/session.json
```

Limites padrão: p95 ≤ 1500 ms por cenário na API, p95 ≤ 500 ms por consulta no banco,
taxa de erro ≤ 1 %. Ambos entraram no release gate como os estágios `load-db` e `load-api`
(ignorados quando falta credencial, obrigatórios em `--require`).

## Resultado da execução de 27/08/2026

Volume atual: 350 lançamentos, 2.855 linhas de extrato bruto, 18 empresas.

### Banco (10 conexões concorrentes, 20 rodadas)

Todas as 6 consultas com p50 ≈ 148 ms — dominado pelo RTT da rede até o banco;
o tempo de execução no servidor ficou entre **0,05 ms e 2,7 ms**. Throughput
sustentado de ~50 consultas/s por consulta, sem erros.

### API ponta a ponta

| Carga | Throughput | p95 global | Erros |
|-------|-----------|-----------|-------|
| 20 VUs | 98 req/s | 273 ms | 0 % |
| 60 VUs | 279 req/s | 280 ms | 0 % |
| 150 VUs | 292 req/s | 1.110 ms | 0 % |

**Ponto de saturação: ~290 req/s.** Entre 60 e 150 VUs o throughput não cresce e a
latência sobe proporcionalmente — a fila está no backend (CPU da instância), não no
plano das consultas. Para ir além disso, aumentar o tamanho da instância do Lovable
Cloud (Backend → Advanced settings → Upgrade instance).

## Gargalos encontrados e corrigidos

1. **Listagem de categorias (o pior cenário, p95 1,9 s a 60 VUs).**
   As regras de acesso de `categories` e `contacts` chamavam uma função por vínculo de
   empresa (função dentro de função, por linha). Reescritas como uma única junção com
   `company_members`. Efeito: **147 → 279 req/s** e p95 de **1.703 ms → 280 ms** na
   mesma carga de 60 VUs.
2. **24 chaves estrangeiras sem índice** (benefícios, adicionais por tempo de serviço,
   salários por cargo, documentos, convocações, folha, apurações de vale, extrato bruto,
   alterações de origem). Todas indexadas — hoje o relatório mostra 0.
3. **Varreduras sequenciais** em `pluggy_v2_transactions_raw` (ordenação por data),
   `credit_card_invoices` (empresa + vencimento) e `transactions` (empresa + vencimento):
   índices criados.
4. **`chart_accounts_report` respondia HTTP 300 (PGRST203)** quando o filtro de situação
   não era enviado: existiam duas versões da função. A versão antiga e sem uso foi removida.

## Rodada sintética em volume alvo (27/08/2026)

Banco descartável local (nada toca a produção), criado por `scripts/load-synth-db.mjs`:
esquema copiado apenas na definição (`pg_dump --schema-only`) e dados 100 % sintéticos.

```bash
npm run load:synth -- up --companies=200 --transactions=500000
node scripts/load-test-db.mjs --db-url="$(npm run -s load:synth -- url)" --conns=50 --rounds=10 \
  --report=reports/load-test-synth-50.json
npm run load:synth -- down   # remove o cluster descartável
```

Volume gerado: **200 empresas, 500.000 lançamentos** (24 meses), 8.000 categorias,
12.000 contatos, 9.600 faturas de cartão, 5.000 colaboradores, 140.000 itens de escala
e 50.000 linhas de extrato bruto. `transactions` ficou com 238 MB.

| Consulta | p95 @10 conns | p95 @25 | p95 @50 | Exec. no servidor |
|----------|---------------|---------|---------|-------------------|
| extrato_periodo | 57,7 ms | 55,0 ms | 54,1 ms | 1,7 ms |
| saldo_por_conta | 32,7 ms | 32,5 ms | 60,1 ms | 3,6 ms |
| totais_por_categoria_mes | 42,2 ms | 74,0 ms | 223,4 ms | 5,3 ms |
| faturas_abertas | 29,7 ms | 17,5 ms | 23,6 ms | 0,8 ms |
| extrato_bruto_pluggy | 13,9 ms | 16,2 ms | 29,0 ms | 1,3 ms |
| escala_itens_mes | 15,1 ms | 29,8 ms | 75,0 ms | 1,0 ms |

Resultado: **todas as consultas dentro do orçamento de p95 ≤ 500 ms em volume alvo**,
zero erros, zero chaves estrangeiras sem índice e nenhuma varredura sequencial nas
consultas financeiras. Throughput agregado sustentado de ~1.900 consultas/s a 50
conexões, com degradação suave (a agregação por categoria/mês é a que mais sofre).

Ressalvas: cluster local com `fsync=off`/`synchronous_commit=off` e sem RTT de rede —
os números medem plano e CPU, não durabilidade nem latência de produção; e sem
PostgREST local o teste não mede throughput ponta a ponta da API em volume alvo.

## Pendências para a próxima rodada

- Único ponto de melhoria observado: `dp_escala_itens` faz varredura sequencial quando
  a consulta filtra só por data; um índice `(company_id, data)` resolveria — não aplicado
  agora por causa do congelamento de release.
- Carga ponta a ponta da API em volume alvo exige staging com PostgREST (o sandbox não
  tem), e carga a partir de fora do sandbox (a latência de rede aqui mascara ~150 ms por
  chamada).
- Definir o tamanho de instância recomendado por faixa de clientes a partir da medição de
  saturação (~290 req/s no volume atual).


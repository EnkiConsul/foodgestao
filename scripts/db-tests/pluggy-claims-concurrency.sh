#!/usr/bin/env bash
# Teste de concorrência (P1): duas sessões simultâneas das RPCs de claim nunca
# recebem o mesmo id. Tudo roda em transação com ROLLBACK — nada é gravado.
set -euo pipefail
run() { # $1 sql-claim  $2 delay
  psql -At -v ON_ERROR_STOP=1 <<SQL
begin;
select pg_sleep($2);
select id from ($1) t;
select pg_sleep(3);
rollback;
SQL
}
check() {
  local q="$1"
  a=$(run "$q" 0 & ) ; true
  run "$q" 0 > /tmp/claimA.txt & PA=$!
  run "$q" 0.5 > /tmp/claimB.txt & PB=$!
  wait $PA $PB
  grep -E '^[0-9a-f-]{36}$' /tmp/claimA.txt | sort > /tmp/a.ids || true
  grep -E '^[0-9a-f-]{36}$' /tmp/claimB.txt | sort > /tmp/b.ids || true
  dup=$(comm -12 /tmp/a.ids /tmp/b.ids | wc -l)
  echo "$2: A=$(wc -l </tmp/a.ids) B=$(wc -l </tmp/b.ids) sobreposição=$dup"
  [ "$dup" -eq 0 ]
}
check "select * from public.pluggy_connections_claim_due(3, 10)" claim_due
check "select * from public.pluggy_remote_delete_claim(3, 90)" remote_delete_claim
echo OK

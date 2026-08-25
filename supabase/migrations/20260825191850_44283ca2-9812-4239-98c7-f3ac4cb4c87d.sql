-- Backfill de agência e tipo das contas criadas via Open Finance,
-- usando bankData.transferNumber ("<banco>/<agência>/<conta>") já armazenado na sincronização.
with src as (
  select
    pa.linked_account_id as account_id,
    nullif(trim(split_part(pa.raw->'bankData'->>'transferNumber', '/', 2)), '') as agency,
    case
      when upper(coalesce(pa.subtype, '')) like '%SAVING%' then 'poupanca'
      when upper(coalesce(pa.subtype, '')) like '%INVEST%' then 'investimento'
      else 'corrente'
    end::public.account_type as account_type
  from public.pluggy_accounts pa
  where pa.linked_account_id is not null
    and upper(coalesce(pa.type, '')) = 'BANK'
    and pa.raw->'bankData'->>'transferNumber' is not null
), dedup as (
  select distinct on (account_id) account_id, agency, account_type
  from src
  where agency is not null
  order by account_id, agency
)
update public.accounts a
set agency = d.agency,
    account_type = d.account_type
from dedup d
where a.id = d.account_id
  and a.agency is null;
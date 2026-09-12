create policy dp_doc_bucket_colab_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dp-documentos'
  and split_part(name, '/', 2) = public.dp_colaborador_ativo_of(auth.uid())::text
  and exists (
    select 1
    from public.dp_colaboradores c
    where c.id::text = split_part(name, '/', 2)
      and c.company_id::text = split_part(name, '/', 1)
  )
);

create policy dp_doc_bucket_colab_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dp-documentos'
  and split_part(name, '/', 2) = public.dp_colaborador_ativo_of(auth.uid())::text
);
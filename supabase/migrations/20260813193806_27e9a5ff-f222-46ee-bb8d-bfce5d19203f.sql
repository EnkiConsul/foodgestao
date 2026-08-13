DELETE FROM public.contact_companies
WHERE contact_id IN (
  SELECT c.id FROM public.contacts c
  WHERE c.name LIKE 'Contraparte %'
    AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.contact_id = c.id)
);

DELETE FROM public.contacts c
WHERE c.name LIKE 'Contraparte %'
  AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.contact_id = c.id);
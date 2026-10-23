DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.billing_v2_minha_assinatura'::regproc);
  IF strpos(d, '''notas'', i.notes') = 0 THEN
    d := replace(d, '''nf_pdf'', i.fiscal_invoice_pdf_url)', '''nf_pdf'', i.fiscal_invoice_pdf_url, ''notas'', i.notes)');
    EXECUTE d;
  END IF;
END $m$;
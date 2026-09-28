ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fiscal_invoice_id text,
  ADD COLUMN IF NOT EXISTS fiscal_invoice_number text,
  ADD COLUMN IF NOT EXISTS fiscal_invoice_status text,
  ADD COLUMN IF NOT EXISTS fiscal_invoice_pdf_url text,
  ADD COLUMN IF NOT EXISTS fiscal_invoice_xml_url text,
  ADD COLUMN IF NOT EXISTS fiscal_issued_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_fiscal_invoice_id_key
  ON public.invoices (fiscal_invoice_id)
  WHERE fiscal_invoice_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.fiscal_invoice_id IS 'Identificador da NFS-e no Asaas (idempotência dos eventos INVOICE_*).';
ALTER TABLE public.pluggy_accounts
  ADD COLUMN IF NOT EXISTS sync_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_paused_reason text;

CREATE INDEX IF NOT EXISTS idx_pluggy_accounts_sync_paused
  ON public.pluggy_accounts (connection_id) WHERE sync_paused_at IS NULL;

CREATE OR REPLACE FUNCTION public.pluggy_sync_pause_on_account_toggle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NEW.is_active = false THEN
      UPDATE public.pluggy_accounts
         SET sync_paused_at = now(),
             sync_paused_reason = 'account_inactive',
             updated_at = now()
       WHERE linked_account_id = NEW.id
         AND sync_paused_at IS NULL;
    ELSE
      UPDATE public.pluggy_accounts
         SET sync_paused_at = NULL,
             sync_paused_reason = NULL,
             updated_at = now()
       WHERE linked_account_id = NEW.id
         AND sync_paused_reason = 'account_inactive';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pluggy_sync_pause_on_account_toggle ON public.accounts;
CREATE TRIGGER trg_pluggy_sync_pause_on_account_toggle
AFTER UPDATE OF is_active ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.pluggy_sync_pause_on_account_toggle();

UPDATE public.pluggy_accounts pa
   SET sync_paused_at = now(),
       sync_paused_reason = 'account_inactive'
  FROM public.accounts a
 WHERE pa.linked_account_id = a.id
   AND a.is_active = false
   AND pa.sync_paused_at IS NULL;
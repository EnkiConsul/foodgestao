ALTER TABLE public.dp_whatsapp_envios DROP CONSTRAINT IF EXISTS dp_whatsapp_envios_tipo_check;
ALTER TABLE public.dp_whatsapp_envios ADD CONSTRAINT dp_whatsapp_envios_tipo_check CHECK (tipo IN ('acesso','senha','recibo','ata'));
ALTER TABLE public.dp_whatsapp_envios ADD COLUMN IF NOT EXISTS ata_participante_id uuid;
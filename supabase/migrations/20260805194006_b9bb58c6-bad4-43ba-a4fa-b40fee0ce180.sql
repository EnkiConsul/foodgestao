-- FASE 7 (parte 1/2) — novos tipos e valores de enum
ALTER TYPE public.ped_order_status ADD VALUE IF NOT EXISTS 'waiting_scheduled_start' AFTER 'accepted';

DO $$ BEGIN
  CREATE TYPE public.ped_delivery_provider AS ENUM ('propria','parceiro','marketplace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_zone_kind AS ENUM ('bairro','cep','distancia','fixa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_table_session_status AS ENUM ('aberta','fechando','fechada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
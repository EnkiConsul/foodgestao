import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://360food.com'

// Notify when consent_expires_at is within this many days.
const WARN_WINDOW_DAYS = 7
// Suppress re-notifying within this many days after last notification.
const RENOTIFY_COOLDOWN_DAYS = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = new Date()
  const windowEnd = new Date(now.getTime() + WARN_WINDOW_DAYS * 86400000).toISOString()
  const cooldownCutoff = new Date(now.getTime() - RENOTIFY_COOLDOWN_DAYS * 86400000).toISOString()

  const { data: conns, error } = await supabase
    .from('open_finance_connections')
    .select(`
      id, company_id, connected_by_user_id, institution_name,
      consent_expires_at, consent_notified_at, is_active, disconnected_at
    `)
    .eq('is_active', true)
    .is('disconnected_at', null)
    .not('consent_expires_at', 'is', null)
    .lte('consent_expires_at', windowEnd)
    .gte('consent_expires_at', now.toISOString())

  if (error) {
    console.error('[consent-notifier] query failed', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const conn of conns ?? []) {
    if (conn.consent_notified_at && conn.consent_notified_at > cooldownCutoff) {
      skipped++
      continue
    }

    const expiresAt = new Date(conn.consent_expires_at!)
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000))

    // Resolve user email + name
    const { data: userRes } = await supabase.auth.admin.getUserById(conn.connected_by_user_id)
    const email = userRes?.user?.email
    if (!email) {
      errors.push(`no-email:${conn.id}`)
      continue
    }
    const userName = (userRes?.user?.user_metadata as any)?.full_name
      ?? (userRes?.user?.user_metadata as any)?.name
      ?? email.split('@')[0]

    // Find linked account name (best-effort)
    const { data: acc } = await supabase
      .from('accounts')
      .select('name')
      .eq('open_finance_connection_id', conn.id)
      .limit(1)
      .maybeSingle()

    const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        templateName: 'pluggy-consent-expiring',
        recipientEmail: email,
        idempotencyKey: `pluggy-consent-${conn.id}-${expiresAt.toISOString().slice(0, 10)}`,
        templateData: {
          userName,
          institutionName: conn.institution_name,
          accountName: acc?.name ?? conn.institution_name,
          daysRemaining,
          expiresAt: conn.consent_expires_at,
          reconnectUrl: `${APP_URL}/contas`,
        },
      }),
    })

    if (!invokeRes.ok) {
      const body = await invokeRes.text()
      errors.push(`send-fail:${conn.id}:${invokeRes.status}:${body.slice(0, 120)}`)
      continue
    }

    await supabase
      .from('open_finance_connections')
      .update({ consent_notified_at: now.toISOString() })
      .eq('id', conn.id)

    sent++
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: conns?.length ?? 0, sent, skipped, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})

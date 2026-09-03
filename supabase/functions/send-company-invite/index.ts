import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const TEMPLATE_NAME = 'company-invite'
const APP_URL = 'https://aveto360.com'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function logSend(
  supabase: ReturnType<typeof createClient>,
  recipient: string,
  status: 'sent' | 'suppressed' | 'failed',
  errorMessage?: string,
) {
  const { error } = await supabase.from('email_send_log').insert({
    message_id: null,
    template_name: TEMPLATE_NAME,
    recipient_email: recipient,
    status,
    error_message: errorMessage ?? null,
  })
  if (error) {
    console.error('Failed to write email_send_log', { code: error.code, message: error.message })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 500)
  }

  let inviteId: string | undefined
  try {
    const body = await req.json()
    inviteId = typeof body?.inviteId === 'string' ? body.inviteId : undefined
  } catch {
    return json({ error: 'Invalid JSON in request body' }, 400)
  }

  if (!inviteId || !/^[0-9a-f-]{36}$/i.test(inviteId)) {
    return json({ error: 'inviteId is required' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // Resolve the caller from the verified JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Authentication required' }, 401)
  }
  const { data: claimsRes } = await supabase.auth.getClaims(authHeader.slice(7))
  const claims = claimsRes?.claims as Record<string, unknown> | undefined
  const callerUserId = claims?.role === 'authenticated' && typeof claims?.sub === 'string' ? claims.sub : null
  if (!callerUserId) {
    return json({ error: 'Authentication required' }, 401)
  }

  // The invite must be pending and created by this caller — the recipient is
  // never taken from the request body.
  const { data: invite, error: inviteErr } = await supabase
    .from('company_invites')
    .select('id, invited_email, role, token, company_id')
    .eq('id', inviteId)
    .eq('invited_by', callerUserId)
    .eq('status', 'pending')
    .maybeSingle()

  if (inviteErr || !invite) {
    console.warn('Blocked company-invite send without matching pending invite', {
      callerUserId,
      error: inviteErr?.message,
    })
    return json({ error: 'No pending invite found for your account.' }, 403)
  }

  const recipient = String(invite.invited_email).toLowerCase()

  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', invite.company_id).maybeSingle(),
    supabase.from('profiles').select('full_name').eq('user_id', callerUserId).maybeSingle(),
  ])

  try {
    const result = await sendTemplateEmail(TEMPLATE_NAME, recipient, {
      idempotencyKey: `company-invite-${invite.id}`,
      templateData: {
        companyName: company?.name ?? 'uma empresa',
        inviterName: profile?.full_name ?? 'Um administrador',
        role: invite.role,
        inviteUrl: `${APP_URL}/convite/${invite.token}`,
      },
    })

    if (!result.sent) {
      await logSend(supabase, recipient, 'suppressed')
      return json({ success: false, reason: result.reason })
    }

    await logSend(supabase, recipient, 'sent')
    await supabase
      .from('company_invites')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', invite.id)

    return json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to send company invite email', { message })
    await logSend(supabase, recipient, 'failed', message.slice(0, 1000))
    return json({ error: 'Failed to send invite email' }, 500)
  }
})

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'
import { normalizeBRPhone, sendZapiText } from '../_shared/zapi.ts'

const TEMPLATE_NAME = 'company-invite'
const APP_URL = 'https://aveto360.com'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type EmailLogClient = {
  from: (table: string) => {
    insert: (
      row: Record<string, unknown>,
    ) => PromiseLike<{ error: { code?: string; message: string } | null }>
  }
}

async function logSend(
  supabase: EmailLogClient,
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
    .select('id, invited_email, role, token, company_id, full_name, whatsapp, grupo_id')
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

  const recipient = invite.invited_email ? String(invite.invited_email).toLowerCase() : null

  const [{ data: grupo }, { data: profile }] = await Promise.all([
    supabase.from('company_invites').select('companies(name)').eq('grupo_id', invite.grupo_id).eq('status', 'pending'),
    supabase.from('profiles').select('full_name').eq('user_id', callerUserId).maybeSingle(),
  ])
  const nomes = ((grupo ?? []) as Array<{ companies: { name: string } | null }>)
    .map((g) => g.companies?.name).filter(Boolean) as string[]
  const companyName = nomes.length ? nomes.join(', ') : 'uma empresa'
  const inviterName = profile?.full_name ?? 'Um administrador'
  const inviteUrl = `${APP_URL}/convite/${invite.token}`

  let whatsappOk = false
  const phone = normalizeBRPhone(invite.whatsapp)
  if (phone) {
    const primeiroNome = String(invite.full_name ?? '').split(' ')[0] ?? ''
    const nomeFmt = primeiroNome ? primeiroNome.charAt(0) + primeiroNome.slice(1).toLowerCase() : ''
    const msg = `Olá${nomeFmt ? `, ${nomeFmt}` : ''}! ${inviterName} convidou você para acessar ${companyName} no Aveto 360.\n\nCrie sua senha pelo link (válido por 7 dias):\n${inviteUrl}`
    const r = await sendZapiText(phone, msg)
    whatsappOk = r.ok
    if (r.ok) {
      await supabase.from('company_invites').update({ whatsapp_sent_at: new Date().toISOString() }).eq('grupo_id', invite.grupo_id)
    } else {
      console.warn('WhatsApp invite not sent', { error: r.error, status: r.httpStatus })
    }
  }

  let emailOk = false
  if (recipient) {
    try {
      const result = await sendTemplateEmail(TEMPLATE_NAME, recipient, {
        idempotencyKey: `company-invite-${invite.id}`,
        templateData: { companyName, inviterName, role: invite.role, inviteUrl },
      })
      if (!result.sent) {
        await logSend(supabase, recipient, 'suppressed')
      } else {
        emailOk = true
        await logSend(supabase, recipient, 'sent')
        await supabase.from('company_invites').update({ email_sent_at: new Date().toISOString() }).eq('grupo_id', invite.grupo_id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Failed to send company invite email', { message })
      await logSend(supabase, recipient, 'failed', message.slice(0, 1000))
    }
  }

  return json({ success: whatsappOk || emailOk, whatsapp: whatsappOk, email: emailOk })
})
    await logSend(supabase, recipient, 'failed', message.slice(0, 1000))
    return json({ error: 'Failed to send invite email' }, 500)
  }
})

import * as React from 'npm:react@18.3.1'
import { Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout } from '../email-templates/EmailLayout.tsx'

const SITE_NAME = 'Aveto 360'
const SITE_URL = 'https://www.aveto360.com'

interface ContactLeadProps {
  name?: string
  email?: string
  phone?: string
  company?: string
  message?: string
}

const ContactLeadEmail = ({ name, email, phone, company, message }: ContactLeadProps) => (
  <EmailLayout
    siteUrl={SITE_URL}
    siteName={SITE_NAME}
    preview={`Novo contato no site ${SITE_NAME}`}
  >
    <Heading style={h1}>Novo lead do site</Heading>
    <Text style={text}>
      Um visitante preencheu o formulário de contato no site do {SITE_NAME}.
    </Text>

    <Section style={card}>
      <Row label="Nome" value={name} />
      <Row label="E-mail" value={email} />
      <Row label="Telefone" value={phone} />
      <Row label="Empresa" value={company} />
    </Section>

    {message ? (
      <>
        <Heading as="h2" style={h2}>Mensagem</Heading>
        <Text style={messageText}>{message}</Text>
      </>
    ) : null}

    <Text style={footer}>
      Enviado automaticamente pelo formulário de contato do {SITE_NAME}.
    </Text>
  </EmailLayout>
)

const Row = ({ label, value }: { label: string; value?: string }) => (
  <Text style={row}>
    <strong style={rowLabel}>{label}:</strong>{' '}
    <span style={rowValue}>{value && value.trim() ? value : '—'}</span>
  </Text>
)

export const template = {
  component: ContactLeadEmail,
  subject: (d: Record<string, any>) =>
    d?.name ? `Novo lead: ${d.name}` : 'Novo lead do site Aveto 360',
  displayName: 'Contato — Lead do site',
  // Hard-coded recipient: the contact form is publicly callable, so the
  // recipient must never be controlled by the caller.
  to: 'comercial@raptorsistemas.com',
  previewData: {
    name: 'Maria Souza',
    email: 'maria@empresa.com.br',
    phone: '(11) 98888-7777',
    company: 'Empresa Exemplo LTDA',
    message: 'Gostaria de conhecer melhor a plataforma para a minha empresa.',
  },
} satisfies TemplateEntry

const h1 = { fontSize: '22px', fontWeight: 700, color: '#0B0F0D', margin: '0 0 12px' }
const h2 = { fontSize: '15px', fontWeight: 700, color: '#0B0F0D', margin: '20px 0 8px' }
const text = { fontSize: '14px', color: '#4B5563', lineHeight: '1.5', margin: '0 0 20px' }
const card = {
  backgroundColor: '#F9FAFB',
  border: '1px solid #E5E7EB',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 8px',
}
const row = { fontSize: '14px', color: '#0B0F0D', margin: '4px 0', lineHeight: '1.5' }
const rowLabel = { color: '#6B7280' }
const rowValue = { color: '#0B0F0D' }
const messageText = {
  fontSize: '14px',
  color: '#0B0F0D',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap' as const,
  backgroundColor: '#F9FAFB',
  border: '1px solid #E5E7EB',
  borderRadius: '8px',
  padding: '12px 14px',
  margin: '0',
}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '24px 0 0' }

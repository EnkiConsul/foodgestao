/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import { EmailLayout } from './EmailLayout.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <EmailLayout
    siteUrl={`https://www.aveto360.com`}
    siteName="Aveto 360"
    preview="Seu código de verificação Aveto 360"
  >
    <Heading style={h1}>Confirme sua identidade</Heading>
    <Text style={text}>
      Use o código abaixo para confirmar sua identidade no Aveto 360:
    </Text>
    <Section style={{ textAlign: 'center', margin: '28px 0' }}>
      <Text style={codeStyle}>{token}</Text>
    </Section>
    <Text style={footer}>
      Este código expira em breve. Se você não solicitou este código, pode
      ignorar este e-mail com segurança.
    </Text>
  </EmailLayout>
)

export default ReauthenticationEmail

const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0B0F0D',
  margin: '0 0 18px',
}

const text = {
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.6',
  margin: '0 0 16px',
}

const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '4px',
  color: '#0B0F0D',
  backgroundColor: '#F3F4F6',
  borderRadius: '8px',
  padding: '16px 24px',
  display: 'inline-block',
  margin: '0',
}

const footer = {
  fontSize: '12px',
  color: '#9CA3AF',
  margin: '24px 0 0',
}

/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Heading, Section, Text } from 'npm:@react-email/components@0.0.22'
import { EmailLayout } from './EmailLayout.tsx'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <EmailLayout
    siteUrl={`https://www.aveto360.com`}
    siteName={siteName}
    preview={`Redefina sua senha do ${siteName}`}
  >
    <Heading style={h1}>Redefina sua senha</Heading>
    <Text style={text}>
      Recebemos uma solicitação para redefinir sua senha no {siteName}. Clique no
      botão abaixo para escolher uma nova senha.
    </Text>
    <Section style={{ textAlign: 'center', margin: '28px 0' }}>
      <Button style={button} href={confirmationUrl}>
        Redefinir senha
      </Button>
    </Section>
    <Text style={fallback}>
      Se o botão não funcionar, copie e cole este link no navegador:
    </Text>
    <Text style={linkText}>{confirmationUrl}</Text>
    <Text style={footer}>
      Se você não solicitou a redefinição, pode ignorar este e-mail. Sua senha
      não será alterada.
    </Text>
  </EmailLayout>
)

export default RecoveryEmail

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

const button = {
  backgroundColor: '#02AB3D',
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: 600,
  borderRadius: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}

const fallback = {
  fontSize: '13px',
  color: '#6B7280',
  lineHeight: '1.5',
  margin: '24px 0 4px',
}

const linkText = {
  fontSize: '12px',
  color: '#02AB3D',
  wordBreak: 'break-all' as const,
  margin: '0 0 16px',
}

const footer = {
  fontSize: '12px',
  color: '#9CA3AF',
  margin: '24px 0 0',
}

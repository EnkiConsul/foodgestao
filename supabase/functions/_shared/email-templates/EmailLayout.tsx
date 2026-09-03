/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailLayoutProps {
  siteUrl: string
  siteName: string
  preview: string
  children: React.ReactNode
}

const LOGO_PATH = '/__l5e/assets-v1/4c4e600e-0dab-492e-8880-372847626d95/aveto360-assinatura.png'

export const EmailLayout = ({ siteUrl, siteName, preview, children }: EmailLayoutProps) => {
  const logoUrl = `${siteUrl}${LOGO_PATH}`
  const currentYear = new Date().getFullYear()

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Link href={siteUrl} style={logoLink}>
              <Img
                src={logoUrl}
                alt={siteName}
                width={200}
                height="auto"
                style={logo}
              />
            </Link>
          </Section>

          {children}

          <Section style={footer}>
            <Text style={footerBrand}>
              {siteName} — Gestão financeira e de equipe para food service
            </Text>
            <Text style={footerLinks}>
              <Link href={siteUrl} style={footerLink}>
                www.aveto360.com
              </Link>
            </Text>
            <Text style={footerCopy}>
              © {currentYear} {siteName}. Todos os direitos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default EmailLayout

const main = {
  backgroundColor: '#F3F4F6',
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: '0',
  padding: '24px 0',
}

const container = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: '12px',
  margin: '0 auto',
  maxWidth: '600px',
  padding: '32px 28px',
}

const header = {
  borderBottom: '1px solid #E5E7EB',
  margin: '0 0 28px',
  padding: '0 0 24px',
  textAlign: 'center' as const,
}

const logoLink = {
  display: 'inline-block',
  textDecoration: 'none',
}

const logo = {
  display: 'block',
  height: 'auto',
  maxWidth: '200px',
  width: '100%',
}

const footer = {
  borderTop: '1px solid #E5E7EB',
  margin: '32px 0 0',
  padding: '24px 0 0',
  textAlign: 'center' as const,
}

const footerBrand = {
  color: '#0B0F0D',
  fontSize: '13px',
  fontWeight: 600,
  margin: '0 0 6px',
}

const footerLinks = {
  margin: '0 0 12px',
}

const footerLink = {
  color: '#02AB3D',
  fontSize: '13px',
  textDecoration: 'none',
}

const footerCopy = {
  color: '#9CA3AF',
  fontSize: '12px',
  margin: '0',
}

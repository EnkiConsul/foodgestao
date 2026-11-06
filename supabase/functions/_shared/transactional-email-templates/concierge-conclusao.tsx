import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout } from '../email-templates/EmailLayout.tsx'

const Conclusao = ({ message }: { message?: string }) => (
  <EmailLayout siteUrl="https://aveto360.com" siteName="AVETO 360" preview="Parametrização concluída">
    {(message ?? '').split('\n').map((line, index) => <Text key={index}>{line || '\u00a0'}</Text>)}
  </EmailLayout>
)

export const template = {
  component: Conclusao,
  subject: 'Sua parametrização está pronta — AVETO 360',
  displayName: 'Conclusão da parametrização',
  previewData: { message: 'Olá! Finalizamos a parametrização da Empresa Exemplo.' },
} satisfies TemplateEntry
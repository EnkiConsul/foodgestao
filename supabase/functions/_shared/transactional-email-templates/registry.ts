/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as contactLead } from './contact-lead.tsx'
import { template as companyInvite } from './company-invite.tsx'
import { template as pluggyConsentExpiring } from './pluggy-consent-expiring.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'contact-lead': contactLead,
  'company-invite': companyInvite,
  'pluggy-consent-expiring': pluggyConsentExpiring,
}

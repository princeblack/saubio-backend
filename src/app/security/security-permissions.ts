import type { AdminPermissionMatrixEntry } from '@saubio/models';

export const PERMISSION_MATRIX_LAST_REVIEWED_AT = '2025-01-15T09:00:00.000Z';

export const SECURITY_PERMISSION_MATRIX: AdminPermissionMatrixEntry[] = [
  {
    id: 'identity.review',
    category: 'Documents & Identité',
    label: 'Revues identité prestataires',
    description: 'Accès aux documents KYC, synthèse dossiers et décisions.',
    impact: 'high',
    roles: [
      { role: 'admin', allowed: true },
      { role: 'employee', allowed: true, scope: 'Équipe conformité' },
      { role: 'provider', allowed: false },
      { role: 'client', allowed: false },
    ],
  },
  {
    id: 'compliance.gdpr',
    category: 'Conformité',
    label: 'Demandes RGPD (export/suppression)',
    description: 'Traitement des exports, suppressions et suivi des demandes.',
    impact: 'high',
    roles: [
      { role: 'admin', allowed: true },
      { role: 'employee', allowed: true, scope: 'Équipe data privacy' },
      { role: 'provider', allowed: false },
      { role: 'client', allowed: false },
    ],
  },
  {
    id: 'security.sessions',
    category: 'Sécurité',
    label: 'Sessions actives & revocations',
    description: 'Monitoring des tokens, révocation des sessions et alertes.',
    impact: 'medium',
    roles: [
      { role: 'admin', allowed: true },
      { role: 'employee', allowed: true, scope: 'Support niveau 2' },
      { role: 'provider', allowed: false },
      { role: 'client', allowed: false },
    ],
  },
  {
    id: 'finance.payouts',
    category: 'Finances',
    label: 'Versements prestataires',
    description: 'Validation des virements et accès aux IBAN masqués.',
    impact: 'medium',
    roles: [
      { role: 'admin', allowed: true },
      { role: 'employee', allowed: true, scope: 'Équipe finance' },
      { role: 'provider', allowed: false },
      { role: 'client', allowed: false },
    ],
  },
  {
    id: 'support.tickets',
    category: 'Support & Qualité',
    label: 'Tickets clients et litiges',
    description: 'Lecture/édition des tickets, escalades et notes internes.',
    impact: 'medium',
    roles: [
      { role: 'admin', allowed: true },
      { role: 'employee', allowed: true, scope: 'Support' },
      { role: 'provider', allowed: false },
      { role: 'client', allowed: false },
    ],
  },
  {
    id: 'ops.matching',
    category: 'Opérations',
    label: 'Règles matching & affectations',
    description: 'Gestion des scénarios matching et publication des règles.',
    impact: 'low',
    roles: [
      { role: 'admin', allowed: true },
      { role: 'employee', allowed: true, scope: 'Ops' },
      { role: 'provider', allowed: false },
      { role: 'client', allowed: false },
    ],
  },
  {
    id: 'marketing.consents',
    category: 'Marketing',
    label: 'Consentements & notifications',
    description: 'Accès à la base consentements marketing/statistiques.',
    impact: 'low',
    roles: [
      { role: 'admin', allowed: true },
      { role: 'employee', allowed: true, scope: 'Marketing' },
      { role: 'provider', allowed: false },
      { role: 'client', allowed: false },
    ],
  },
];

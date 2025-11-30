import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PdfKit from 'pdfkit';
import { PrismaService } from '../../../prisma/prisma.service';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AppEnvironmentConfig } from '../../config/configuration';
import { DocumentType, Prisma, type Document, type Invoice, type Payment } from '@prisma/client';

type StoredMission = {
  bookingId: string;
  paymentId: string;
  paymentDistributionId: string;
  service: string;
  amountCents: number;
  city?: string;
  startAt?: string;
  endAt?: string;
  clientTotalCents?: number;
};

const PLATFORM_COMMISSION_RATE = 0.25;
const VAT_RATE = 0.19;
const NET_SHARE_FACTOR = 1 - PLATFORM_COMMISSION_RATE * (1 + VAT_RATE); // portion that goes to provider

const COMPANY_INFO = {
  name: 'Saubio GmbH',
  street: 'Leipziger Platz 12',
  postalCode: '10117',
  city: 'Berlin',
  country: 'Deutschland',
  vatNumber: 'DE123456789',
  email: 'billing@saubio.io',
};

@Injectable()
export class InvoiceService {
  private readonly currencyFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });
  private readonly dateFormatter = new Intl.DateTimeFormat('de-DE');
  private readonly dateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnvironmentConfig>
  ) {}

  async generateClientInvoice(params: { bookingId: string; paymentId: string }): Promise<{ document: Document | null; invoice: Invoice | null } | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: params.bookingId },
      include: {
        client: true,
      },
    });
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
    });

    if (!booking || !payment) {
      return null;
    }

    const issueDate = payment.capturedAt ?? new Date();
    const invoiceNumber = this.buildInvoiceNumber(payment.id, issueDate);

    const doc = new PdfKit({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    this.printHeader(doc, 'Facture client');
    this.printCompanyBlock(doc);
    doc.moveDown();
    const paymentDescription = this.describePaymentMethod(payment);
    this.printKeyValue(doc, 'Facture n°', invoiceNumber);
    this.printKeyValue(doc, 'Date d’émission', this.formatDate(issueDate));
    this.printKeyValue(doc, 'Mode de paiement', paymentDescription.label);
    if (paymentDescription.note) {
      doc.fontSize(9).fillColor('#4b5563').text(paymentDescription.note).fillColor('black');
    }
    doc.moveDown();
    doc.fontSize(11).text('Client', { underline: true });
    doc
      .fontSize(10)
      .text(`${booking.client.firstName ?? ''} ${booking.client.lastName ?? ''}`.trim());
    doc.text(booking.client.email);
    doc.moveDown();
    doc.fontSize(11).text('Mission', { underline: true });
    doc
      .fontSize(10)
      .text(`Service : ${booking.service}`)
      .text(`Adresse : ${booking.addressStreetLine1} · ${booking.addressPostalCode} ${booking.addressCity}`)
      .text(
        `Créneau : ${this.formatDateTime(new Date(booking.startAt))} → ${this.formatDateTime(
          new Date(booking.endAt)
        )}`
      )
      .text(`Mode : ${booking.mode === 'MANUAL' ? 'Sélection manuelle' : 'Smart Match'}`);

    doc.moveDown();
    doc.fontSize(11).text('Montants (EUR)', { underline: true });
    this.printAmountRow(doc, 'Montant HT', booking.pricingSubtotalCents);
    if (booking.pricingEcoCents > 0) {
      this.printAmountRow(doc, 'Supplément bio', booking.pricingEcoCents);
    }
    if (booking.pricingLoyaltyCents > 0) {
      this.printAmountRow(doc, 'Crédit fidélité', -booking.pricingLoyaltyCents);
    }
    if (booking.pricingExtrasCents > 0) {
      this.printAmountRow(doc, 'Extras & options', booking.pricingExtrasCents);
    }
    this.printAmountRow(doc, 'TVA (19%)', booking.pricingTaxCents);
    this.printAmountRow(doc, 'Total TTC encaissé', booking.pricingTotalCents, true);

    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .fillColor('#4b5563')
      .text(
        'Commission Saubio de 25% incluse dans le prix TTC. TVA allemande (19%) appliquée conformément au §1 UStG.',
        { align: 'left' }
      )
      .text(
        'Les montants sont prélevés à l’acceptation du prestataire puis séquestrés jusqu’à confirmation du service.',
        { align: 'left' }
      )
      .fillColor('black');

    const bufferPromise = this.toBuffer(doc, chunks);
    doc.end();
    const buffer = await bufferPromise;

    const metadata: Prisma.JsonObject = {
      invoiceNumber,
      paymentId: payment.id,
      issueDate: issueDate.toISOString(),
      totalCents: booking.pricingTotalCents,
      ecoSurchargeCents: booking.pricingEcoCents,
      loyaltyCreditsCents: booking.pricingLoyaltyCents,
      paymentMethod: payment.method ?? null,
    };
    if (payment.externalMandateId) {
      metadata.externalMandateId = payment.externalMandateId;
    }
    if (payment.billingName) {
      metadata.billingName = payment.billingName;
    }
    if (payment.billingEmail) {
      metadata.billingEmail = payment.billingEmail;
    }

    const document = await this.saveDocument({
      buffer,
      fileName: `invoice-${booking.id}-${issueDate.getTime()}.pdf`,
      displayName: `Facture-${invoiceNumber}.pdf`,
      bookingId: booking.id,
      type: 'invoice',
      category: 'client_invoice',
      metadata,
    });

    const invoiceRecord = await this.prisma.invoice.upsert({
      where: { paymentId: payment.id },
      update: {
        booking: { connect: { id: booking.id } },
        invoiceNumber,
        issuedAt: issueDate,
        status: 'issued',
        currency: booking.pricingCurrency,
        subtotalCents: booking.pricingSubtotalCents,
        ecoSurchargeCents: booking.pricingEcoCents,
        loyaltyCreditsCents: booking.pricingLoyaltyCents,
        extrasCents: booking.pricingExtrasCents,
        taxCents: booking.pricingTaxCents,
        totalCents: booking.pricingTotalCents,
        document: { connect: { id: document.id } },
      },
      create: {
        booking: { connect: { id: booking.id } },
        payment: { connect: { id: payment.id } },
        invoiceNumber,
        issuedAt: issueDate,
        status: 'issued',
        currency: booking.pricingCurrency,
        subtotalCents: booking.pricingSubtotalCents,
        ecoSurchargeCents: booking.pricingEcoCents,
        loyaltyCreditsCents: booking.pricingLoyaltyCents,
        extrasCents: booking.pricingExtrasCents,
        taxCents: booking.pricingTaxCents,
        totalCents: booking.pricingTotalCents,
        document: { connect: { id: document.id } },
      },
      include: { document: true },
    });

    return {
      document: invoiceRecord.document ?? document,
      invoice: invoiceRecord,
    };
  }

  async generateProviderStatement(params: { payoutId: string }): Promise<Document | null> {
    const payout = await this.prisma.providerPayout.findUnique({
      where: { id: params.payoutId },
      include: {
        provider: { include: { user: true } },
        batch: true,
      },
    });

    if (!payout) {
      return null;
    }

    const missions = this.normalizeMissions(payout.missions);
    const issueDate = new Date();
    const plannedDate = payout.batch?.scheduledFor ?? issueDate;

    const doc = new PdfKit({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    this.printHeader(doc, 'Relevé de versement prestataire');
    this.printCompanyBlock(doc);
    doc.moveDown();

    doc.fontSize(11).text('Prestataire', { underline: true });
    doc
      .fontSize(10)
      .text(`${payout.provider.user.firstName ?? ''} ${payout.provider.user.lastName ?? ''}`.trim());
    if (payout.provider.serviceAreas.length) {
      doc.text(`Zones : ${payout.provider.serviceAreas.join(', ')}`);
    }
    doc.moveDown();
    this.printKeyValue(doc, 'Lot de versement', payout.batchId ?? '—');
    this.printKeyValue(doc, 'Statut', payout.status);
    this.printKeyValue(doc, 'Versement prévu le', this.formatDate(plannedDate));

    doc.moveDown();
    doc.fontSize(11).text('Missions incluses', { underline: true });

    const missionSummaries = missions.map((mission, index) => {
      const breakdown = this.computeMissionBreakdown(mission);
      doc
        .fontSize(10)
        .text(`${index + 1}. Booking ${mission.bookingId} · ${mission.service}`)
        .text(
          `${mission.city ?? 'Ville inconnue'} · ${mission.startAt ? this.formatDateTime(new Date(mission.startAt)) : '—'}`
        )
        .text(
          `Brut client: ${this.formatCurrency(breakdown.grossCents)} | Commission (25%): ${this.formatCurrency(
            breakdown.commissionCents
          )} | TVA: ${this.formatCurrency(breakdown.vatCents)} | Net: ${this.formatCurrency(breakdown.netCents)}`
        )
        .moveDown(0.5);
      return breakdown;
    });

    const totals = missionSummaries.reduce(
      (acc, breakdown) => ({
        grossCents: acc.grossCents + breakdown.grossCents,
        commissionCents: acc.commissionCents + breakdown.commissionCents,
        vatCents: acc.vatCents + breakdown.vatCents,
        netCents: acc.netCents + breakdown.netCents,
      }),
      { grossCents: 0, commissionCents: 0, vatCents: 0, netCents: 0 }
    );

    doc.moveDown();
    doc.fontSize(11).text('Synthèse du lot', { underline: true });
    this.printAmountRow(doc, 'Montant client brut', totals.grossCents);
    this.printAmountRow(doc, 'Commission Saubio (25%)', totals.commissionCents);
    this.printAmountRow(doc, 'TVA sur commission (19%)', totals.vatCents);
    this.printAmountRow(doc, 'Net versé', totals.netCents, true);

    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .fillColor('#4b5563')
      .text(
        'Les fonds restent séquestrés jusqu’à confirmation client/prestataire ou résolution de litige. Les virements groupés ont lieu chaque vendredi et peuvent être forcer par l’administration.',
        { align: 'left' }
      )
      .fillColor('black');

    const bufferPromise = this.toBuffer(doc, chunks);
    doc.end();
    const buffer = await bufferPromise;

    const document = await this.saveDocument({
      buffer,
      fileName: `payout-${payout.id}-${issueDate.getTime()}.pdf`,
      displayName: `Releve-${this.formatDate(issueDate)}.pdf`,
      providerId: payout.providerId,
      payoutId: payout.id,
      type: 'payout_statement',
      category: 'payout_statement',
      metadata: {
        batchId: payout.batchId,
        scheduledFor: plannedDate.toISOString(),
        missionCount: missions.length,
        totals,
      },
    });

    return document;
  }

  private async saveDocument(params: {
    buffer: Buffer;
    fileName: string;
    displayName?: string;
    bookingId?: string;
    providerId?: string;
    payoutId?: string;
    type: 'invoice' | 'payout_statement';
    category: 'client_invoice' | 'payout_statement';
    metadata?: Record<string, unknown>;
  }): Promise<Document> {
    const dir = join(process.cwd(), 'generated', 'invoices');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const filePath = join(dir, params.fileName);
    writeFileSync(filePath, params.buffer);

    const metadata: Prisma.JsonObject = {
      generated: true,
      category: params.category,
      filePath,
      ...(params.metadata ?? {}),
    };

    const created = await this.prisma.document.create({
      data: {
        type: params.type === 'invoice' ? DocumentType.INVOICE : DocumentType.OTHER,
        url: filePath,
        name: params.displayName ?? params.fileName,
        metadata,
        booking: params.bookingId ? { connect: { id: params.bookingId } } : undefined,
        provider: params.providerId ? { connect: { id: params.providerId } } : undefined,
        providerPayout: params.payoutId ? { connect: { id: params.payoutId } } : undefined,
      },
    });

    const apiEnv =
      process.env.API_BASE_URL ?? process.env.SAUBIO_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
    const defaultBase = `http://localhost:${this.configService.get('app.port' as keyof AppEnvironmentConfig) ?? 3001}`;
    const baseUrl = (apiEnv ?? defaultBase).replace(/\/+$/, '');
    const normalizedApiBase = /\/api$/.test(baseUrl) ? baseUrl : `${baseUrl}/api`;
    const downloadPath = `${normalizedApiBase}/documents/${created.id}/download`;

    return this.prisma.document.update({
      where: { id: created.id },
      data: {
        url: downloadPath,
      },
    });
  }

  private buildInvoiceNumber(paymentId: string, issueDate: Date) {
    const suffix = paymentId.slice(-4).toUpperCase();
    return `SAU-${issueDate.getFullYear()}-${suffix}`;
  }

  private formatCurrency(valueCents: number) {
    return this.currencyFormatter.format((valueCents ?? 0) / 100);
  }

  private formatDate(value: Date) {
    return this.dateFormatter.format(value);
  }

  private formatDateTime(value: Date) {
    return this.dateTimeFormatter.format(value);
  }

  private printHeader(doc: PdfKit.PDFDocument, title: string) {
    doc.fontSize(18).text(title, { align: 'left' });
  }

  private printCompanyBlock(doc: PdfKit.PDFDocument) {
    doc
      .fontSize(10)
      .text(COMPANY_INFO.name)
      .text(`${COMPANY_INFO.street}`)
      .text(`${COMPANY_INFO.postalCode} ${COMPANY_INFO.city}`)
      .text(COMPANY_INFO.country)
      .text(`USt-IdNr : ${COMPANY_INFO.vatNumber}`)
      .text(`Contact : ${COMPANY_INFO.email}`);
  }

  private printKeyValue(doc: PdfKit.PDFDocument, label: string, value: string) {
    doc.fontSize(10).text(`${label} : ${value}`);
  }

  private printAmountRow(doc: PdfKit.PDFDocument, label: string, valueCents: number, bold = false) {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .text(`${label.padEnd(30, '.')} ${this.formatCurrency(valueCents)}`);
    if (bold) {
      doc.font('Helvetica');
    }
  }

  private describePaymentMethod(payment: Payment): { label: string; note?: string } {
    const snapshot =
      payment.paymentMethodSnapshot &&
      typeof payment.paymentMethodSnapshot === 'object' &&
      !Array.isArray(payment.paymentMethodSnapshot)
        ? (payment.paymentMethodSnapshot as Record<string, unknown>)
        : null;

    if (payment.method === 'SEPA') {
      const bits: string[] = [];
      const ibanLast4 = snapshot && typeof snapshot.last4 === 'string' ? snapshot.last4 : null;
      if (ibanLast4) {
        bits.push(`IBAN •••• ${ibanLast4}`);
      }
      if (payment.externalMandateId) {
        bits.push(`Mandat ${payment.externalMandateId}`);
      }
      return {
        label: 'Prélèvement SEPA',
        note: bits.length ? bits.join(' · ') : undefined,
      };
    }

    if (payment.method === 'CARD') {
      const brand =
        snapshot && typeof snapshot.brand === 'string'
          ? snapshot.brand.toUpperCase()
          : 'Carte bancaire';
      const last4 = snapshot && typeof snapshot.last4 === 'string' ? snapshot.last4 : null;
      const suffix = last4 ? ` •••• ${last4}` : '';
      return { label: `${brand}${suffix}` };
    }

    return { label: 'Paiement Mollie' };
  }

  private normalizeMissions(value: Prisma.JsonValue | null): StoredMission[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((mission) => (typeof mission === 'object' && mission !== null ? (mission as StoredMission) : null))
      .filter((mission): mission is StoredMission => Boolean(mission?.bookingId && mission?.paymentDistributionId));
  }

  private computeMissionBreakdown(mission: StoredMission) {
    const grossCents =
      mission.clientTotalCents && mission.clientTotalCents > mission.amountCents
        ? mission.clientTotalCents
        : Math.round(mission.amountCents / NET_SHARE_FACTOR);
    const commissionCents = Math.round(grossCents * PLATFORM_COMMISSION_RATE);
    const vatCents = Math.round(commissionCents * VAT_RATE);
    const netCents = mission.amountCents;
    return { grossCents, commissionCents, vatCents, netCents };
  }

  private async toBuffer(doc: PdfKit.PDFDocument, chunks: Buffer[]) {
    return new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}

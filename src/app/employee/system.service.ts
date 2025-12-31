import { Injectable } from '@nestjs/common';
import type {
  AdminPaginatedResponse,
  AdminSystemApiKeyItem,
  AdminSystemExportJobItem,
  AdminSystemHealthResponse,
  AdminSystemImportJobItem,
  AdminSystemInfoResponse,
  AdminSystemIntegrationsResponse,
  AdminWebhookLogDetail,
  AdminWebhookLogItem,
} from '@saubio/models';
import { SystemObservabilityService, WebhookLogListParams } from '../system/system-observability.service';
import {
  SystemApiKeysQueryDto,
  SystemExportJobsQueryDto,
  SystemImportJobsQueryDto,
  SystemWebhookLogsQueryDto,
} from './dto/admin-system.dto';

@Injectable()
export class EmployeeSystemService {
  constructor(private readonly observability: SystemObservabilityService) {}

  getHealthOverview(): Promise<AdminSystemHealthResponse> {
    return this.observability.getHealthOverview();
  }

  getIntegrationsOverview(): Promise<AdminSystemIntegrationsResponse> {
    return this.observability.getIntegrationsOverview();
  }

  listWebhookEvents(query: SystemWebhookLogsQueryDto): Promise<AdminPaginatedResponse<AdminWebhookLogItem>> {
    const toNumber = (value?: string) => {
      if (value === undefined || value === null) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const params: WebhookLogListParams = {
      page: toNumber(query.page),
      pageSize: toNumber(query.pageSize),
      provider: query.provider,
      status: query.status,
      eventType: query.eventType,
      resourceId: query.resourceId,
      bookingId: query.bookingId,
      paymentId: query.paymentId,
      providerProfileId: query.providerProfileId,
      userId: query.userId,
      search: query.search,
      from: query.from,
      to: query.to,
    };
    return this.observability.listWebhookEvents(params);
  }

  getWebhookEvent(id: string): Promise<AdminWebhookLogDetail> {
    return this.observability.getWebhookEvent(id);
  }

  getSystemInfo(): Promise<AdminSystemInfoResponse> {
    return this.observability.getSystemInfo();
  }

  listApiKeys(query: SystemApiKeysQueryDto): Promise<AdminPaginatedResponse<AdminSystemApiKeyItem>> {
    return this.observability.listApiKeys(this.mapPagedQuery(query));
  }

  listImportJobs(query: SystemImportJobsQueryDto): Promise<AdminPaginatedResponse<AdminSystemImportJobItem>> {
    return this.observability.listImportJobs(this.mapPagedQuery(query));
  }

  listExportJobs(query: SystemExportJobsQueryDto): Promise<AdminPaginatedResponse<AdminSystemExportJobItem>> {
    return this.observability.listExportJobs(this.mapPagedQuery(query));
  }

  private mapPagedQuery<T extends { page?: string; pageSize?: string }>(query: T) {
    const toNumber = (value?: string) => {
      if (value === undefined || value === null) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    return {
      ...query,
      page: toNumber(query.page),
      pageSize: toNumber(query.pageSize),
    };
  }
}

import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { Observable } from 'rxjs';

export interface NotificationRealtimeEvent {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: string;
  notificationId?: string;
}

export interface NotificationAdapter {
  name: string;
  handle(event: NotificationRealtimeEvent): Promise<void> | void;
}

@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);
  private readonly userStreams = new Map<string, Set<(event: NotificationRealtimeEvent) => void>>();
  private readonly adapters = new Map<string, NotificationAdapter>();

  registerAdapter(adapter: NotificationAdapter) {
    if (this.adapters.has(adapter.name)) {
      this.logger.warn(`Notification adapter "${adapter.name}" is already registered. Overwriting.`);
    }
    this.adapters.set(adapter.name, adapter);
  }

  createStream(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const handlers = this.userStreams.get(userId) ?? new Set();
      const handler = (event: NotificationRealtimeEvent) => {
        subscriber.next({ data: event });
      };
      handlers.add(handler);
      this.userStreams.set(userId, handlers);

      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.userStreams.delete(userId);
        }
      };
    });
  }

  async broadcast(event: NotificationRealtimeEvent) {
    this.dispatchToStreams(event);
    await this.dispatchToAdapters(event);
  }

  async broadcastBatch(events: NotificationRealtimeEvent[]) {
    for (const event of events) {
      this.dispatchToStreams(event);
    }
    if (!this.adapters.size) {
      return;
    }
    for (const event of events) {
      await this.dispatchToAdapters(event);
    }
  }

  private dispatchToStreams(event: NotificationRealtimeEvent) {
    const subscribers = this.userStreams.get(event.userId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    subscribers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        this.logger.warn(
          `Realtime stream handler failed for user ${event.userId}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    });
  }

  private async dispatchToAdapters(event: NotificationRealtimeEvent) {
    if (!this.adapters.size) {
      return;
    }
    await Promise.all(
      Array.from(this.adapters.values()).map(async (adapter) => {
        try {
          await adapter.handle(event);
        } catch (error) {
          this.logger.error(
            `Notification adapter "${adapter.name}" failed`,
            error instanceof Error ? error.stack : undefined
          );
        }
      })
    );
  }
}


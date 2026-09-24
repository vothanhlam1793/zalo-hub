import { createHmac, randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { GoldConversationMessage } from '../../core/types.js';
import type { GoldLogger } from '../../core/logger.js';

type CaseStationWebhookConfig = {
  url: string;
  secret: string;
  accountId: string;
  conversationIds: Set<string>;
};

type OutboxRow = {
  id: string;
  event_id: string;
  delivery_id: string;
  account_id: string;
  conversation_id: string;
  source_message_id: string;
  event_type: string;
  payload: string;
  attempt_count: number;
};

const POLL_INTERVAL_MS = 1_000;
const DELIVERY_TIMEOUT_MS = 10_000;
const PROCESSING_LEASE_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;

function validateEndpoint(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('CASE_STATION_WEBHOOK_URL must be a valid URL');
  }

  const isLocalDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(isLocalDevelopment && parsed.protocol === 'http:')) {
    throw new Error('CASE_STATION_WEBHOOK_URL must use HTTPS (HTTP is allowed only for localhost outside production)');
  }
  return parsed.toString();
}

function redactedEndpoint(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//<redacted>`;
}

function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 425 || status === 429;
}

function retryDelayMs(attempt: number): number {
  const exponential = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.min(Math.max(attempt - 1, 0), 10)));
  // Equal jitter avoids synchronized retries while retaining a useful lower bound.
  return Math.min(MAX_BACKOFF_MS, Math.round(exponential * (0.5 + Math.random() * 0.5)));
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

function redactedDeliveryError(error: unknown, endpoint: string): string {
  let text = errorText(error);
  const parsed = new URL(endpoint);
  for (const sensitivePart of [endpoint, parsed.origin, parsed.host, parsed.hostname]) {
    if (sensitivePart) text = text.replaceAll(sensitivePart, '<redacted-endpoint>');
  }
  return text;
}

export class CaseStationWebhook {
  private readonly config: CaseStationWebhookConfig | null;
  private timer: NodeJS.Timeout | undefined;
  private pumping = false;
  private stopped = true;
  private readonly enqueueChains = new Map<string, Promise<void>>();

  constructor(private readonly logger: GoldLogger, private readonly knex: Knex) {
    const rawUrl = String(process.env.CASE_STATION_WEBHOOK_URL || '').trim();
    const secret = String(process.env.CASE_STATION_WEBHOOK_SECRET || '').trim();
    const accountId = String(process.env.CASE_STATION_ACCOUNT_ID || '').trim();
    const legacyConversationId = String(process.env.CASE_STATION_CONVERSATION_ID || '').trim();
    const conversationIds = String(process.env.CASE_STATION_CONVERSATION_IDS || legacyConversationId)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const configuredValues = [rawUrl, secret, accountId, conversationIds.length ? 'configured' : ''].filter(Boolean).length;

    if (configuredValues === 0) {
      this.config = null;
      this.logger.info('case_station_webhook_disabled');
      return;
    }
    if (configuredValues !== 4) {
      throw new Error('Case Station webhook configuration is incomplete');
    }

    const url = validateEndpoint(rawUrl);
    this.config = { url, secret, accountId, conversationIds: new Set(conversationIds) };
    this.logger.info('case_station_webhook_enabled', {
      endpoint: redactedEndpoint(url),
      accountId,
      conversationCount: conversationIds.length,
    });
  }

  start(): void {
    if (!this.config || !this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Persist an accepted runtime event before any network delivery is attempted. */
  enqueue(accountId: string, message: GoldConversationMessage): Promise<void> {
    const config = this.config;
    if (!config || accountId !== config.accountId || !config.conversationIds.has(message.conversationId)) {
      return Promise.resolve();
    }

    const streamKey = `${accountId}\u0000${message.conversationId}`;
    const previous = this.enqueueChains.get(streamKey) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(() => this.persistEvent(accountId, message));
    this.enqueueChains.set(streamKey, queued);
    const clear = () => {
      if (this.enqueueChains.get(streamKey) === queued) this.enqueueChains.delete(streamKey);
    };
    void queued.then(clear, clear);
    return queued;
  }

  private async persistEvent(accountId: string, message: GoldConversationMessage): Promise<void> {
    const eventId = randomUUID();
    const deliveryId = randomUUID();
    const eventType = message.direction === 'outgoing' ? 'message.sent.v1' : 'message.received.v1';
    const payload = JSON.stringify({
      eventId,
      type: eventType,
      occurredAt: message.timestamp,
      accountId,
      conversationId: message.conversationId,
      message: {
        id: message.providerMessageId || message.id,
        senderId: message.senderId || '',
        senderName: message.senderName || (message.direction === 'outgoing' ? 'Alta Võ' : 'Unknown'),
        direction: message.direction,
        text: message.text,
      },
    });

    await this.knex('case_station_webhook_outbox').insert({
      event_id: eventId,
      delivery_id: deliveryId,
      account_id: accountId,
      conversation_id: message.conversationId,
      source_message_id: message.providerMessageId || message.id,
      event_type: eventType,
      payload,
      status: 'pending',
    });
    this.logger.info('case_station_webhook_enqueued', {
      eventId,
      deliveryId,
      messageId: message.id,
      accountId,
      conversationId: message.conversationId,
    });
    this.schedule(0);
  }

  private schedule(delayMs: number): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.pump();
    }, delayMs);
    this.timer.unref();
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.pumping || !this.config) return;
    this.pumping = true;
    try {
      // Drain all currently due streams. A failed stream is held behind its head
      // event, while unrelated account/conversation streams remain eligible.
      for (;;) {
        const row = await this.claimNext();
        if (!row) break;
        await this.deliverClaimed(row);
      }
    } catch (error) {
      this.logger.error('case_station_webhook_worker_failed', { error: errorText(error) });
    } finally {
      this.pumping = false;
      this.schedule(POLL_INTERVAL_MS);
    }
  }

  private async claimNext(): Promise<OutboxRow | undefined> {
    return this.knex.transaction(async (trx) => {
      await trx.raw(`
        UPDATE case_station_webhook_outbox
        SET status = 'pending', locked_at = NULL, available_at = NOW(), updated_at = NOW(),
            last_error = COALESCE(last_error, 'processing lease expired')
        WHERE status = 'processing'
          AND locked_at < NOW() - (? * INTERVAL '1 millisecond')
      `, [PROCESSING_LEASE_MS]);

      const result = await trx.raw<{ rows: OutboxRow[] }>(`
        SELECT o.*
        FROM case_station_webhook_outbox o
        WHERE o.status = 'pending'
          AND o.available_at <= NOW()
          AND NOT EXISTS (
            SELECT 1
            FROM case_station_webhook_outbox earlier
            WHERE earlier.account_id = o.account_id
              AND earlier.conversation_id = o.conversation_id
              AND earlier.id < o.id
              AND earlier.status IN ('pending', 'processing')
          )
        ORDER BY o.id ASC
        LIMIT 1
        FOR UPDATE OF o SKIP LOCKED
      `);
      const row = result.rows[0] as OutboxRow | undefined;
      if (!row) return undefined;

      const updated = await trx('case_station_webhook_outbox')
        .where({ id: row.id, status: 'pending' })
        .update({
          status: 'processing',
          locked_at: trx.fn.now(),
          attempt_count: trx.raw('attempt_count + 1'),
          updated_at: trx.fn.now(),
        })
        .returning('*');
      return updated[0] as OutboxRow | undefined;
    });
  }

  private async deliverClaimed(row: OutboxRow): Promise<void> {
    const config = this.config;
    if (!config) return;
    const timestamp = new Date().toISOString();
    // Preserve the receiver's existing contract: HMAC-SHA256(timestamp + '.' + raw body).
    // delivery_id is stable and sent as a header, but is deliberately not in the canonical input.
    const signature = createHmac('sha256', config.secret).update(`${timestamp}.${row.payload}`).digest('hex');

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          'x-zalohub-delivery-id': row.delivery_id,
          'x-zalohub-timestamp': timestamp,
          'x-zalohub-signature': `sha256=${signature}`,
        },
        body: row.payload,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      if (response.ok) {
        await this.knex('case_station_webhook_outbox').where({ id: row.id }).update({
          status: 'delivered',
          locked_at: null,
          delivered_at: this.knex.fn.now(),
          last_http_status: response.status,
          last_error: null,
          updated_at: this.knex.fn.now(),
        });
        this.logger.info('case_station_webhook_delivered', {
          eventId: row.event_id,
          deliveryId: row.delivery_id,
          messageId: row.source_message_id,
          attempt: row.attempt_count,
        });
        return;
      }

      if (!isTransientStatus(response.status)) {
        await this.markPermanent(row, response.status, `HTTP ${response.status}`);
        return;
      }
      await this.retryLater(row, `HTTP ${response.status}`, response.status);
    } catch (error) {
      await this.retryLater(row, redactedDeliveryError(error, config.url));
    }
  }

  private async retryLater(row: OutboxRow, failure: string, httpStatus?: number): Promise<void> {
    const delayMs = retryDelayMs(row.attempt_count);
    await this.knex('case_station_webhook_outbox').where({ id: row.id }).update({
      status: 'pending',
      locked_at: null,
      available_at: this.knex.raw(`NOW() + (? * INTERVAL '1 millisecond')`, [delayMs]),
      last_http_status: httpStatus ?? null,
      last_error: failure,
      updated_at: this.knex.fn.now(),
    });
    this.logger.error('case_station_webhook_delivery_retry_scheduled', {
      eventId: row.event_id,
      deliveryId: row.delivery_id,
      messageId: row.source_message_id,
      attempt: row.attempt_count,
      delayMs,
      httpStatus,
      error: failure,
    });
  }

  private async markPermanent(row: OutboxRow, httpStatus: number, failure: string): Promise<void> {
    await this.knex('case_station_webhook_outbox').where({ id: row.id }).update({
      status: 'failed_permanent',
      locked_at: null,
      permanent_failed_at: this.knex.fn.now(),
      last_http_status: httpStatus,
      last_error: failure,
      updated_at: this.knex.fn.now(),
    });
    this.logger.error('case_station_webhook_permanent_configuration_failure', {
      eventId: row.event_id,
      deliveryId: row.delivery_id,
      messageId: row.source_message_id,
      attempt: row.attempt_count,
      httpStatus,
      endpoint: redactedEndpoint(this.config!.url),
    });
  }
}

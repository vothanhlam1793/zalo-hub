import type { DifyBotService, DifyBotConfig } from './dify-bot-service.js';
import type { GoldLogger } from '../../core/logger.js';
import type { GoldRuntime } from '../../core/runtime.js';
import type { GoldConversationMessage } from '../../core/types.js';

export class DifyBotExecutor {
  constructor(
    private readonly botService: DifyBotService,
    private readonly logger: GoldLogger,
  ) {}

  private matchesFilter(bot: DifyBotConfig, msg: GoldConversationMessage): boolean {
    if (!bot.enabled) return false;
    if (msg.isSelf) return false;
    if (msg.direction === 'outgoing') return false;

    if (bot.receive_groups && bot.receive_groups.length > 0) {
      if (!bot.receive_groups.includes(msg.conversationId)) {
        return false;
      }
    }

    return true;
  }

  async processMessage(
    accountId: string,
    runtime: GoldRuntime,
    message: GoldConversationMessage,
  ): Promise<void> {
    const bots = await this.botService.getEnabledBotsForAccount(accountId);
    if (bots.length === 0) return;

    for (const bot of bots) {
      if (!this.matchesFilter(bot, message)) continue;

      try {
        this.logger.info('dify_bot_processing', { botId: bot.id, botName: bot.name, messageId: message.id });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        // Only add Authorization if API key is configured (webhook triggers don't need it)
        if (bot.dify_api_key) {
          headers['Authorization'] = `Bearer ${bot.dify_api_key}`;
        }

        const response = await fetch(bot.dify_webhook_url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: message.text,
            sender_name: message.senderName ?? message.senderId ?? 'unknown',
            sender_id: message.senderId ?? '',
            conversation_id: message.conversationId,
            account_id: accountId,
            message_id: message.id,
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          this.logger.error('dify_bot_webhook_error', {
            botId: bot.id,
            status: response.status,
            body: body.slice(0, 200),
          });
          continue;
        }

        const data = await response.json() as { text?: string; answer?: string; output?: string };
        const replyText = (data.text ?? data.answer ?? data.output ?? '').trim();
        if (replyText) {
          await runtime.sendText(message.conversationId, replyText);
          this.logger.info('dify_bot_reply_sent', { botId: bot.id, botName: bot.name, messageId: message.id });
        }
      } catch (err) {
        this.logger.error('dify_bot_error', {
          botId: bot.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /** Attach this executor to a runtime's message listener.
   *  Returns an unsubscribe function. */
  attachToRuntime(accountId: string, runtime: GoldRuntime): () => void {
    return runtime.onConversationMessage((msg) => {
      this.processMessage(accountId, runtime, msg).catch((err) => {
        this.logger.error('dify_bot_executor_unhandled', {
          accountId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }
}

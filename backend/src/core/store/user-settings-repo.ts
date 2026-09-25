import type { Knex } from 'knex';
import type { UserNotificationSettings } from '../types.js';

export interface RawUserSettingsRow {
  id: string;
  user_id: string;
  desktop_notification: boolean;
  sound_enabled: boolean;
  sound_volume: number;
  notify_group_messages: boolean;
  show_message_preview: boolean;
  created_at: string;
  updated_at: string;
}

export class GoldUserSettingsRepo {
  private knex: Knex;

  constructor(knex: Knex) {
    this.knex = knex;
  }

  async getUserSettings(userId: string): Promise<UserNotificationSettings> {
    const row: RawUserSettingsRow | undefined = await this.knex('user_settings')
      .where('user_id', userId)
      .first();

    if (!row) {
      return {
        userId,
        desktopNotification: true,
        soundEnabled: true,
        soundVolume: 80,
        notifyGroupMessages: true,
        showMessagePreview: true,
      };
    }

    return {
      id: row.id,
      userId: row.user_id,
      desktopNotification: Boolean(row.desktop_notification),
      soundEnabled: Boolean(row.sound_enabled),
      soundVolume: Number(row.sound_volume ?? 80),
      notifyGroupMessages: Boolean(row.notify_group_messages),
      showMessagePreview: Boolean(row.show_message_preview),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateUserSettings(
    userId: string,
    updates: Partial<Omit<UserNotificationSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<UserNotificationSettings> {
    const existing = await this.knex('user_settings').where('user_id', userId).first();

    const dbPayload: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    };

    if (updates.desktopNotification !== undefined) dbPayload.desktop_notification = updates.desktopNotification;
    if (updates.soundEnabled !== undefined) dbPayload.sound_enabled = updates.soundEnabled;
    if (updates.soundVolume !== undefined) dbPayload.sound_volume = updates.soundVolume;
    if (updates.notifyGroupMessages !== undefined) dbPayload.notify_group_messages = updates.notifyGroupMessages;
    if (updates.showMessagePreview !== undefined) dbPayload.show_message_preview = updates.showMessagePreview;

    if (existing) {
      await this.knex('user_settings').where('user_id', userId).update(dbPayload);
    } else {
      await this.knex('user_settings').insert({
        user_id: userId,
        desktop_notification: updates.desktopNotification ?? true,
        sound_enabled: updates.soundEnabled ?? true,
        sound_volume: updates.soundVolume ?? 80,
        notify_group_messages: updates.notifyGroupMessages ?? true,
        show_message_preview: updates.showMessagePreview ?? true,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      });
    }

    return this.getUserSettings(userId);
  }
}

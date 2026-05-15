import { generatePcSignalKeys, buildSignalReq0Payload, type PcSignalKeys } from './zalo-pc-crypto.js';
import type { SharedState, HistorySyncResult } from './runtime/types.js';
import type { GoldConversationMessage } from './types.js';
import { createDecipheriv, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { normalizeMessageText, normalizeMessageKind, normalizeAttachments, normalizeImageUrl, getConversationId } from './runtime/normalizer.js';

const CHANNEL_FRAMES = [
  { version: 1, cmd: 0x021C, subCmd: 0, name: 'signal_req_0' },
  { version: 1, cmd: 0x0233, subCmd: 0, name: 'signal_req_1' },
  { version: 1, cmd: 0x0201, subCmd: 0, name: 'req_0' },
  { version: 1, cmd: 0x0202, subCmd: 0, name: 'req_1' },
  { version: 1, cmd: 0x0203, subCmd: 0, name: 'req_2' },
  { version: 1, cmd: 0x0205, subCmd: 0, name: 'req_3' },
  { version: 1, cmd: 0x0206, subCmd: 0, name: 'req_4' },
  { version: 1, cmd: 0x0262, subCmd: 1, name: 'req_5' },
  { version: 1, cmd: 0x0263, subCmd: 1, name: 'req_6' },
  { version: 1, cmd: 0x025B, subCmd: 1, name: 'req_7' },
  { version: 1, cmd: 0x0219, subCmd: 0, name: 'req_8' },
];

type CollectedMessage = {
  threadId: string;
  msgId: string;
  cliMsgId: string;
  uidFrom: string;
  text: string;
  kind: string;
  ts: number;
  data: Record<string, unknown>;
};

export class ZaloPcHandshake {
  private handshakeDone = false;
  private keys: PcSignalKeys | undefined;

  constructor(private readonly state: SharedState) {}

  isDone() {
    return this.handshakeDone;
  }

  private buildBinaryFrame(version: number, cmd: number, subCmd: number, payload: object): Buffer {
    const header = Buffer.alloc(4);
    header.writeUInt8(version, 0);
    header.writeUInt16LE(cmd, 1);
    header.writeUInt8(subCmd, 3);
    const json = JSON.stringify(payload);
    return Buffer.concat([header, Buffer.from(json, 'utf-8')]);
  }

  async runHandshake(): Promise<void> {
    if (this.handshakeDone) return;

    const listener = this.state.session?.api?.listener as any;
    const ws = listener?.ws;
    if (!ws || ws.readyState !== 1) {
      throw new Error('WebSocket khong san sang cho handshake');
    }

    const cipherKey = this.state.cipherKey;
    if (!cipherKey) {
      throw new Error('Cipher key chua co');
    }

    this.state.logger.info('pc_handshake_starting');

    this.keys = generatePcSignalKeys();

    const signalReq0Payload = {
      reqId: 'signal_req_0',
      data: buildSignalReq0Payload(this.keys),
    };

    const frame0 = this.buildBinaryFrame(1, 0x021C, 0, signalReq0Payload);
    ws.send(frame0);
    this.state.logger.info('pc_handshake_signal_req_0_sent', { len: frame0.length });
    await sleep(400);

    const signalReq1Payload = {
      reqId: 'signal_req_1',
      data: { reqIid: 1, first: true },
    };
    const frame1 = this.buildBinaryFrame(1, 0x0233, 0, signalReq1Payload);
    ws.send(frame1);
    this.state.logger.info('pc_handshake_signal_req_1_sent');
    await sleep(200);

    const currentUserId = this.state.currentAccount?.userId;
    if (currentUserId) {
      const signalReq2Payload = {
        reqId: 'signal_req_2',
        data: { uids: [{ uid: currentUserId, deviceId: 1 }] },
      };
      ws.send(this.buildBinaryFrame(1, 0x021D, 0, signalReq2Payload));
      this.state.logger.info('pc_handshake_signal_req_2_sent', { uid: currentUserId });

      const signalReq3Payload = {
        reqId: 'signal_req_3',
        data: { uids: [{ uid: currentUserId, deviceId: 1 }] },
      };
      ws.send(this.buildBinaryFrame(1, 0x021D, 0, signalReq3Payload));
      this.state.logger.info('pc_handshake_signal_req_3_sent');
      await sleep(200);
    }

    for (let i = 0; i < 8; i++) {
      const ch = CHANNEL_FRAMES[i + 2];
      const reqPayload = {
        first: true,
        reqId: `req_${i}`,
        lastId: 1,
        preIds: [] as string[],
      };
      const frame = this.buildBinaryFrame(ch.version, ch.cmd, ch.subCmd, reqPayload);
      ws.send(frame);
      await sleep(50);
    }
    this.state.logger.info('pc_handshake_channels_sent');

    const req8Payload = {
      lastId: 0,
      maxItem: 50,
      reqId: 'req_8',
    };
    const frame8 = this.buildBinaryFrame(1, 0x0219, 0, req8Payload);
    ws.send(frame8);
    this.state.logger.info('pc_handshake_req_8_sent');
    await sleep(300);

    this.handshakeDone = true;
    this.state.logger.info('pc_handshake_complete');
  }

  async requestMobileSync(
    threadId: string,
    threadType: 'direct' | 'group',
    timeoutMs: number = 15_000,
  ): Promise<{ received: number; insertedCount: number; dedupedCount: number; oldestTimestamp?: string }> {
    if (!this.handshakeDone) {
      await this.runHandshake();
    }

    const listener = this.state.session?.api?.listener as any;
    const ws = listener?.ws;
    if (!ws || ws.readyState !== 1) {
      throw new Error('WebSocket khong san sang');
    }

    const cipherKey = this.state.cipherKey;
    if (!cipherKey) {
      throw new Error('Cipher key chua co');
    }

    const cipherKeyBuf = Buffer.from(cipherKey, 'base64');
    let totalReceived = 0;
    let totalInserted = 0;
    let totalDeduped = 0;
    let oldestTimestamp: string | undefined;
    const collectedMessages: CollectedMessage[] = [];

    const onMessage = (event: { data: any }) => {
      const raw = event.data;
      if (!Buffer.isBuffer(raw) || raw.length < 5) return;
      const version = raw[0];
      const cmd = raw.readUInt16LE(1);

      if (version !== 1) return;

      try {
        const jsonStr = raw.subarray(4).toString('utf-8');
        const parsed = JSON.parse(jsonStr);

        if (!parsed.data || (parsed.error_code !== undefined && parsed.error_code !== 0)) return;

        const encryptType = parsed.encrypt as number;
        const rawData = parsed.data as string;
        if (!encryptType || typeof rawData !== 'string') return;

        const decodedBuf = Buffer.from(encryptType === 1 ? rawData : decodeURIComponent(rawData), 'base64');

        let decryptedBuf: Buffer;
        if (encryptType === 1) {
          decryptedBuf = decodedBuf;
        } else if (encryptType === 2) {
          const iv = decodedBuf.subarray(0, 16);
          const aad = decodedBuf.subarray(16, 32);
          const ciphertext = decodedBuf.subarray(32);
          const decipher = createDecipheriv('aes-128-gcm', cipherKeyBuf, iv);
          decipher.setAAD(aad);
          decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
          const plaintext = decipher.update(ciphertext.subarray(0, ciphertext.length - 16));
          decryptedBuf = Buffer.concat([plaintext, decipher.final()]);
        } else {
          return;
        }

        const decompressed = inflateSync(decryptedBuf);
        const decoded = new TextDecoder('utf-8').decode(decompressed);
        const parsedResult = JSON.parse(decoded);
        const resultData = parsedResult.data ?? parsedResult;

        const msgs = resultData.msgs ?? resultData.groupMsgs ?? [];
        const actions = resultData.actions ?? [];
        const allMessages = [...msgs, ...actions];

        for (const msg of allMessages) {
          const tId = String(msg.tId ?? msg.threadId ?? msg.idTo ?? '');
          if (tId !== threadId) continue;

          const msgId = String(msg.msgId ?? '');
          const cliMsgId = String(msg.cliMsgId ?? msgId);
          const uidFrom = String(msg.uidFrom ?? '');
          const ts = typeof msg.ts === 'number' ? msg.ts : Date.now();

          collectedMessages.push({
            threadId: tId,
            msgId,
            cliMsgId,
            uidFrom,
            text: normalizeMessageText(msg),
            kind: normalizeMessageKind(msg),
            ts,
            data: msg,
          });
        }

        this.state.logger.info('pc_handshake_req18_frame_decrypted', {
          threadId,
          cmd: `0x${cmd.toString(16)}`,
          msgsInFrame: allMessages.length,
        });
      } catch (err) {
        this.state.logger.info('pc_handshake_frame_parse_skip', { cmd, error: String(err).slice(0, 100) });
      }
    };

    ws.on('message', onMessage);

    const req18Frame = this.buildBinaryFrame(1, 0x023F, 0, {
      data: [{ tId: threadId }],
      reqId: 'req_18',
    });
    ws.send(req18Frame);
    this.state.logger.info('pc_handshake_req18_sent', { threadId });

    await sleep(timeoutMs);

    ws.off('message', onMessage);

    const conversationId = getConversationId(threadId, threadType);

    for (const msg of collectedMessages) {
      const text = msg.text;
      const kind = msg.kind;
      const attachments = normalizeAttachments(msg.data);
      const imageUrl = normalizeImageUrl(msg.data);

      if (!text && attachments.length === 0) continue;

      const normalized: GoldConversationMessage = {
        id: msg.msgId || randomUUID(),
        providerMessageId: msg.msgId || randomUUID(),
        conversationId,
        threadId: msg.threadId,
        conversationType: threadType,
        text: text || (kind !== 'text' ? `[${kind}]` : ''),
        kind: kind as GoldConversationMessage['kind'],
        attachments,
        imageUrl,
        direction: 'incoming',
        isSelf: false,
        senderId: msg.uidFrom,
        timestamp: new Date(msg.ts).toISOString(),
        rawMessageJson: JSON.stringify(msg.data),
      };

      totalReceived++;
      if (this.state.store.hasMessageByProviderIdForAccount(this.state.boundAccountId!, conversationId, (normalized.providerMessageId ?? normalized.id).trim())) {
        totalDeduped++;
      } else {
        const messageList = this.state.conversations.get(conversationId) ?? [];
        messageList.push(normalized);
        messageList.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
        this.state.conversations.set(conversationId, messageList);
        this.state.store.replaceConversationMessagesByAccount(this.state.boundAccountId!, conversationId, messageList);
        totalInserted++;
      }

      if (!oldestTimestamp || normalized.timestamp < oldestTimestamp) {
        oldestTimestamp = normalized.timestamp;
      }
    }

    this.state.logger.info('pc_handshake_req18_complete', {
      threadId,
      totalReceived,
      totalInserted,
      totalDeduped,
    });

    return {
      received: totalReceived,
      insertedCount: totalInserted,
      dedupedCount: totalDeduped,
      oldestTimestamp,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { parseBase64Image, mimeTypeToExtension, readFlag } from './normalizer.js';
import type { GoldLogger } from '../logger.js';

const jsQR = jsQRModule as unknown as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data: string } | null;

export async function renderQrToTerminal(qrCode: string, logger: GoldLogger) {
  try {
    const base64Image = parseBase64Image(qrCode);
    let qrPayload = qrCode;

    if (base64Image) {
      const savedPath = path.resolve(
        process.cwd(),
        'logs',
        'gold-1',
        `${logger.runId}.qr.${mimeTypeToExtension(base64Image.mimeType)}`,
      );
      writeFileSync(savedPath, base64Image.buffer);
      logger.info('qr_image_saved', { savedPath, mimeType: base64Image.mimeType, size: base64Image.buffer.length });

      if (base64Image.mimeType === 'image/png') {
        try {
          const png = PNG.sync.read(base64Image.buffer);
          const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
          if (decoded?.data) {
            qrPayload = decoded.data;
            logger.info('qr_image_decoded', { savedPath, decodedLength: decoded.data.length });
          } else {
            logger.error('qr_image_decode_failed', { savedPath, reason: 'jsqr_no_data' });
            return `Khong decode duoc QR tu anh base64. Anh da luu tai: ${savedPath}`;
          }
        } catch (error) {
          logger.error('qr_image_png_parse_failed', error);
          return `Khong parse duoc anh QR base64. Anh da luu tai: ${savedPath}`;
        }
      } else {
        return `QR dang o dang anh ${base64Image.mimeType}. Anh da luu tai: ${savedPath}`;
      }
    }

    const rendered = await QRCode.toString(qrPayload, { type: 'terminal', small: true });
    logger.info('qr_rendered_to_terminal');
    return rendered;
  } catch (error) {
    logger.error('qr_render_failed', error);
    return qrCode;
  }
}

export function parseSendArgs(argv: string[]) {
  const friendId = readFlag(argv, 'to');
  const text = readFlag(argv, 'text') ?? 'hello world';
  return { friendId, text };
}

import socket from 'node:socket';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';

/**
 * Script kết nối Chrome DevTools Protocol tới Zalo PC / Mac đang mở với cờ --remote-debugging-port
 * để tự động trích xuất chuỗi sessionUIN / dkey của phiên làm việc.
 */

interface CdpTarget {
  description: string;
  devtoolsFrontendUrl: string;
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export async function extractSessionUin(host = '127.0.0.1', port = 9222): Promise<string> {
  const jsonUrl = `http://${host}:${port}/json`;
  
  // 1. Fetch CDP targets
  const targets: CdpTarget[] = await new Promise((resolve, reject) => {
    http.get(jsonUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });

  const page = targets.find(t => t.url.includes('index.html')) || targets[0];
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error(`Không tìm thấy target Zalo web view tại ${jsonUrl}`);
  }

  const wsUrl = new URL(page.webSocketDebuggerUrl);

  // 2. Connect raw WebSocket client
  return new Promise((resolve, reject) => {
    const s = new (require('net').Socket)();
    s.connect(port, host, () => {
      const key = crypto.randomBytes(16).toString('base64');
      const req = `GET ${wsUrl.pathname} HTTP/1.1\r\n` +
                  `Host: ${host}:${port}\r\n` +
                  `Upgrade: websocket\r\n` +
                  `Connection: Upgrade\r\n` +
                  `Sec-WebSocket-Key: ${key}\r\n` +
                  `Sec-WebSocket-Version: 13\r\n\r\n`;
      s.write(req);
    });

    let handshaken = false;

    s.on('data', (buf: Buffer) => {
      if (!handshaken) {
        if (buf.toString('utf8').includes('101 Switching Protocols')) {
          handshaken = true;

          // Send Runtime.evaluate script
          const evalPayload = {
            id: 1,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                let req;
                window["webpackJsonp"].push([
                  [99999],
                  {
                    "hack_uin": function(m, e, r) { req = r; }
                  },
                  [["hack_uin"]]
                ]);
                const cache = req.c || {};
                for (const mid in cache) {
                  const exp = cache[mid].exports;
                  if (exp) {
                    if (typeof exp.getSessionUIN === "function") return exp.getSessionUIN();
                    if (exp.default && typeof exp.default.getSessionUIN === "function") return exp.default.getSessionUIN();
                    if (exp.n && typeof exp.n.getSessionUIN === "function") return exp.n.getSessionUIN();
                  }
                }
                return null;
              })()`,
              returnByValue: true,
            },
          };

          const data = Buffer.from(JSON.stringify(evalPayload), 'utf8');
          const mask = crypto.randomBytes(4);
          let header: Buffer;
          if (data.length < 126) {
            header = Buffer.concat([Buffer.from([0x81, 0x80 | data.length]), mask]);
          } else {
            const lenBuf = Buffer.alloc(2);
            lenBuf.writeUInt16BE(data.length, 0);
            header = Buffer.concat([Buffer.from([0x81, 0x80 | 126]), lenBuf, mask]);
          }
          const maskedData = Buffer.alloc(data.length);
          for (let i = 0; i < data.length; i++) {
            maskedData[i] = data[i] ^ mask[i % 4];
          }
          s.write(Buffer.concat([header, maskedData]));
        }
        return;
      }

      // Read response frame
      const lenByte = buf[1] & 0x7f;
      let offset = 2;
      let payloadLen = lenByte;
      if (lenByte === 126) {
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      }
      const rawJson = buf.slice(offset, offset + payloadLen).toString('utf8');
      try {
        const parsed = JSON.parse(rawJson);
        const uin = parsed?.result?.result?.value;
        s.end();
        if (uin) {
          resolve(uin);
        } else {
          reject(new Error('Không tìm thấy UIN từ Zalo runtime'));
        }
      } catch (e) {
        // partial frame, continue
      }
    });

    s.on('error', reject);
  });
}

// CLI runner
if (process.argv[1]?.endsWith('get-session-uin.ts')) {
  const host = process.argv[2] || '127.0.0.1';
  const port = parseInt(process.argv[3] || '9222', 10);
  extractSessionUin(host, port)
    .then((uin) => {
      console.log(`\n🔑 THÀNH CÔNG: sessionUIN = ${uin}\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Lỗi trích xuất UIN:', err.message);
      process.exit(1);
    });
}

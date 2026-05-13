import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { GoldLogger } from './logger.js';
import { GoldRuntime } from './runtime.js';
import { GoldStore } from './store.js';

function printUsage() {
  console.log(`cli usage:

  npm run cli:menu
  npm run cli:login
  npm run cli:friends
  npm run cli:doctor
  npm run cli:send -- --to <friendId> --text "hello world"
`);
}

async function runLogin(runtime: GoldRuntime) {
  console.log('[cli] Dang tao QR login...');
  const result = await runtime.loginByQr({
    async onQr(qrCode) {
      console.log('[cli] QR code payload:');
      console.log(qrCode);
      console.log('[cli] QR render:');
      console.log(await runtime.renderQrToTerminal(qrCode));
      console.log('[cli] Dang cho quet QR va xac nhan tren dien thoai...');
    },
  });
  console.log('[cli] Dang nhap thanh cong, da luu credential.');
  console.log(result.qrCode);
}

async function runFriends(runtime: GoldRuntime) {
  const friends = await runtime.listFriends();
  console.log(`[cli] friends=${friends.length}`);
  for (const friend of friends) {
    console.log(`${friend.userId}\t${friend.displayName}`);
  }
}

async function runSend(runtime: GoldRuntime, friendId: string, text: string) {
  const result = await runtime.sendText(friendId, text);
  console.log('[cli] send result');
  console.log(JSON.stringify(result, null, 2));
}

async function runDoctor(runtime: GoldRuntime) {
  const result = await runtime.doctor();
  console.log(JSON.stringify(result, null, 2));
}

async function runMenu(runtime: GoldRuntime) {
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      console.log('\n=== cli menu ===');
      console.log('1. Login bang QR');
      console.log('2. Tai danh sach ban be');
      console.log('3. Gui tin nhan');
      console.log('4. Doctor');
      console.log('5. Thoat');

      const choice = (await rl.question('Chon [1-5]: ')).trim();

      if (choice === '1') {
        await runLogin(runtime);
        continue;
      }

      if (choice === '2') {
        await runFriends(runtime);
        continue;
      }

      if (choice === '3') {
        const friendId = (await rl.question('Nhap friendId: ')).trim();
        if (!friendId) {
          console.log('[cli] friendId la bat buoc.');
          continue;
        }
        const text = (await rl.question('Nhap noi dung [mac dinh: hello world]: ')).trim() || 'hello world';
        await runSend(runtime, friendId, text);
        continue;
      }

      if (choice === '4') {
        await runDoctor(runtime);
        continue;
      }

      if (choice === '5') {
        return;
      }

      console.log('[cli] Lua chon khong hop le.');
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  const logger = new GoldLogger();
  const runtime = new GoldRuntime(new GoldStore(), logger);

  logger.info('cli_started', { command, args, logFile: logger.filePath });

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === 'menu') {
    await runMenu(runtime);
    return;
  }

  if (command === 'login') {
    await runLogin(runtime);
    return;
  }

  if (command === 'friends') {
    await runFriends(runtime);
    return;
  }

  if (command === 'send') {
    const { friendId, text } = GoldRuntime.parseSendArgs(args);
    if (!friendId) {
      throw new Error('Thieu --to <friendId>');
    }

    await runSend(runtime, friendId, text);
    return;
  }

  if (command === 'doctor') {
    await runDoctor(runtime);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown cli failure';
  console.error('[cli] failed:', message);
  process.exitCode = 1;
});

import knexPkg from 'knex';

const knex = knexPkg({
  client: 'pg',
  connection: 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
});

async function main() {
  const accountId = '2223644954053185337';
  const sessionRow = await knex('account_sessions').where({ account_id: accountId }).first();
  if (!sessionRow) {
    console.error('Không tìm thấy session');
    process.exit(1);
  }

  const rawCookies = typeof sessionRow.cookie_json === 'string'
    ? JSON.parse(sessionRow.cookie_json)
    : sessionRow.cookie_json;

  const cookieHeader = rawCookies.map((c: any) => `${c.name || c.key}=${c.value}`).join('; ');
  const zpw_sek = rawCookies.find((c: any) => (c.name || c.key) === 'zpw_sek')?.value;

  console.log('🔍 Testing Zalo Sync Action API...');
  console.log('zpw_sek:', zpw_sek ? zpw_sek.slice(0, 30) + '...' : 'none');

  // Test endpoints for manual sync trigger
  const endpoints = [
    'https://synca-wpa.chat.zalo.me/api/synchistory/request',
    'https://chat.zalo.me/api/synchistory/request',
    'https://synca-wpa.chat.zalo.me/api/sync/request',
    'https://wpa.chat.zalo.me/api/synchistory/request',
  ];

  for (const url of endpoints) {
    try {
      console.log(`\nTesting: ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': sessionRow.user_agent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://chat.zalo.me/',
          'Origin': 'https://chat.zalo.me',
        },
        body: new URLSearchParams({
          zpw_sek: zpw_sek || '',
          imei: sessionRow.imei,
        }),
      });

      console.log(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log('Response:', text.slice(0, 300));
    } catch (err: any) {
      console.log('Error:', err.message);
    }
  }

  await knex.destroy();
}

main();

import { GatewayStore } from './store.js';

const store = new GatewayStore();
await store.migrate();
await store.knex.destroy();

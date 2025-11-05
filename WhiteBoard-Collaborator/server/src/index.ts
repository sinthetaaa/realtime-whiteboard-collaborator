import { Server } from '@hocuspocus/server';

const port = Number(process.env.PORT ?? process.env.WS_PORT ?? 4000);
const address = process.env.HOST ?? '0.0.0.0';

const server = new Server({
  port,
  address,
});

server.listen().then(() => {
  const displayHost = address === '0.0.0.0' ? 'localhost' : address;
  console.log(`✅ Hocuspocus running at ws://${displayHost}:${port}`);
}).catch((err) => {
  console.error('❌ Failed to start Hocuspocus server', err);
  process.exitCode = 1;
});

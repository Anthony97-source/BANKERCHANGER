import app from './server';
import { pollEvents } from './poller';
import { initWebSocketServer } from './ws';
import { logger } from './logger';

const PORT = process.env.PORT || 3002;

const httpServer = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Indexer REST API running');
  // Start polling Horizon in the background
  pollEvents();
});

initWebSocketServer(httpServer);
logger.info({ port: PORT, path: '/ws' }, 'Indexer WebSocket stream available');
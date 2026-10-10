import { FencedStorage } from '../infrastructure/storage/fenced.js';
import { databasePool, serviceConfig, startupFailed } from '@business-platform/platform';
import { mediaConfig } from '../infrastructure/config.js';
import { mediaApplication } from './application.js';
import { privateStorage } from './dependencies.js';
const service = 'media' as const;
try {
  const config = serviceConfig(service),
    settings = mediaConfig(),
    pool = await databasePool(config.database),
    storage = new FencedStorage(await privateStorage(settings), pool);
  let app;
  try {
    app = await mediaApplication(config, pool, storage, settings);
  } catch (error) {
    await storage.close();
    await pool.end();
    throw error;
  }

  try {
    await app.listen(config.port, config.host);
  } catch (error) {
    await app.close();
    throw error;
  }
  console.log(JSON.stringify({ event: 'service.started', service, port: config.port }));
} catch (error) {
  startupFailed(service, error);
}

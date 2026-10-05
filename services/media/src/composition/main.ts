import { databasePool, serviceConfig, startupFailed } from '@golden-lift/platform';
import { mediaConfig } from '../infrastructure/config.js';
import { mediaApplication } from './application.js';
import { privateStorage } from './dependencies.js';
const service = 'media' as const;
try {
  const config = serviceConfig(service),
    settings = mediaConfig(),
    storage = await privateStorage(settings),
    pool = await databasePool(config.database);
  let app;
  try {
    app = await mediaApplication(config, pool, storage, settings);
  } catch (error) {
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

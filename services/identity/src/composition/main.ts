import { databasePool, serviceConfig, startupFailed } from '@golden-lift/platform';
import { identityConfig } from '../infrastructure/config.js';
import { identityApplication } from './application.js';
const service = 'identity' as const;
try {
  const config = serviceConfig(service),
    options = identityConfig(config),
    pool = await databasePool(config.database);
  let runtime;
  try {
    runtime = await identityApplication(options, pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
  try {
    await runtime.app.listen(config.port, config.host);
  } catch (error) {
    await runtime.app.close();
    throw error;
  }
  console.log(JSON.stringify({ event: 'service.started', service, port: config.port }));
} catch (error) {
  startupFailed(service, error);
}

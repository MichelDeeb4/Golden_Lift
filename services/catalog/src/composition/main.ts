import {
  databasePool,
  serviceConfig,
  startupFailed,
  IdentitySessionClient,
  identityClientConfig,
} from '@golden-lift/platform';
import { catalogApplication } from './application.js';
try {
  const config = serviceConfig('catalog'),
    authentication = new IdentitySessionClient(identityClientConfig('catalog')),
    pool = await databasePool(config.database);
  let app;
  try {
    app = await catalogApplication(config, pool, authentication);
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
  console.log(JSON.stringify({ event: 'service.started', service: 'catalog', port: config.port }));
} catch (error) {
  startupFailed('catalog', error);
}

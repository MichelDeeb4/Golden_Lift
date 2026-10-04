import { httpConfig, startupFailed, upstreams } from '@golden-lift/platform';
import { gatewayApplication } from './application.js';
try {
  const config = httpConfig('gateway'),
    app = await gatewayApplication(config, upstreams());
  try {
    await app.listen(config.port, config.host);
  } catch (error) {
    await app.close();
    throw error;
  }
  console.log(JSON.stringify({ event: 'service.started', service: 'gateway', port: config.port }));
} catch (error) {
  startupFailed('gateway', error);
}

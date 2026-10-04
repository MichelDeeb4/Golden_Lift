const name = process.env.SERVICE_NAME;
if (!['gateway', 'identity', 'catalog', 'media', 'inquiries'].includes(name))
  throw new Error('Set a supported SERVICE_NAME.');
await import('../services/' + name + '/dist/composition/main.js');

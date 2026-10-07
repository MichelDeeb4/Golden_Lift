// Expo replaces these public variables at build time. No service secrets belong here.
export const frontendConfiguration = {
  apiOrigin: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  mediaOrigin: process.env.EXPO_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3003',
  dataMode: process.env.EXPO_PUBLIC_APP_DATA_MODE ?? 'api',
};
if (!['api', 'demo'].includes(frontendConfiguration.dataMode))
  throw new Error('EXPO_PUBLIC_APP_DATA_MODE must be api or demo.');

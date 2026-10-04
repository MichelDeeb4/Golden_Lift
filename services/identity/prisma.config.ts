import { defineConfig } from 'prisma/config';
const url = process.env['IDENTITY_DATABASE_URL'];
export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(url ? { datasource: { url } } : {}),
});

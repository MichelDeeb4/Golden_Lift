import { defineConfig } from 'prisma/config';
const url = process.env['INQUIRIES_DATABASE_URL'];
export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(url ? { datasource: { url } } : {}),
});

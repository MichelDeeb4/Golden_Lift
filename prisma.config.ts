import { defineConfig } from 'prisma/config';
// Client mapping only: reviewed control/ERP SQL owns schema and migrations.
export default defineConfig({ schema: 'infrastructure/database/prisma/schema.prisma' });

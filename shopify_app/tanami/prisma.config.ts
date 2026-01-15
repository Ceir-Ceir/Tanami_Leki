// 1. Add this exact import at the very top
import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // This will now successfully find DIRECT_URL from your .env
    url: env('DIRECT_URL'),
  },
});
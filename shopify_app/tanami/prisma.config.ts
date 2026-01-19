// 1. Add this exact import at the very top
import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from .env file.
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
const port = parseInt(process.env.SQL_PORT || '5432', 10);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: databaseUrl
    ? {
        url: databaseUrl,
        ssl: false,
      }
    : {
        host: sqlHost || '',
        port,
        user: user || '',
        password: password || '',
        database: sqlDbName || '',
        ssl: false,
      },
  verbose: true,
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl || dbUrl.includes('[YOUR-PASSWORD]')) {
  console.error('\n❌ ERROR: DATABASE_URL is missing or contains placeholder [YOUR-PASSWORD] in .env file.');
  console.error('👉 Please edit d:\\workflow\\.env and set your actual Nhost Postgres password in DATABASE_URL.');
  console.error('Example: DATABASE_URL="postgres://postgres:YourActualPassword@puwxmgwnewcpwjizqfqb.db.ap-south-1.nhost.run:5432/puwxmgwnewcpwjizqfqb"\n');
  process.exit(1);
}

console.log('🔌 Connecting to PostgreSQL database...');

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('.nhost.run') ? { rejectUnauthorized: false } : false
});

async function run() {
  try {
    await client.connect();
    console.log('✅ Connected to database.');

    const migrationFiles = [
      path.join(rootDir, 'database', 'migrations', '001_initial_schema.sql'),
      path.join(rootDir, 'database', 'migrations', '002_views_and_functions.sql'),
      path.join(rootDir, 'database', 'migrations', '003_inbox_events_event_type.sql')
    ];

    console.log('\n📦 Applying database migrations in order...');

    for (const file of migrationFiles) {
      const fileName = path.basename(file);
      console.log(` -> Executing ${fileName}...`);
      const sql = fs.readFileSync(file, 'utf8');
      await client.query(sql);
      console.log(`    ✓ ${fileName} applied successfully.`);
    }

    console.log('\n🔍 Verifying schema...');
    const verifySqlFile = path.join(rootDir, 'database', 'scripts', 'verify_schema.sql');
    if (fs.existsSync(verifySqlFile)) {
      const verifySql = fs.readFileSync(verifySqlFile, 'utf8');
      await client.query(verifySql);
      console.log('✅ Schema verification completed successfully.');
    }

    console.log('\n🎉 Database migrations applied successfully!\n');
  } catch (err) {
    if (err.message.includes('SASL authentication failed') || err.message.includes('password authentication failed')) {
      console.error('\n❌ Database Authentication Failed!');
      console.error('👉 Your Nhost Postgres password in .env is incorrect.');
      console.error('1. Open Nhost Dashboard (https://app.nhost.io)');
      console.error('2. Go to Database -> Connection Settings');
      console.error('3. Reset/Copy Postgres Password and paste it into d:\\workflow\\.env DATABASE_URL\n');
    } else {
      console.error('\n❌ Migration failed with error:', err.message);
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run();

# Restoring a backup

The **Weekly backup** workflow saves an encrypted dump every Sunday and keeps the last 8 (56 days).

1. GitHub → this repo → **Actions** → **Weekly backup** → open the run you want → under **Artifacts**, download `veedu-backup-YYYY-MM-DD`. Unzip it to get `veedu-YYYY-MM-DD.tar.gz.gpg`.
2. Decrypt (you'll be asked for the `BACKUP_PASSPHRASE` you saved in your password manager):
   ```bash
   gpg --decrypt veedu-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz
   ```
   ```bash
   mkdir backup && tar -xzf backup.tar.gz -C backup
   ```
3. Create a fresh Supabase project (or reset the existing one), then copy its **Session pooler** connection string from **Connect**.
4. Restore roles, schema and data in one transaction (needs `psql` 17; on a Mac: `brew install libpq`):
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 --file backup/roles.sql --file backup/schema.sql --command 'SET session_replication_role = replica' --file backup/data.sql --dbname "<SESSION_POOLER_URL>"
   ```
5. Update the Supabase URL and keys in Vercel and in GitHub Secrets if the project changed.

Storage files (photos, PDFs) are **not** in the database dump. The usage monitor (phase 8) will note how much is in Storage; a storage export can be added later if you want one.

Tip: once a quarter, do a test restore into a throwaway free project to make sure backups work.

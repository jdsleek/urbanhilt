# Urban Hilt Recovery and Backup Runbook

## Current recovery findings

- `www.urbanhilt.com` is attached to the client Railway `urbanhilt` service.
- The web service has a Railway volume mounted at `/data/uploads`.
- Railway reports `urbanhilt-volume` as `READY`, but `currentSizeMB` was `0` during audit.
- The token used for this audit could read backup state, but was not authorized to create volume backups or schedules.
- The visible `urbanhilt-volume` backup list and backup schedule list were empty.
- The local repo `uploads/` folder is empty.
- Git history does not contain committed uploaded image files.
- Local `db/urbanhilt.db` contains seeded demo products using external Unsplash URLs, not client-uploaded `/uploads/...` files.
- The current client Postgres was empty when it became reachable, and the old app auto-seeded demo data. Production auto-seeding is now disabled unless `AUTO_SEED_EMPTY_DB=true`.

## What can restore the old uploaded product photos

One of these must exist:

- Railway volume backup from before the files disappeared.
- Another old deployment/service URL that still returns `200 image/*` for the exact `/uploads/<filename>` paths.
- A database dump/source DB that still contains the client catalog plus the image filenames.
- Client-held original product images from phone, laptop, WhatsApp, email, supplier drive, or design folder.

Postgres product rows store image path strings only. They do not store the image bytes.

## Commands

Check Railway volume/backups and live catalog image state:

```bash
npm run backup:audit
```

Export the currently reachable catalog and reachable image files:

```bash
npm run backup:catalog -- https://www.urbanhilt.com
```

Audit public `/uploads/...` image URLs:

```bash
npm run audit:images -- https://www.urbanhilt.com
```

## Required owner action

In Railway dashboard, open the client project:

1. Open `urbanhilt-volume`.
2. Check **Backups** manually.
3. If a backup exists from before the incident, restore/copy it into `/data/uploads`.
4. Enable scheduled backups for `urbanhilt-volume`.
5. If using external object storage later, migrate uploads to S3/R2 and keep DB paths as durable object URLs.

## Going forward

- Do not use container-local `uploads/` in production.
- Keep `UPLOADS_DIR=/data/uploads` mounted to a Railway volume.
- Keep `AUTO_SEED_EMPTY_DB` unset in production.
- Run `npm run backup:audit` after each deploy.
- Run `npm run backup:catalog` after major catalog updates until a stronger object-storage backup is added.

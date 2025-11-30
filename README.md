# Saubio Backend

Backend API for Saubio extracted from the original Nx monorepo. This project is now a standalone NestJS + Prisma application with its own dependencies and tooling so it can be deployed and versioned independently.

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL (development uses `postgresql://postgres:postgres@127.0.0.1:6543/saubio`)

## Installation

```bash
npm install
cp .env.example .env # or provide real secrets
```

## Database / Prisma

```bash
# apply migrations to the configured database
npm run prisma:deploy

# create / edit schema then migrate locally
npm run prisma:migrate -- --name <migration_name>

# regenerate Prisma Client if schema changes
npm run prisma:generate
```

## NPM Scripts

| Command | Description |
| --- | --- |
| `npm run start` | Start the compiled server (`dist/main.js`). |
| `npm run start:dev` | Watch mode using `ts-node` + live reload. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run lint` | Run ESLint on `src/` and `test/`. |
| `npm run test` | Unit tests (excludes e2e for now). |

## Project Structure

```
src/                # Nest modules/services/controllers
libs/config         # Shared runtime configuration types/helpers
libs/models         # Shared DTO/contract definitions
prisma/             # Schema + migrations
dist/               # Build output (gitignored)
```

## Development Flow

1. Ensure PostgreSQL is running and `DATABASE_URL` matches your environment.
2. Apply migrations (`npm run prisma:deploy`) and/or generate the client.
3. Start the API with `npm run start:dev`.
4. Run unit tests before committing (`npm run test`).

## Git Repository Setup

The backend lives in its own Git repository (e.g., `saubio-backend`). Initialize and push:

```bash
git init
git add .
git commit -m "chore: bootstrap standalone backend"
git branch -M main
git remote add origin git@github.com:<org>/saubio-backend.git
git push -u origin main
```

Repeat commits/pushes from this directory only so node_modules, builds, and other apps remain out of the history.

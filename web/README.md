# Luna Web

Next.js 16 App Router frontend for Luna. It owns the product UI, local
email/password auth, session/usage limits, memory hydration, and optional
R2 recording playback. The Python Pipecat bot in `../server` handles
real-time voice.

This is a short stub. See the root **README.md** for what this project is,
and **SETUP.md** for the full environment-variable reference and local-dev
walkthrough.

## Local development

```bash
cp .env.example .env.local     # fill in values — see ../SETUP.md
npm install
npm run dev
```

The app expects the bot at `NEXT_PUBLIC_BOT_URL` (`http://localhost:7860`
by default). Start it from `../server`.

## Useful commands

```bash
npm run dev
npm run db:migrate
npm run db:generate
npx tsc --noEmit
npm test
```

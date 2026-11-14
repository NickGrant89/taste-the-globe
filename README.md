# Taste the Globe

An illustrated atlas of food. Spin the globe, open a pin, and see the dish, plot, stall, or jar tied to that place.

This is a Day 1 build from Nick’s concept: recipes, allotments, free food, reviews, and a market, with profiles and messages. Sample pins are not live listings. There is no checkout.

## Local

```bash
cd /Users/Nick/Projects/taste-the-globe
npm install
npm run api    # http://127.0.0.1:8787
npm run dev    # http://127.0.0.1:5173
```

Sign in to pin food other people can see. Without the API, the globe and catalog still work on this device.

## This folder

This is the whole app. It is not part of magic-mirror. Open this folder as its own Cursor workspace:

`/Users/Nick/Projects/taste-the-globe`

Repo: https://github.com/NickGrant89/taste-the-globe

## Hosted

Send this link (public globe): **https://nickgrant89.github.io/taste-the-globe/**

GitHub Pages is the illustrated atlas only. Cursor can also publish a public app from this folder — pick **Public** when you confirm so anyone with the link can open it. Sign-in and share use web handlers in `api/` (`GET` / `POST` / `PUT` / `PATCH` / `DELETE`). Accounts and pins persist in Postgres when `DATABASE_URL` is set, otherwise PGlite, otherwise a local JSON file. The host does not run Node `createServer`.

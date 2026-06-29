# THE RIVER

Plateforme casino web avec un backend NestJS et un ancien front statique conserve a part.

## Structure

```txt
the-river/
  back/                 API NestJS, TypeORM, MySQL, Socket.IO
  front/                nouveau front Next.js
  front/legacy-static/  ancien front HTML/CSS/JS conserve sans refonte
  .env                  variables locales lues par le backend
```

Le backend est maintenant separe du front. Il ne sert plus les pages statiques: il expose uniquement l'API, les gateways Socket.IO et un endpoint de sante.

## Backend

```bash
cd back
npm install
npm run start:dev
```

API locale:

```txt
http://127.0.0.1:3000
```

Healthcheck:

```txt
GET /health
```

Swagger est actif hors production par defaut:

```txt
GET /api
```

## Variables utiles

Le backend charge `.env` depuis `back/.env` ou `../.env`.

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=password
DB_DATABASE=the_river
DB_SYNCHRONIZE=false
DB_LOGGING=false
DB_SSL=false

JWT_SECRET=change-me
JWT_EXPIRES_IN_SECONDS=86400

CORS_ORIGINS=http://localhost:3000,http://localhost:5173
SWAGGER_ENABLED=true
```

`DB_SYNCHRONIZE` est desactive par defaut. Active-le explicitement en local seulement si tu sais que TypeORM peut modifier ton schema.

## Verification

```bash
cd back
npm test -- --runInBand
npm run build
```

## Front Next.js

```bash
cd front
npm install
npm run dev
```

Front local:

```txt
http://127.0.0.1:3001
```

Variable utile cote front:

```env
API_PROXY_URL=http://127.0.0.1:3000
```

Par defaut, le front appelle `/api/*` sur Next.js, puis Next proxyfie vers le backend. Tu peux definir `NEXT_PUBLIC_API_URL` uniquement si tu veux appeler le backend directement depuis le navigateur.

Pages principales:

```txt
/
/login
/register
/dashboard
/games
/games/poker
/games/blackjack
/games/roulette
/games/slots
/games/craps
/easter-egg
```

## Ancien Front

Le dossier `front/legacy-static` contient l'ancien front HTML/CSS/JS. Il reste disponible comme reference pendant la migration vers le nouveau front Next.js.

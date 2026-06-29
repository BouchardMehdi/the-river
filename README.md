# THE RIVER

Plateforme casino web avec un backend NestJS et un ancien front statique conserve a part.

## Structure

```txt
the-river/
  back/                 API NestJS, TypeORM, MySQL, Socket.IO
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

## Front

Le dossier `front/legacy-static` contient l'ancien front. La future refonte React/Next pourra etre creee dans `front/` sans toucher au backend.

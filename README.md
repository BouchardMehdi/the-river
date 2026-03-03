# Poker API — NestJS (TypeScript)

API de poker **Texas Hold’em simplifié** développée avec **NestJS**, **TypeORM** et **SQLite**.  
Ce projet est conçu comme une **API backend** testable via **Postman**.
---

Participants: BOUCHARD Mehdi, NGAMGA Ashley

Temps de réalisation: 2 mois

## Table des matières

- [Présentation du projet](#présentation-du-projet)
- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation](#installation)
  - [Variables d’environnement (.env)](#variables-denvironnement-env)
  - [Installer les dépendances](#installer-les-dépendances)
  - [Dépendances principales](#dépendances-principales)
- [Lancer le projet](#lancer-le-projet)
- [Documentation API (Swagger)](#documentation-api-swagger)
  - [Accès à Swagger](#accès-à-swagger)
  - [Authentification dans Swagger](#authentification-dans-swagger)
- [Base de données (SQLite)](#base-de-données-sqlite)
- [Concept des tables](#concept-des-tables)
- [Authentification (JWT)](#authentification-jwt)
- [Routes API (Postman)](#routes-api-postman)
  - [Auth](#auth)
  - [Tables](#tables)
  - [Actions de jeu](#actions-de-jeu)
  - [Phase manuelles (tests)](#phases-manuelles-tests)
- [Gestion des gains (showdown, all-in, side pots, egalites)](#gestion-des-gains-showdown-all-in-side-pots-egalites)
  - [Combinaisons gérées (ordre)](#combinaisons-gérées-ordre)
  - [All-in et side pots](#all-in-et-side-pots)
  - [Egalites (split pot)](#egalites-split-pot)
  - [Champs JSON retournes apres end-hand](#egalites-split-pot)
- [Scénario Postman – Partie complète](#scénario-postman--partie-complète)
- [Règles importantes](#règles-importantes)
- [Sécurité](#sécurité)

# Présentation du projet

Cette API permet de gérer des parties de poker Texas Hold’em avec :
- joueurs humains authentifiés
- bots automatiques
- gestion des mises
- gestion des phases de jeu
- persistance des utilisateurs et de leurs crédits

Le calcul des **meilleures mains** n’est pas encore implémenté (volontairement).

## Fonctionnalités

- Authentification **JWT** (register / login)
- 3 tables fixes seedées :
  - `table-1`
  - `table-2`
  - `table-3`
- Rejoindre une table avec **buy-in**
- Débit du solde + stack égal au buy-in
- Démarrage de partie par l’owner
- Remplissage automatique par des **bots**
- Deck indépendant par table
- Mélange + **burn card**
- Phases :
  - `WAITING`
  - `PRE_FLOP`
  - `FLOP`
  - `TURN`
  - `RIVER`
- Actions :
  - `CHECK`
  - `BET`
  - `CALL`
  - `RAISE`
  - `FOLD`
  - `ALL_IN`
- Sécurité :
  - un joueur ne voit **que ses propres cartes**
- Fin de partie :
  - quand il reste **1 seul joueur avec stack > 0**
  - le stack du gagnant est transféré dans son solde
  - la table est reset

## Prérequis

- **Node.js >= 18**
- **npm >= 9**
- *(Optionnel)* **DB Browser for SQLite** pour consulter la base de données

## Installation

### Variables d’environnement (.env)

Ce projet utilise des variables d’environnement pour la configuration sensible (JWT, base de données, etc.).

Création du fichier .env

À la racine du projet, créer un fichier :
<pre>.env</pre>

Contenu minimal du fichier .env
<pre>
# Port de l API
PORT=3000

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=1d

# Database (SQLite)
DB_TYPE=sqlite
DB_NAME=poker.db
</pre>

Pour générer une JWT_SECRET vous pouvez utiliser cette commande
<pre>node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"</pre>

Utilisation dans NestJS
Les variables sont chargées via @nestjs/config.

Exemple d’utilisation :
<pre>
process.env.JWT_SECRET
process.env.DB_NAME
</pre>

### Installer les dépendances

**IMPORTANT**  
Si quelqu’un récupère le projet depuis GitHub, il doit **obligatoirement installer les dépendances Node**, car le dossier `node_modules` n’est **jamais versionné**.

<pre>npm install</pre>

### Dépendances principales

En pratique, tout est déjà dans le package.json.
Les commandes ci-dessous servent uniquement à vérifier.

TypeORM + SQLite
<pre>npm install @nestjs/typeorm typeorm sqlite3</pre>

Auth JWT (Passport)
<pre>npm install @nestjs/passport passport passport-jwt
npm install -D @types/passport-jwt</pre>

Swagger
<pre>npm install @nestjs/swagger swagger-ui-express</pre>

## Lancer le projet
<pre>npm run start:dev</pre>

API accessible sur :
<pre>http://localhost:3000</pre>

## Documentation API (Swagger)

Le projet utilise **Swagger (OpenAPI)** pour documenter et tester l’API.

### Accès à Swagger
Une fois l’application lancée :
<pre>http://localhost:3000/api</pre>

### Authentification dans Swagger
Les routes protégées utilisent **JWT (Bearer Token)**.

1. Appeler la route `/auth/login`
2. Copier le `access_token`
3. Cliquer sur **Authorize** (en haut à droite)
4. Coller le token (sans `Bearer`)

Vous pouvez ensuite tester toutes les routes directement depuis Swagger.

## Base de données (SQLite)

- Base de données SQLite via TypeORM
- Un fichier .db est généré automatiquement

En cas de changement d’entités en développement :

- supprimer le fichier .db
- relancer le serveur

<pre>npm run start:dev</pre>

## Concept des tables

Au démarrage, 3 tables sont créées automatiquement si elles n’existent pas.
<pre>
Table ID  Buy-in  SB  BB
table-1	   100	  10  25
table-2	   250    25  50
table-3	   500	  50  100
</pre>
### Règles

JOIN :

- le buy-in est débité du solde
- le joueur reçoit un stack = buy-in
- la table reste en WAITING

START :

- uniquement l’owner
- ajout automatique des bots
- passage en IN_GAME

## Authentification (JWT)

Après login, un access_token est retourné.

### Dans Postman :

- Authorization
- Type : Bearer Token
- Coller le token JWT

## Routes API (Postman)
### Auth

Register
POST /auth/register
<pre>
{
  "username": "player1",
  "password": "password123"
}
</pre>
Le joueur reçoit 1000 crédits à la création.

Login
POST /auth/login
<pre>
{
  "username": "player1",
  "password": "password123"
}
</pre>
Réponse :
<pre>
{
  "access_token": "..."
}
</pre>

### Tables

Voir toutes les tables
GET /tables

Voir une table
GET /tables/:id

Exemple :
GET /tables/table-1

Rejoindre une table (token obligatoire)
POST /tables/:id/join

Header :
<pre>Authorization: Bearer TOKEN </pre>

### Actions de jeu

Start (token obligatoire)
POST /tables/:id/start

Voir sa main (token obligatoire)
GET /tables/:id/hand

Action (token obligatoire)
POST /tables/:id/action
<pre>
{ "action": "CALL" }

{ "action": "RAISE", "amount": 25 }

{ "action": "BET", "amount": 20 }

{ "action": "CHECK" }

{ "action": "FOLD" }
</pre>

En PRE_FLOP, BET est interdit (blinds déjà posées).

Voir sa main (token obligatoire)
GET /tables/:id/hand

### Phases manuelles (tests)
Ces routes sont bloquées tant que tous les joueurs n’ont pas joué (sauf pour les bots ils jouent automatiquement au déclenchement du flop/turn/river/end-hand).

FLOP
POST /tables/:id/flop
<pre>{ "playerId": "player1" }</pre>

TURN
POST /tables/:id/turn
<pre>{ "playerId": "player1" }</pre>

RIVER
POST /tables/:id/river
<pre>{ "playerId": "player1" }</pre>

END-HAND
POST /tables/:id/end-hand
<pre>{ "playerId": "player1" }</pre>

## Gestion des gains (showdown, all-in, side pots, egalites)

A la fin d une main (apres le END-HAND), l API determine le ou les gagnants selon les règles du Texas Hold em.

### Combinaisons gérées (ordre)
1. Quinte Flush Royal
2. Quinte Flush
3. Carre
4. Full
5. Couleur
6. Suite
7. Brelan
8. Double Paire
9. Paire
10. Hauteur

### All-in et side pots
- Les joueurs peuvent etre **all-in** (stack a 0) et restent eligibles au showdown.
- Le pot est decoupe en **main pot** et **side pots** en fonction des contributions de chaque joueur.
- Un joueur all-in ne peut gagner que les pots auxquels il est eligible (comme en vrai poker).

### Egalites (split pot)
- Si plusieurs joueurs ont exactement la meme meilleure main pour un pot, le pot est partage :
  - `share = floor(pot / nbWinners)`
  - `reste = pot % nbWinners`
- Le reste est distribue de maniere deterministe selon l ordre des joueurs dans `table.players`.

### Champs JSON retournes apres end-hand
POST /tables/:id/end-hand
la table renvoie :

- `lastWinnerId` : gagnant du main pot (si egalite, le premier dans l ordre)
- `lastWinnerHand` : les 2 cartes privees (hole cards) du gagnant du main pot
- `lastWinnerHandDescription` : explication de la combinaison (ex: "Paire de 8", "Suite 7 8 9 10 J")
- `lastWinners` : distribution complete (main pot + side pots).  
  Il peut y avoir plusieurs lignes avec le meme `potIndex` en cas d egalite.

Exemple :
<pre>
{
  "lastWinnerId": "player1",
  "lastWinnerHand": [
    { "suit": "Piques", "rank": "8" },
    { "suit": "Carreaux", "rank": "8" }
  ],
  "lastWinnerHandDescription": "Paire de 8",
  "lastWinners": [
    {
      "potIndex": 0,
      "amount": 120,
      "winnerId": "player1",
      "handDescription": "Paire de 8",
      "bestFive": [
        { "suit": "Piques", "rank": "8" },
        { "suit": "Carreaux", "rank": "8" }
      ]
    }
  ]
}
</pre>

## Scénario Postman – Partie complète

1. Register
2. Login
3. Join table
4. Start game
5. Voir sa main
6. Actions PRE_FLOP
7. FLOP
8. Actions FLOP
9. TURN
10. Actions TURN
11. RIVER
12. Actions RIVER
13. END-HAND

## Règles importantes

La table démarre en WAITING
Le jeu démarre en PRE_FLOP

1 burn card avant :
- FLOP
- TURN
- RIVER

Les bots complètent automatiquement les actions si nécessaire

## Sécurité

Les cartes sont protégées par JWT
Impossible de voir la main d’un autre joueur
Impossible de voir la main des bots

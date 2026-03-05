<p align="center">
  <img src="/public/assets/img/logo-the-river.png" width="300" alt="Logo THE RIVER">
</p><br>
<h1 align="center">THE RIVER</h1>

<p align="center">
Plateforme de casino web Full Stack développée avec NestJS, MySQL et JavaScript
</p>

---

# Sommaire

- [Démo](#démo)
- [Présentation du projet](#présentation-du-projet)
- [Architecture](#architecture)
- [Technologies utilisées](#technologies-utilisées)
  - [Backend](#backend)
  - [Frontend](#frontend)
  - [Infrastructure](#infrastructure)
- [Jeux disponibles](#jeux-disponibles)
  - [Poker](#poker)
  - [Blackjack](#blackjack)
  - [Slot Machine](#slot-machine)
  - [Roulette](#roulette)
  - [Easter-egg](#easter-egg)
- [Système de quêtes](#système-de-quêtes)
- [Dashboard](#dashboard)
- [Authentification & sécurité](#authentification--sécurité)
- [Système d’email](#système-demail)
- [Communication temps réel](#communication-temps-réel)
- [Base de données](#base-de-données)
- [Installation](#installation)
- [Evolutions futures](#évolutions-futures)
    - [Mode Frénésie](#mode-frénésie)
    - [Personnalisation](#personnalisation)
    - [Compétiton poker](#personnalisation)

---

# Démo

Version en production :

https://the-river.bouchard-mehdi.fr


---

# Présentation du projet

**THE RIVER** est une plateforme de casino en ligne développée en **Full Stack**.

L’application simule un véritable environnement de casino avec :

- plusieurs jeux
- du multijoueur en temps réel
- une authentification sécurisée
- un système de progression
- un dashboard utilisateur
- un système de quêtes gamifiées

Le projet a été conçu pour démontrer la capacité à construire une **application web complète prête pour la production**.

---

# Architecture

Le backend suit une architecture **modulaire par domaine métier**.

```bash
src/
│
├── auth/          Authentification & JWT
├── users/         Gestion des utilisateurs
├── mail/          Service SMTP
|
│
├── games/
│   ├── poker/         Logique Poker Texas Hold'em
│   ├── blackjack/     Jeu Blackjack
│   ├── roulette/      Roulette française
│   ├── slots/         Machine à sous
│   ├── quests/        Système de quêtes
|   ├── easter-egg/    Easter egg
|   ├── craps/         Jeu surprise
│   └── stats/         Statistiques & leaderboard
│
└── main.ts
```

Chaque module contient :

- controllers
- services
- entités
- DTO
- gateways WebSocket

---

# Technologies utilisées

## Backend

- **NestJS**
- **Node.js**
- **TypeScript**
- **TypeORM**
- **MySQL**
- **Socket.IO**
- **JWT**
- **Passport**
- **bcrypt**
- **Nodemailer**
- **Helmet**
- **class-validator**

---

## Frontend

- HTML5
- CSS3
- JavaScript (ES Modules)
- Fetch API
- Socket.IO client

---

## Infrastructure

- **Hostinger Node.js Hosting**
- **MySQL**
- **SMTP Hostinger**
- **SSH**

---

# Jeux disponibles

La plateforme propose plusieurs jeux de casino.

---

# Poker

Le poker Texas Hold'em est le jeu principal.

Fonctionnalités :

- tables multijoueurs
- gestion des blinds
- système de mise
- progression automatique des phases
- calcul des mains
- distribution du pot
- showdown
- suppression automatique des tables
- chat temps réel

---

# Blackjack

Tables de blackjack avec logique du dealer.

Fonctionnalités :

- tables multijoueurs
- distribution des cartes
- gestion des tours
- dealer automatique
- animation des cartes
- chat intégré

---

# Slot Machine

Machine à sous interactive.

Fonctionnalités :

- système de spins
- plusieurs machines
- calcul probabiliste des gains
- gestion des crédits
- easter eggs cachés

---

# Roulette

Roulette française interactive.

Fonctionnalités :

- paris sur numéros
- cheval
- carré
- transversale
- paiement automatique
- interface de table interactive

---

# Easter Egg

Le projet inclut également un système d’**easter egg**.

Cette easter egg se débloque en trouvant des **clés secrètes** associées à chaque jeu.

Fonctionnement :

- certaines actions spécifiques dans les jeux déclenchent un événement caché
- une clé est alors débloquée pour le joueur
- un système de notification informe le joueur du déblocage
- les clés sont persistées et peuvent être utilisées pour débloquer du contenu futur

Exemples :

- clé **Slots**
- clé **Poker**
- clé **Roulette**
- clé **Blackjack**

Ce système ajoute une dimension **exploration et mystère** au projet.

# Système de quêtes

Le projet inclut un système de **gamification**.

Types de quêtes :

- **Daily quests**
- **Weekly quests**
- **Anti-tilt quests**

Fonctionnalités :

- progression persistante
- système de cooldown
- récupération de récompenses
- intégration dans le dashboard

Les récompenses peuvent donner :

- crédits
- points compétition

---

# Dashboard

Chaque joueur possède un dashboard personnel comprenant :

- solde du compte
- points de compétition
- progression des quêtes
- classement leaderboard
- statistiques de jeu
- historique des gains et pertes

---

# Authentification & sécurité

La sécurité utilise des standards modernes.

Fonctionnalités :

- authentification JWT
- vérification email
- reset password
- hashage bcrypt
- validation des DTO
- headers de sécurité Helmet
- configuration CORS sécurisée

---

# Système d’email

Les emails transactionnels utilisent **Nodemailer**.

Fonctionnalités :

- vérification email
- reset password
- templates HTML
- SMTP Hostinger

---

# Communication temps réel

Les communications temps réel utilisent **Socket.IO**.

Namespaces :

/poker
/blackjack


Fonctionnalités :

- synchronisation instantanée des actions
- chat par table
- gestion des connexions
- fermeture automatique des tables

---

# Base de données

Le projet utilise **MySQL** avec **TypeORM**.

Principales entités :

- users
- poker_tables
- blackjack_tables
- slot_spins
- game_events
- quests
- email_tokens

---

# Installation

## Cloner le projet

```bash
git clone https://github.com/username/the-river.git
cd the-river
```

# Installer les dépendances

```bash
npm install
```

# Variables d'environnement
créer le fichier .env

```bash
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=password
DB_DATABASE=the_river

JWT_SECRET=secret

MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=email@domain.com
MAIL_PASS=password
MAIL_FROM="THE RIVER <email@domain.com>"
```

# Lancer le projet

## Developpement

```bash
npm run start:dev
```

## Production

```bash
npm run build
npm run start:prod
```

# Évolutions futures

Plusieurs améliorations sont prévues pour enrichir l'expérience de jeu.

## Mode Frénésie

Un mode alternatif avec un gameplay différent pour varier les sessions.

Fonctionnalités envisagées :

- items et bonus spécifiques à chaque jeu
- monnaie dédiée au mode frénésie
- progression indépendante du mode classique
- équilibrage propre au mode

---

## Personnalisation

Ajout d’un système de personnalisation du profil joueur.

Fonctionnalités envisagées :

- thèmes d’interface (skins)
- avatars et cadres personnalisés
- badges et succès
- cartes et symboles personnalisés

---

## Compétition Poker

Renforcement du système compétitif autour du poker.

Fonctionnalités envisagées :

- saisons compétitives
- récompenses de fin de saison
- reset du classement (ladder)
- historique et statistiques persistées

# My Social Networks API

API REST (Node.js, Express, MongoDB/Mongoose) pour le nouveau service d'événements et de groupes de Facebook.

Elle reprend l'architecture et les protections du TP précédent : classes contrôleurs, modèles Mongoose, validation des corps de requête (`src/validation.mjs` + règles Mongoose + `validator`), authentification JWT, HTTPS, Helmet, CORS et limitation du nombre de requêtes.

## Démarrer l'API

Depuis Ubuntu, à la racine du projet :

```bash
npm install
npm run dev
```

Le serveur écoute en HTTPS sur le port `3000` : `https://localhost:3000`.

Le fichier `.env` (non versionné) doit contenir :

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/my_social_networks
JWT_SECRET=<secret aléatoire privé d'au moins 32 octets>
```

Si les certificats locaux n'existent pas (après un clonage), génère-les :

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"
chmod 600 certs/localhost-key.pem
```

Dans Postman, désactive **Settings → General → SSL certificate verification** pour ces essais locaux.

## Arborescence

```text
index.mjs
src/
  config.mjs            configuration (port, URI MongoDB lue dans .env)
  server.mjs            Express, middlewares de sécurité, JWT, HTTPS
  errors.mjs            réponses d'erreur communes (400, 403, 404, 409, 500)
  validation.mjs        validation des corps de requête
  permissions.mjs       droits : organisateur, participant, administrateur, membre
  controllers/          une classe par ressource
  models/               un schéma Mongoose par collection
```

## Collections MongoDB

| Collection | Contenu |
|---|---|
| `users` | Utilisateurs (email unique, mot de passe haché avec bcrypt) |
| `groups` | Groupes : nom, description, icône, couverture, type (`public`, `private`, `secret`), autorisations, administrateurs, membres |
| `events` | Événements : nom, description, dates, lieu, couverture, visibilité (`public`, `private`), organisateurs, membres, groupe éventuel, billetterie activée ou non |
| `threads` | Fils de discussion, liés à **1 groupe ou 1 événement, jamais les deux** |
| `messages` | Messages d'un fil (`reply_to` permet de répondre à un message) |
| `albums` | Albums photo, chacun associé à 1 événement |
| `photos` | Photos d'un album, postées par un participant |
| `comments` | Commentaires des photos, écrits par des participants |
| `polls` | Sondages d'un événement : questions et réponses possibles |
| `poll_responses` | Réponses d'un participant à un sondage (une seule fois par sondage) |
| `ticket_types` | Types de billets : nom, montant, quantité limitée, nombre vendus |
| `tickets` | Billets achetés : type, nom, prénom, email, adresse complète, date d'achat |
| `shopping_items` | *(Bonus)* Shopping list : nom, quantité, heure d'arrivée, utilisateur qui apporte |
| `carpools` | *(Bonus)* Covoiturages : lieu et heure de départ, prix, places, écart maximum, conducteur, passagers |

## Règles fonctionnelles

- Deux utilisateurs ne peuvent pas avoir le même email (`409`).
- Le créateur d'un groupe en devient administrateur ; le créateur d'un événement en devient organisateur. Un groupe a toujours au moins 1 administrateur et un événement au moins 1 organisateur.
- Un **groupe secret** n'est visible que par ses membres ; un **événement privé** n'est visible que par ses participants (organisateurs + membres). Pour les autres utilisateurs, ils répondent `404`.
- Seuls les groupes publics et les événements publics peuvent être rejoints librement (`/join`). Dans les autres cas, ce sont les administrateurs/organisateurs qui gèrent les listes `admins`/`members` ou `organizers`/`members`.
- Création d'un événement dans un groupe : autorisée aux administrateurs, et aux membres si `allow_members_to_create_events` est activé. `invite_group_members: true` invite tous les membres du groupe en un clic.
- À sa création, chaque groupe et chaque événement reçoit automatiquement son fil de discussion.
- Fil d'un groupe : lecture par les membres ; publication par les administrateurs, et par les membres si `allow_members_to_post` est activé. Fil d'un événement : lecture et publication par les participants.
- Un message peut être supprimé par son auteur ou par un administrateur/organisateur.
- Les albums sont gérés par les organisateurs ; les photos sont postées et commentées par les participants.
- Les sondages sont créés par un organisateur ; chaque question possède au moins 2 réponses possibles ; un participant répond une seule fois et choisit exactement 1 réponse pour chaque question.
- La billetterie n'existe que pour les événements **publics** avec `ticketing: true`. L'achat d'un billet est public (personne extérieure, sans compte). Une même personne (email) ne peut obtenir qu'**1 seul billet** par événement, et un type de billet ne peut pas dépasser sa quantité.
- *(Bonus)* Si `shopping_list` est activée sur l'événement, chaque participant peut indiquer ce qu'il apporte. Chaque chose apportée est unique par événement (« Chips » et « chips » sont considérés comme identiques → `409`).
- *(Bonus)* Si `carpooling` est activé sur l'événement, un participant peut proposer un trajet. Les autres participants peuvent réserver une place tant qu'il en reste (`409` si complet).
- La suppression d'un événement supprime ses fils, messages, albums, photos, commentaires, sondages, réponses, types de billets, billets, shopping list et covoiturages. La suppression d'un groupe supprime son fil et ses messages ; ses événements sont conservés.

## Authentification

1. `POST /users` crée un compte (public).
2. `POST /auth/login` renvoie un `token` JWT valable 1 heure.
3. Les routes protégées attendent l'en-tête `Authorization: Bearer <token>` (Postman : **Authorization → Bearer Token**).

Routes publiques : `POST /users`, `POST /auth/login`, `GET /event/:idevent/ticket-types`, `POST /event/:idevent/ticket`. Toutes les autres demandent un token.

## Format des erreurs

```json
{ "code": 400, "message": "Validation failed", "errors": [{ "field": "name", "message": "This field is required" }] }
```

| Code | Signification |
|---|---|
| `400` | Corps invalide, champ inconnu, id invalide, JSON mal formé |
| `401` | Token absent, invalide ou expiré |
| `403` | Utilisateur connecté mais sans le droit nécessaire |
| `404` | Ressource inexistante ou non visible |
| `409` | Conflit : email déjà utilisé, billet déjà obtenu, sondage déjà répondu, billets épuisés |
| `413` | Corps trop volumineux |
| `429` | Trop de requêtes (100 par heure et par IP) |
| `500` | Erreur interne (message générique + `requestId`) |

Les dates sont au format ISO 8601 (ex. `2026-12-31T20:00:00Z`). Les URL (photos, icônes, couvertures) doivent être en HTTP ou HTTPS.

## Endpoints

### Utilisateurs et authentification

| Méthode | Route | Description |
|---|---|---|
| POST | `/users` | Créer un compte : `firstname`, `lastname`, `age`, `email`, `password` |
| POST | `/auth/login` | Se connecter : `email`, `password` → `token` |
| GET | `/users` | Lister les utilisateurs |
| GET | `/users/:id` | Détail d'un utilisateur |
| PUT | `/users/:id` | Modifier `firstname`, `lastname`, `age` |
| DELETE | `/users/:id` | Supprimer un utilisateur |

### Groupes

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/groups?name=` | connecté | Groupes publics/privés + groupes secrets dont on est membre |
| GET | `/group/:id` | membre si secret | Détail avec administrateurs et membres |
| POST | `/group` | connecté | Créer un groupe |
| PUT | `/group/:id` | administrateur | Modifier un groupe (tous les champs, `name` obligatoire) |
| DELETE | `/group/:id` | administrateur | Supprimer un groupe |
| POST | `/group/:id/join` | connecté | Rejoindre un groupe public |
| POST | `/group/:id/leave` | membre | Quitter le groupe (sauf dernier administrateur) |

Exemple `POST /group` :

```json
{
  "name": "Randonneurs de Paris",
  "description": "Sorties nature le week-end",
  "icon": "https://example.com/icon.png",
  "cover_photo": "https://example.com/cover.jpg",
  "type": "private",
  "allow_members_to_post": true,
  "allow_members_to_create_events": false,
  "admins": [],
  "members": ["<userId>", "<userId>"]
}
```

### Événements

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/events?name=&group=` | connecté | Événements publics + événements dont on est participant |
| GET | `/event/:id` | participant si privé | Détail avec organisateurs, membres et groupe |
| POST | `/event` | connecté (droits du groupe si `group`) | Créer un événement |
| PUT | `/event/:id` | organisateur | Modifier un événement |
| DELETE | `/event/:id` | organisateur | Supprimer un événement et ses données |
| POST | `/event/:id/join` | connecté | Participer à un événement public |
| POST | `/event/:id/leave` | participant | Quitter l'événement (sauf dernier organisateur) |

Exemple `POST /event` :

```json
{
  "name": "Soirée du Nouvel An",
  "description": "On fête 2027 ensemble",
  "start_date": "2026-12-31T20:00:00Z",
  "end_date": "2027-01-01T04:00:00Z",
  "location": "Paris",
  "cover_photo": "https://example.com/cover.jpg",
  "visibility": "public",
  "organizers": ["<userId>"],
  "members": ["<userId>"],
  "ticketing": true,
  "shopping_list": true,
  "carpooling": true,
  "group": "<groupId>",
  "invite_group_members": true
}
```

`group` et `invite_group_members` ne sont acceptés qu'à la création. `ticketing: true` n'est accepté que si `visibility` vaut `public`.

### Fils de discussion

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/group/:id/thread` | membre du groupe | Fil du groupe |
| GET | `/event/:id/thread` | participant | Fil de l'événement |
| GET | `/thread/:idthread/messages` | lecteur du fil | Messages du fil (ordre chronologique) |
| POST | `/thread/:idthread/message` | voir règles | Poster `{ "content": "...", "reply_to": "<messageId>" }` (`reply_to` facultatif) |
| DELETE | `/thread/:idthread/message/:idmessage` | auteur ou admin/organisateur | Supprimer un message |

### Albums, photos et commentaires

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/albums?event=&title=` | connecté | Albums des événements visibles |
| GET | `/album/:id` | visibilité de l'événement | Détail avec photos |
| POST | `/album` | organisateur | `{ "title": "...", "description": "...", "event": "<eventId>" }` |
| PUT | `/album/:id` | organisateur | `title`, `description` |
| DELETE | `/album/:id` | organisateur | Supprime l'album, ses photos et leurs commentaires |
| GET | `/album/:idalbum/photos` | visibilité de l'événement | Photos de l'album |
| GET | `/album/:idalbum/photo/:idphoto` | visibilité de l'événement | Détail d'une photo |
| POST | `/album/:idalbum/photo` | participant | `{ "title": "...", "url": "https://...", "description": "..." }` |
| PUT | `/album/:idalbum/photo/:idphoto` | auteur | Modifier une photo |
| DELETE | `/album/:idalbum/photo/:idphoto` | auteur ou organisateur | Supprimer une photo |
| GET | `/album/:idalbum/photo/:idphoto/comments` | visibilité de l'événement | Commentaires |
| POST | `/album/:idalbum/photo/:idphoto/comment` | participant | `{ "content": "..." }` |
| DELETE | `/album/:idalbum/photo/:idphoto/comment/:idcomment` | auteur ou organisateur | Supprimer un commentaire |

### Sondages

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/event/:idevent/polls` | visibilité de l'événement | Sondages de l'événement |
| GET | `/poll/:id` | visibilité de l'événement | Détail (ids des questions et des réponses) |
| POST | `/event/:idevent/poll` | organisateur | Créer un sondage |
| DELETE | `/poll/:id` | organisateur | Supprimer un sondage et ses réponses |
| POST | `/poll/:id/response` | participant | Répondre (une seule fois) |
| GET | `/poll/:id/results` | visibilité de l'événement | Nombre de votes par réponse |

Exemple `POST /event/:idevent/poll` :

```json
{
  "title": "Organisation",
  "questions": [
    { "label": "Quel menu ?", "answers": ["Pizza", "Sushi", "Raclette"] },
    { "label": "Quelle musique ?", "answers": ["Rock", "Électro"] }
  ]
}
```

Exemple `POST /poll/:id/response` (une réponse pour chaque question) :

```json
{
  "answers": [
    { "question": "<questionId>", "answer": "<answerId>" },
    { "question": "<questionId>", "answer": "<answerId>" }
  ]
}
```

### Billetterie

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/event/:idevent/ticket-types` | public | Types de billets avec places restantes (`remaining`) |
| POST | `/event/:idevent/ticket-type` | organisateur | `{ "name": "Standard", "amount": 15, "quantity": 100 }` |
| PUT | `/event/:idevent/ticket-type/:id` | organisateur | Modifier (quantité ≥ billets déjà vendus) |
| DELETE | `/event/:idevent/ticket-type/:id` | organisateur | Supprimer un type sans billet vendu |
| POST | `/event/:idevent/ticket` | public | Acheter un billet |
| GET | `/event/:idevent/tickets` | organisateur | Liste des billets achetés |

Exemple `POST /event/:idevent/ticket` (sans token) :

```json
{
  "ticket_type": "<ticketTypeId>",
  "firstname": "Jean",
  "lastname": "Dupont",
  "email": "jean.dupont@example.com",
  "address": {
    "street": "10 rue de la Paix",
    "zip_code": "75002",
    "city": "Paris",
    "country": "France"
  }
}
```

La date d'achat (`purchased_at`) est ajoutée automatiquement.

### Shopping list (Bonus)

Accessible aux participants, uniquement si l'événement a `"shopping_list": true` (sinon `404`).

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/event/:idevent/shopping-items` | participant | Liste des choses apportées (triée par heure d'arrivée) |
| POST | `/event/:idevent/shopping-item` | participant | Ajouter ce qu'on apporte |
| PUT | `/event/:idevent/shopping-item/:id` | auteur | Modifier un élément |
| DELETE | `/event/:idevent/shopping-item/:id` | auteur ou organisateur | Supprimer un élément |

Exemple `POST /event/:idevent/shopping-item` :

```json
{ "name": "Chips", "quantity": 3, "arrival_time": "2026-12-31T19:30:00Z" }
```

### Covoiturage (Bonus)

Accessible aux participants, uniquement si l'événement a `"carpooling": true` (sinon `404`).

| Méthode | Route | Droit | Description |
|---|---|---|---|
| GET | `/event/:idevent/carpools` | participant | Trajets proposés avec places restantes (`remaining_seats`) |
| POST | `/event/:idevent/carpool` | participant | Proposer un trajet (on en devient le conducteur) |
| PUT | `/event/:idevent/carpool/:id` | conducteur | Modifier un trajet (places ≥ passagers déjà inscrits) |
| DELETE | `/event/:idevent/carpool/:id` | conducteur ou organisateur | Supprimer un trajet |
| POST | `/event/:idevent/carpool/:id/join` | participant | Réserver une place |
| POST | `/event/:idevent/carpool/:id/leave` | passager | Annuler sa place |

Exemple `POST /event/:idevent/carpool` (`max_detour` est en minutes : sur un trajet de 2h30, `30` donne un trajet de 3h maximum) :

```json
{
  "departure_location": "Gare de Lyon, Paris",
  "departure_time": "2026-12-31T17:00:00Z",
  "price": 10,
  "seats": 3,
  "max_detour": 30
}
```

## Scénario de test rapide (Postman)

1. `POST /users` deux fois (utilisateurs A et B), puis `POST /auth/login` avec A.
2. `POST /group` avec A, puis `POST /group/:id/join` avec B (groupe public).
3. `POST /event` avec A en donnant `group` et `invite_group_members: true` : B est membre de l'événement.
4. `GET /event/:id/thread`, puis `POST /thread/:idthread/message` avec A et une réponse avec B (`reply_to`).
5. `POST /album` (A), `POST /album/:idalbum/photo` (B), `POST /album/:idalbum/photo/:idphoto/comment` (A).
6. `POST /event/:idevent/poll` (A), `GET /poll/:id` pour récupérer les ids, `POST /poll/:id/response` (B), `GET /poll/:id/results`.
7. `POST /event/:idevent/ticket-type` (A, événement public avec `ticketing: true`), puis `POST /event/:idevent/ticket` sans token ; un deuxième achat avec le même email renvoie `409`.
8. *(Bonus)* Créer l'événement avec `"shopping_list": true` et `"carpooling": true`. `POST /event/:idevent/shopping-item` avec A, puis le même `name` avec B → `409`. `POST /event/:idevent/carpool` avec A (`seats: 1`), `POST /event/:idevent/carpool/:id/join` avec B → `200`, puis à nouveau avec B → `409`.

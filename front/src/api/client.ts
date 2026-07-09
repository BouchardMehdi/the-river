import type { ApiError } from '@/types/api';

const TOKEN_KEY = 'the-river-token';

const API_ERROR_MESSAGES: Record<string, string> = {
  'Code invalide': 'Code invalide. Vérifie le code reçu puis réessaie.',
  'Credits insuffisants': 'Crédits insuffisants pour effectuer cette action.',
  'Email deja utilise': 'Cette adresse email est déjà utilisée.',
  'Email invalide': 'Adresse email invalide. Vérifie le format saisi.',
  'Email requis': 'Adresse email requise.',
  'Impossible de securiser le mot de passe': 'Impossible de sécuriser le mot de passe. Réessaie dans quelques secondes.',
  'Machine invalide': 'Machine invalide. Choisis une machine disponible.',
  'Mot de passe invalide': 'Mot de passe incorrect.',
  'Mot de passe requis': 'Mot de passe requis.',
  'Partie en cours, impossible de rejoindre': 'La partie est déjà en cours, tu ne peux plus rejoindre cette table.',
  'Partie non démarrée': 'La partie n’a pas encore démarré.',
  'Pas de bot en competition': 'Les bots ne sont pas autorisés en compétition.',
  'Cette table est privée (code requis)': 'Cette table est privée. Utilise son code pour la rejoindre.',
  'Code invalide (6 lettres A-Z)': 'Code invalide. Le code doit contenir 6 lettres.',
  'Les tables competition ne sont pas publiques': 'Les tables de compétition ne sont pas visibles dans les tables publiques.',
  'Les tables competition ne se rejoignent pas avec un code': 'Les tables de compétition se rejoignent uniquement via le matchmaking.',
  'Les tables competition se lancent automatiquement': 'Les tables de compétition se lancent automatiquement dès qu’il y a assez de joueurs.',
  'Pseudo deja utilise': 'Ce pseudo est déjà utilisé.',
  'Pseudo trop court (min 3)': 'Pseudo trop court: 3 caractères minimum.',
  'Pseudo trop long (max 30)': 'Pseudo trop long: 30 caractères maximum.',
  'User not found': 'Utilisateur introuvable. Reconnecte-toi puis réessaie.',
  'email déjà utilisé': 'Cette adresse email est déjà utilisée.',
  'email requis': 'Adresse email requise.',
  'la table est pleine': 'Cette table est pleine.',
  'password requis': 'Mot de passe requis.',
  'username déjà utilisé': 'Ce pseudo est déjà utilisé.',
  'username requis': 'Pseudo requis.',
  AVATAR_REQUIRED: 'Choisis une image avant de mettre à jour ta photo de profil.',
  BET_ALREADY_PLACED: 'Tu as déjà placé une mise pour ce tour.',
  BET_TOO_HIGH: 'Ta mise dépasse la limite maximale de cette table.',
  BET_TOO_LOW: 'Ta mise est inférieure au minimum autorisé.',
  CELL_ALREADY_REVEALED: 'Cette case a déjà été ouverte.',
  CODE_INVALID: 'Code invalide. Vérifie les caractères saisis puis réessaie.',
  CORRUPTED_GAME_STATE: 'La partie a rencontré un état incohérent. Synchronise la table puis réessaie.',
  DOUBLE_EXCEEDS_TABLE_MAX: 'Le double dépasse la mise maximale de cette table.',
  DOUBLE_ONLY_ON_FIRST_TWO_CARDS: 'Le double est possible uniquement avec les deux premières cartes.',
  DRAGON_INVITATION_REQUIRED: 'Le Salon du Dragon est encore verrouillé. Termine la quête secrète pour y accéder.',
  DUPLICATE_PICK: 'Tu as sélectionné deux fois le même numéro.',
  GAME_NOT_STARTED: 'La partie n’a pas encore commencé.',
  INVALID_ACTION_BODY: 'Action invalide. Choisis une action proposée.',
  INVALID_ACTION_BODY_EXPECTED: 'Action invalide. Choisis une action proposée.',
  INVALID_AVATAR_TYPE: 'Format d’image non accepté. Utilise PNG, JPG, WebP ou GIF.',
  INVALID_BET: 'Mise invalide. Entre un montant positif et disponible sur ton solde.',
  INVALID_BET_BODY: 'Mise invalide. Vérifie le montant puis réessaie.',
  INVALID_BET_ON: 'Sélection de mise invalide. Choisis une option proposée.',
  INVALID_BET_TYPE: 'Type de mise invalide. Choisis une zone de mise autorisée.',
  INVALID_BETS: 'Ajoute au moins une mise valide avant de lancer.',
  INVALID_CELL: 'Case invalide. Sélectionne une case du plateau.',
  INVALID_GUESS: 'Choix invalide. Sélectionne plus haut ou plus bas.',
  INVALID_GUESS_TOTAL: 'Total invalide. Choisis un résultat possible entre 2 et 12.',
  INVALID_HARDWAY_TARGET: 'Hardway invalide. Choisis 4, 6, 8 ou 10.',
  INVALID_MINES: 'Nombre de mines invalide. Choisis une valeur autorisée.',
  INVALID_MIN_BET: 'Mise minimale invalide. Entre un montant positif.',
  INVALID_MESSAGE: 'Message invalide. Écris un message entre 1 et 300 caractères.',
  INVALID_NAME: 'Nom de table invalide. Utilise au moins 2 caractères.',
  INVALID_PICK: 'Numéro invalide. Les numéros doivent être dans la grille.',
  INVALID_PICK_COUNT: 'Sélection invalide. Choisis le bon nombre de numéros.',
  INVALID_PICKS: 'Sélection invalide. Choisis tes numéros avant de jouer.',
  INVALID_PUSH_SUBSCRIPTION: 'Abonnement aux notifications invalide. Réactive les notifications dans les paramètres.',
  INVALID_RISK: 'Niveau de risque invalide. Choisis une option proposée.',
  INVALID_ROWS: 'Nombre de lignes invalide. Choisis une option proposée.',
  INVALID_SLOT: 'Case d’arrivée invalide. Relance une bille.',
  INVALID_TABLE_CODE: 'Code de table invalide. Vérifie les 6 lettres du code.',
  INVALID_TABLE_ID: 'Code de table invalide. Vérifie les 6 lettres du code.',
  INVALID_TABLE_MAX_BET: 'Mise maximale de table invalide.',
  INVALID_TICKET: 'Ticket invalide ou expiré. Lance une nouvelle bille.',
  NO_ACTIVE_SESSION: 'Aucune partie active. Démarre une nouvelle manche.',
  NO_CURRENT_PLAYER: 'Aucun joueur actif pour le moment. Synchronise la table.',
  NOT_IN_BETTING_PHASE: 'Les mises ne sont pas ouvertes pour le moment.',
  NOT_IN_PLAYER_TURNS: 'Ce n’est pas la phase d’action des joueurs.',
  NOT_IN_TABLE: 'Tu n’es pas assis à cette table.',
  NOT_YOUR_TURN: 'Ce n’est pas ton tour.',
  NOTHING_TO_CASHOUT: 'Aucun gain à encaisser pour le moment.',
  ONLY_OWNER_CAN_DO_THIS: 'Seul le créateur de la table peut faire cette action.',
  QUEST_ALREADY_CLAIMED: 'Cette quête a déjà été récupérée.',
  QUEST_COOLDOWN: 'Cette quête est en recharge. Attends la fin du minuteur.',
  QUEST_NOT_COMPLETE: 'Cette quête n’est pas encore terminée.',
  QUEST_NOT_FOUND: 'Quête introuvable. Recharge la page puis réessaie.',
  SHOE_EMPTY: 'Le sabot est vide. Lance une nouvelle manche.',
  SPLIT_REQUIRES_SAME_VALUE_PAIR: 'Le split est possible uniquement avec deux cartes de même valeur.',
  TABLE_FULL: 'Cette table est pleine.',
  TABLE_MAX_BET_TOO_LOW: 'La mise maximale doit être supérieure ou égale à la mise minimale.',
  TABLE_NOT_FOUND: 'Table introuvable. Elle a peut-être été fermée.',
  TABLE_NOT_JOINABLE: 'Cette table ne peut pas être rejointe pour le moment.',
  USER_NOT_FOUND: 'Utilisateur introuvable. Reconnecte-toi puis réessaie.',
  WAIT_NEXT_ROUND_TO_BET: 'Tu viens de rejoindre la table. Attends le prochain tour pour miser.',
  YOU_ARE_NOT_ACTIVE_THIS_ROUND: 'Tu ne participes pas à cette manche.',
  YOU_CANNOT_ACT: 'Action impossible avec cette main.',
};

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || '/api';
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
}

function humanizeApiMessage(message: string, fallback: string) {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  const key = trimmed.split(':')[0]?.trim();
  return API_ERROR_MESSAGES[trimmed] ?? API_ERROR_MESSAGES[key] ?? trimmed;
}

function formatApiError(payload: ApiError | string | null, fallback: string) {
  if (typeof payload === 'string') return humanizeApiMessage(payload, fallback);
  if (!payload) return fallback;
  if (Array.isArray(payload.message)) {
    return payload.message.map((message) => humanizeApiMessage(message, fallback)).join(', ');
  }
  return humanizeApiMessage(payload.message || payload.error || '', fallback);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData) headers.set('Content-Type', 'application/json');

  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let payload: ApiError | string | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!res.ok) {
    throw new Error(formatApiError(payload, `Erreur ${res.status}. Le serveur n’a pas pu traiter la demande.`));
  }

  return payload as T;
}

export function apiGet<T>(path: string, auth = true) {
  return apiFetch<T>(path, { method: 'GET', auth });
}

export function apiPost<T>(path: string, body?: unknown, auth = true) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    auth,
  });
}

export function apiPatch<T>(path: string, body?: unknown, auth = true) {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
    auth,
  });
}

export function apiPostForm<T>(path: string, body: FormData, auth = true) {
  return apiFetch<T>(path, {
    method: 'POST',
    body,
    auth,
  });
}

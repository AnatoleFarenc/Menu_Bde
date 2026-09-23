import axios from 'axios';
import { db } from './db.js';

// Role hierarchy (roadmap item 06): each role includes everything the one
// below it can do. 'member' (rank 0, no row in the DB) is a plain student --
// only 'staff' and up ever get a TeamMember row.
export const ROLE_RANK = { member: 0, staff: 1, admin: 2, board: 3 };

const getAdminLogins = () => (process.env.ADMIN_LOGINS || '')
  .split(',')
  .map(login => login.trim().toLowerCase())
  .filter(Boolean);

// Separate from ADMIN_LOGINS: gates the /gestion tool (event/catalog/stock
// management) rather than the live order-tracking board. A login can be in
// either list, both, or neither -- the two accesses are independent.
// Falls back to ADMIN_LOGINS when unset, so existing single-tier deployments
// keep working without extra configuration.
const getManagerLogins = () => (process.env.MANAGER_LOGINS ?? process.env.ADMIN_LOGINS ?? '')
  .split(',')
  .map(login => login.trim().toLowerCase())
  .filter(Boolean);

// A login's role: an explicit TeamMember row (set by a Board member from the
// /gestion team screen) always wins. With no such row, falls back to the
// legacy env-var lists -- ADMIN_LOGINS becomes 'board' (its old isAdmin
// access, now the top of the hierarchy) and MANAGER_LOGINS becomes 'admin'
// (its old isManager access) -- so every account already configured before
// this feature existed keeps working with no manual migration step.
export const resolveRole = async (login) => {
  const dbRole = await db.getTeamMemberRole(login);
  if (dbRole) return dbRole;
  if (getAdminLogins().includes(login)) return 'board';
  if (getManagerLogins().includes(login)) return 'admin';
  return 'member';
};

// The OAuth redirect URI is always "<public URL>/api/auth/42/callback".
// We derive it from PUBLIC_APP_URL, so there's only one variable to set.
// INTRA42_REDIRECT_URI is still accepted if you want to force a value.
const getRedirectUri = () => {
  if (process.env.INTRA42_REDIRECT_URI) {
    return process.env.INTRA42_REDIRECT_URI.trim();
  }
  const base = (process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 5001}`).trim().replace(/\/+$/, '');
  return `${base}/api/auth/42/callback`;
};

export const get42AuthUrl = (state) => {
  const clientId = process.env.INTRA42_CLIENT_ID;
  if (!clientId) {
    throw new Error('INTRA42_CLIENT_ID absent du fichier .env');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'public',
  });
  if (state) params.set('state', state);
  return `https://api.intra.42.fr/oauth/authorize?${params.toString()}`;
};

export const handle42Callback = async (code) => {
  if (!code) {
    throw new Error('Code OAuth 42 manquant');
  }

  const clientId = process.env.INTRA42_CLIENT_ID;
  const clientSecret = process.env.INTRA42_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error('Identifiants OAuth 42 absents. Configurez INTRA42_CLIENT_ID et INTRA42_CLIENT_SECRET dans .env');
  }

  // 1. Exchange authorization code for access token
  const tokenRes = await axios.post('https://api.intra.42.fr/oauth/token', {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const accessToken = tokenRes.data.access_token;

  // 2. Fetch user profile from 42 Intra API
  const userRes = await axios.get('https://api.intra.42.fr/v2/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const intraUser = userRes.data;
  const login = intraUser.login.toLowerCase();
  const role = await resolveRole(login);
  const rank = ROLE_RANK[role] ?? 0;

  return {
    id: intraUser.id,
    login: intraUser.login,
    displayName: intraUser.usual_full_name || intraUser.displayname || intraUser.login,
    email: intraUser.email,
    avatarUrl: intraUser.image?.link || intraUser.image?.versions?.medium || 'https://profile.intra.42.fr/assets/42_logo-7e42914c62...png',
    campus: intraUser.campus?.[0]?.name || '42 Perpignan',
    poolYear: intraUser.pool_year || '2024',
    isAdmin: rank >= ROLE_RANK.staff,
    isManager: rank >= ROLE_RANK.admin,
    isBoard: rank >= ROLE_RANK.board,
    role
  };
};

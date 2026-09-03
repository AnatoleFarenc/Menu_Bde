import axios from 'axios';

const getAdminLogins = () => (process.env.ADMIN_LOGINS || '')
  .split(',')
  .map(login => login.trim().toLowerCase())
  .filter(Boolean);

export const get42AuthUrl = () => {
  const clientId = process.env.INTRA42_CLIENT_ID;
  if (!clientId) {
    throw new Error('INTRA42_CLIENT_ID absent du fichier .env');
  }
  const redirectUri = encodeURIComponent(process.env.INTRA42_REDIRECT_URI || 'http://localhost:3000/api/auth/42/callback');
  return `https://api.intra.42.fr/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=public`;
};

export const handle42Callback = async (code) => {
  if (!code) {
    throw new Error('Code OAuth 42 manquant');
  }

  const clientId = process.env.INTRA42_CLIENT_ID;
  const clientSecret = process.env.INTRA42_CLIENT_SECRET;
  const redirectUri = process.env.INTRA42_REDIRECT_URI || 'http://localhost:3000/api/auth/42/callback';

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
  const isAdmin = getAdminLogins().includes(login);

  return {
    id: intraUser.id,
    login: intraUser.login,
    displayName: intraUser.usual_full_name || intraUser.displayname || intraUser.login,
    email: intraUser.email,
    avatarUrl: intraUser.image?.link || intraUser.image?.versions?.medium || 'https://profile.intra.42.fr/assets/42_logo-7e42914c62...png',
    campus: intraUser.campus?.[0]?.name || '42 Perpignan',
    poolYear: intraUser.pool_year || '2024',
    isAdmin: isAdmin,
    role: isAdmin ? 'bde_admin' : 'student'
  };
};

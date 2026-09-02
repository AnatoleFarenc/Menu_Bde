import axios from 'axios';

const ADMIN_LOGINS = (process.env.ADMIN_LOGINS || 'alix,admin,bde_admin,president_bde,staff42').split(',').map(s => s.trim().toLowerCase());

export const get42AuthUrl = () => {
  const clientId = process.env.INTRA42_CLIENT_ID || 'DEMO_CLIENT_ID';
  const redirectUri = encodeURIComponent(process.env.INTRA42_REDIRECT_URI || 'http://localhost:3000/api/auth/42/callback');
  return `https://api.intra.42.fr/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=public`;
};

export const handle42Callback = async (code) => {
  const clientId = process.env.INTRA42_CLIENT_ID;
  const clientSecret = process.env.INTRA42_CLIENT_SECRET;
  const redirectUri = process.env.INTRA42_REDIRECT_URI || 'http://localhost:3000/api/auth/42/callback';

  if (!clientId || !clientSecret) {
    throw new Error('42 Intra OAuth keys not set in environment. Use Demo Mode or configure .env');
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
  const isAdmin = ADMIN_LOGINS.includes(login) || intraUser['staff?'] === true;

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

export const createDemoUser = (type = 'student') => {
  if (type === 'admin') {
    return {
      id: 42000,
      login: 'alix_bde',
      displayName: 'Alix (BDE Admin)',
      email: 'bde@42.fr',
      avatarUrl: 'https://cdn.intra.42.fr/users/medium_default.png',
      campus: '42 Campus',
      poolYear: '2024',
      isAdmin: true,
      role: 'bde_admin'
    };
  }
  return {
    id: 42101,
    login: 'student42',
    displayName: 'Étudiant 42',
    email: 'student@student.42.fr',
    avatarUrl: 'https://cdn.intra.42.fr/users/medium_default.png',
    campus: '42 Campus',
    poolYear: '2024',
    isAdmin: false,
    role: 'student'
  };
};

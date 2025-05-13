import 'dotenv/config';

export const config = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'siwe-quickstart-secret',
    name: 'siwe-quickstart',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: true,
    },
  },
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },
} as const;

export type Config = typeof config; 
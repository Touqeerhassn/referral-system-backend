import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required environment variable: ${key}`);
    return value;
}

export const env = {
    PORT: process.env.PORT || '5000',
    DATABASE_URL: requireEnv('DATABASE_URL'),
    NODE_ENV: process.env.NODE_ENV || 'development',
};

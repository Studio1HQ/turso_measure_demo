export const TURSO_URL = process.env.EXPO_PUBLIC_TURSO_URL?.trim() || '';
export const TURSO_AUTH_TOKEN = process.env.EXPO_PUBLIC_TURSO_AUTH_TOKEN?.trim() || '';
export const SYNC_ENABLED = Boolean(TURSO_URL && TURSO_AUTH_TOKEN);

export const DEMO_NOTE_ID = 'demo-product-launch';
export const DEMO_NOTE = {
  id: DEMO_NOTE_ID,
  title: 'Product Launch Plan',
  content: 'Launch is planned for Friday. Final QA is pending.',
};

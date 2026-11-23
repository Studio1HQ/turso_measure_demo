export const colors = {
  bg: '#F6F4EF',
  card: '#FFFFFF',
  ink: '#1C1B19',
  muted: '#8A867D',
  line: '#E7E3DA',
  accent: '#2F5BEA',
  green: '#1F9D55',
  greenBg: '#E6F5EC',
  amber: '#B7791F',
  amberBg: '#FDF3E1',
  red: '#D64545',
  redBg: '#FCEBEB',
  grayBg: '#EEECE6',
};

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

import { createClient } from '@supabase/supabase-js';

export function getValidSupabaseUrl(): string {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    'https://rcvetyahocznanvbggqf.supabase.co',
  ];
  for (const url of candidates) {
    if (url && typeof url === 'string') {
      const trimmed = url.trim();
      if (
        (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
        !trimmed.includes('@')
      ) {
        return trimmed;
      }
    }
  }
  return 'https://rcvetyahocznanvbggqf.supabase.co';
}

export function getAdminSupabaseClient() {
  const supabaseUrl = getValidSupabaseUrl();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';

  const activeKey = serviceRoleKey || anonKey;

  if (!activeKey) {
    throw new Error('伺服器未設定 Supabase 金鑰');
  }

  const client = createClient(supabaseUrl, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return {
    client,
    supabaseUrl,
    serviceRoleKey,
    hasServiceRoleKey: Boolean(serviceRoleKey),
  };
}

export function calculateNextTeacherNo(teachers: any[]): string {
  let maxNum = 0;
  for (const t of teachers) {
    const no = t.acctno || t.teacherNo;
    if (no && typeof no === 'string') {
      const match = no.trim().match(/^T(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  const nextNum = maxNum + 1;
  if (nextNum <= 999) {
    return `T${String(nextNum).padStart(3, '0')}`;
  }
  return `T${nextNum}`;
}

export function parseRequestBody(req: any): any {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

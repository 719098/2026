import { getAdminSupabaseClient, parseRequestBody } from '../_supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed, please use POST' });
  }

  const body = parseRequestBody(req);
  const { teacherIds } = body || {};

  if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
    return res.json({ urls: {} });
  }

  try {
    const { client: adminSupabase } = getAdminSupabaseClient();
    const urls: Record<string, string> = {};

    await Promise.all(
      teacherIds.map(async (tid: string) => {
        if (!tid || typeof tid !== 'string') return;
        const { data: files } = await adminSupabase.storage
          .from('teacher-avatars')
          .list(tid);

        if (files && files.length > 0) {
          const avatarFile = files.find((f: any) => f.name.startsWith('avatar.')) || files[0];
          if (avatarFile) {
            const path = `${tid}/${avatarFile.name}`;
            const { data: signedData } = await adminSupabase.storage
              .from('teacher-avatars')
              .createSignedUrl(path, 60 * 60 * 24);

            if (signedData?.signedUrl) {
              urls[tid] = signedData.signedUrl;
            }
          }
        }
      })
    );

    return res.json({ urls });
  } catch (err: any) {
    console.error('[Vercel API get-teacher-avatar-urls] Unexpected error:', err);
    return res.json({ urls: {} });
  }
}

import { supabase } from './supabase';
import { Student, Teacher } from '../types';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface AvatarValidationResult {
  valid: boolean;
  error?: string;
}

export interface AvatarUploadResult {
  success: boolean;
  storagePath?: string;
  signedUrl?: string;
  error?: string;
}

/**
 * Validates file format and size for student avatars.
 */
export function validateAvatarFile(file: File): AvatarValidationResult {
  if (!file) {
    return { valid: false, error: '請選擇照片檔案' };
  }

  // Check file mime type
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: '照片格式不符：僅支援 JPEG (.jpg, .jpeg)、PNG (.png) 或 WebP (.webp) 格式',
    };
  }

  // Check file size (max 5 MB)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `檔案過大 (${sizeInMb} MB)：大頭照檔案大小不得超過 5 MB`,
    };
  }

  return { valid: true };
}

/**
 * Extracts storage path from an avatarUrl string if it resides in Supabase Storage.
 */
export function extractStoragePath(avatarUrl?: string | null): string | null {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;

  // If already relative path: e.g. "student-avatars/uuid/avatar.webp" or "uuid/avatar.webp"
  if (avatarUrl.startsWith('student-avatars/')) {
    return avatarUrl.replace('student-avatars/', '');
  }

  // If it's a Supabase storage URL (public or signed)
  if (avatarUrl.includes('/student-avatars/')) {
    const parts = avatarUrl.split('/student-avatars/');
    if (parts[1]) {
      // Remove query parameters (?token=...)
      return parts[1].split('?')[0];
    }
  }

  // If path looks like uuid/filename (standard UUID regex)
  const uuidPrefixRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;
  if (uuidPrefixRegex.test(avatarUrl)) {
    return avatarUrl.split('?')[0];
  }

  return null;
}

/**
 * Uploads a student avatar to the private 'student-avatars' bucket in Supabase Storage.
 * Path format: <student_id>/avatar.<ext>
 * Cleans up previous avatar files under <student_id>/ to prevent orphan files.
 */
export async function uploadStudentAvatar(
  studentId: string,
  file: File
): Promise<AvatarUploadResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase 客戶端尚未初始化' };
  }

  if (!studentId) {
    return { success: false, error: '未提供合法的學員識別碼 (student_id)' };
  }

  // 1. Validate file
  const validation = validateAvatarFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // 2. Determine file extension
    let ext = 'webp';
    if (file.type === 'image/jpeg') ext = 'jpg';
    else if (file.type === 'image/png') ext = 'png';
    else if (file.type === 'image/webp') ext = 'webp';
    else {
      const parts = file.name.split('.');
      if (parts.length > 1) ext = parts.pop()?.toLowerCase() || 'webp';
    }

    const targetFileName = `avatar.${ext}`;
    const targetFilePath = `${studentId}/${targetFileName}`;

    // 3. Clean up existing files in the student's folder to avoid accumulating duplicate files
    try {
      const { data: existingFiles } = await supabase.storage
        .from('student-avatars')
        .list(studentId);

      if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles
          .filter((f) => f.name !== targetFileName)
          .map((f) => `${studentId}/${f.name}`);

        if (filesToRemove.length > 0) {
          await supabase.storage.from('student-avatars').remove(filesToRemove);
        }
      }
    } catch (cleanErr) {
      console.warn('[StorageService] Notice cleaning previous avatar files:', cleanErr);
    }

    // 4. Upload new file with upsert
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('student-avatars')
      .upload(targetFilePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError || !uploadData) {
      console.error('[StorageService] Error uploading avatar to student-avatars:', uploadError);
      return {
        success: false,
        error: `上傳照片失敗 [${uploadError?.name || 'ERR'}]: ${uploadError?.message || '未知錯誤'}`,
      };
    }

    // 5. Generate Signed URL (valid for 24 hours = 86400 seconds)
    const { data: signedData, error: signError } = await supabase.storage
      .from('student-avatars')
      .createSignedUrl(targetFilePath, 60 * 60 * 24);

    if (signError || !signedData?.signedUrl) {
      console.warn('[StorageService] Notice creating signed URL:', signError);
    }

    return {
      success: true,
      storagePath: targetFilePath,
      signedUrl: signedData?.signedUrl || targetFilePath,
    };
  } catch (err: any) {
    console.error('[StorageService] Unexpected error during avatar upload:', err);
    return {
      success: false,
      error: `照片上傳過程中發生異常: ${err.message || String(err)}`,
    };
  }
}

/**
 * Creates a signed URL for a student's avatar path.
 */
export async function getStudentAvatarSignedUrl(
  pathOrUrl?: string | null,
  expiresInSeconds = 60 * 60 * 24
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (!supabase) return pathOrUrl;

  const storagePath = extractStoragePath(pathOrUrl);
  if (!storagePath) {
    // External URL (e.g. Unsplash)
    return pathOrUrl;
  }

  try {
    const { data, error } = await supabase.storage
      .from('student-avatars')
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return pathOrUrl;
    }
    return data.signedUrl;
  } catch {
    return pathOrUrl;
  }
}

/**
 * Batch resolves signed URLs for an array of student objects.
 */
export async function batchResolveStudentAvatars(
  students: Student[],
  expiresInSeconds = 60 * 60 * 24
): Promise<Student[]> {
  if (!supabase || students.length === 0) return students;

  const pathsToSign: { index: number; path: string }[] = [];

  students.forEach((student, idx) => {
    const storagePath = extractStoragePath(student.avatarUrl);
    if (storagePath) {
      pathsToSign.push({ index: idx, path: storagePath });
    }
  });

  if (pathsToSign.length === 0) {
    return students;
  }

  try {
    const rawPaths = pathsToSign.map((p) => p.path);
    const { data: signedList, error } = await supabase.storage
      .from('student-avatars')
      .createSignedUrls(rawPaths, expiresInSeconds);

    if (error || !signedList) {
      return students;
    }

    const updatedStudents = [...students];
    signedList.forEach((item, i) => {
      const originalInfo = pathsToSign[i];
      if (item && item.signedUrl && originalInfo) {
        updatedStudents[originalInfo.index] = {
          ...updatedStudents[originalInfo.index],
          avatarUrl: item.signedUrl,
        };
      }
    });

    return updatedStudents;
  } catch (err) {
    console.warn('[StorageService] Error during batch avatar resolution:', err);
    return students;
  }
}

/**
 * Deletes all files (avatars and documents) associated with a student UUID from Supabase Storage.
 * Ensures no orphan files remain in student-avatars or student-documents.
 */
export async function deleteStudentStorageFiles(
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !studentId) {
    return { success: false, error: '缺少 Supabase 客戶端或學員識別碼' };
  }

  const buckets = ['student-avatars', 'student-documents'];
  const errors: string[] = [];

  for (const bucket of buckets) {
    try {
      const { data: files, error: listError } = await supabase.storage
        .from(bucket)
        .list(studentId);

      if (listError) {
        console.warn(`[StorageService] Notice listing files in ${bucket}/${studentId}:`, listError);
        continue;
      }

      if (files && files.length > 0) {
        const filesToRemove = files.map((f) => `${studentId}/${f.name}`);
        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove(filesToRemove);

        if (removeError) {
          console.warn(`[StorageService] Warning removing files from ${bucket}:`, removeError);
          errors.push(`${bucket}: ${removeError.message}`);
        } else {
          console.log(`[StorageService] Successfully cleaned up ${filesToRemove.length} files from ${bucket} for student ${studentId}`);
        }
      }
    } catch (bucketErr: any) {
      console.warn(`[StorageService] Exception cleaning bucket ${bucket}:`, bucketErr);
    }
  }

  return {
    success: errors.length === 0,
    error: errors.length > 0 ? errors.join(', ') : undefined,
  };
}

/**
 * Helper to convert File to Base64 string for Server API transmission.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Validates file format and size for teacher avatars.
 */
export function validateTeacherAvatarFile(file: File): AvatarValidationResult {
  if (!file) {
    return { valid: false, error: '請選擇照片檔案' };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: '照片格式不符：僅支援 JPEG (.jpg, .jpeg)、PNG (.png) 或 WebP (.webp) 格式',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `檔案過大 (${sizeInMb} MB)：照片檔案大小不得超過 5 MB`,
    };
  }

  return { valid: true };
}

/**
 * Helper to probe Supabase Storage for a teacher's photo URL (Public URL or Signed URL).
 * Checks avatar.jpg, avatar.png, avatar.webp, avatar.jpeg directly from Storage.
 */
export async function getSingleTeacherAvatarUrl(
  teacherId: string
): Promise<string | null> {
  if (!teacherId) return null;

  const baseUrl = 'https://rcvetyahocznanvbggqf.supabase.co';
  const exts = ['jpg', 'png', 'webp', 'jpeg'];

  for (const ext of exts) {
    const pubUrl = `${baseUrl}/storage/v1/object/public/teacher-avatars/${teacherId}/avatar.${ext}`;
    try {
      const res = await fetch(pubUrl, { method: 'HEAD' });
      if (res.ok) {
        return pubUrl;
      }
    } catch {
      // ignore
    }
  }

  if (supabase) {
    for (const ext of exts) {
      const path = `${teacherId}/avatar.${ext}`;
      try {
        const { data } = await supabase.storage
          .from('teacher-avatars')
          .createSignedUrl(path, 60 * 60 * 24);
        if (data?.signedUrl) {
          const checkRes = await fetch(data.signedUrl, { method: 'HEAD' });
          if (checkRes.ok) {
            return data.signedUrl;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/**
 * Uploads a teacher avatar to Supabase Storage ('teacher-avatars').
 * Tries Server API first, with client-side Supabase Storage fallback.
 */
export async function uploadTeacherAvatar(
  teacherId: string,
  file: File
): Promise<AvatarUploadResult> {
  if (!teacherId) {
    return { success: false, error: '未提供有效的教師識別碼 (teacherId)' };
  }

  const validation = validateTeacherAvatarFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const base64Str = await fileToBase64(file);
    const res = await fetch('/api/admin/upload-teacher-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId,
        fileData: base64Str,
        fileType: file.type,
        fileName: file.name,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.success && result.signedUrl) {
        return {
          success: true,
          storagePath: result.storagePath,
          signedUrl: result.signedUrl,
        };
      }
    }
  } catch (err) {
    console.warn('[StorageService] Server API upload failed, using client fallback:', err);
  }

  if (!supabase) {
    return { success: false, error: 'Supabase 客戶端未初始化且伺服器 API 無法連線' };
  }

  try {
    let ext = 'webp';
    if (file.type === 'image/jpeg') ext = 'jpg';
    else if (file.type === 'image/png') ext = 'png';
    else if (file.type === 'image/webp') ext = 'webp';

    const targetFilePath = `${teacherId}/avatar.${ext}`;

    const { data: existingFiles } = await supabase.storage
      .from('teacher-avatars')
      .list(teacherId);

    if (existingFiles && existingFiles.length > 0) {
      const filesToRemove = existingFiles.map((f) => `${teacherId}/${f.name}`);
      await supabase.storage.from('teacher-avatars').remove(filesToRemove);
    }

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('teacher-avatars')
      .upload(targetFilePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr || !uploadData) {
      return {
        success: false,
        error: `照片上傳至 Storage 失敗: ${uploadErr?.message || '未知錯誤'}`,
      };
    }

    const { data: pubData } = supabase.storage.from('teacher-avatars').getPublicUrl(targetFilePath);
    const { data: signedData } = await supabase.storage.from('teacher-avatars').createSignedUrl(targetFilePath, 60 * 60 * 24);

    const finalUrl = signedData?.signedUrl || pubData?.publicUrl || targetFilePath;

    return {
      success: true,
      storagePath: targetFilePath,
      signedUrl: finalUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `照片上傳過程中發生例外錯誤: ${err.message || String(err)}`,
    };
  }
}

/**
 * Deletes a teacher avatar from Supabase Storage ('teacher-avatars').
 * Tries Server API first, with client-side Supabase Storage fallback.
 */
export async function deleteTeacherAvatar(
  teacherId: string
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) {
    return { success: false, error: '未提供有效的教師識別碼 (teacherId)' };
  }

  try {
    const res = await fetch('/api/admin/delete-teacher-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.success) {
        return { success: true };
      }
    }
  } catch (err) {
    console.warn('[StorageService] Server API delete failed, using client fallback:', err);
  }

  if (!supabase) {
    return { success: false, error: 'Supabase 客戶端未初始化' };
  }

  try {
    const { data: existingFiles, error: listErr } = await supabase.storage
      .from('teacher-avatars')
      .list(teacherId);

    if (listErr) {
      return { success: false, error: `查詢照片目錄失敗: ${listErr.message}` };
    }

    if (existingFiles && existingFiles.length > 0) {
      const filesToRemove = existingFiles.map((f) => `${teacherId}/${f.name}`);
      const { error: removeErr } = await supabase.storage
        .from('teacher-avatars')
        .remove(filesToRemove);

      if (removeErr) {
        return { success: false, error: `刪除照片失敗: ${removeErr.message}` };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: `刪除照片發生例外: ${err.message || String(err)}` };
  }
}

/**
 * Batch resolves signed/public URLs for an array of Teacher objects from 'teacher-avatars'.
 * Uses Server API when available, and falls back to probing Supabase Storage directly.
 */
export async function batchResolveTeacherAvatars(
  teachers: Teacher[]
): Promise<Teacher[]> {
  if (!teachers || teachers.length === 0) return teachers;

  const validTeachers = teachers.filter((t) => Boolean(t.id));
  if (validTeachers.length === 0) return teachers;

  let urlMap: Record<string, string> = {};

  try {
    const teacherIds = validTeachers.map((t) => t.id);
    const res = await fetch('/api/admin/get-teacher-avatar-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherIds }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result && typeof result.urls === 'object') {
        urlMap = result.urls;
      }
    }
  } catch (err) {
    console.warn('[StorageService] Notice fetching avatar URLs from server API:', err);
  }

  const updatedTeachers = await Promise.all(
    teachers.map(async (t) => {
      let resolved = urlMap[t.id];
      if (!resolved) {
        const probedUrl = await getSingleTeacherAvatarUrl(t.id);
        if (probedUrl) {
          resolved = probedUrl;
        }
      }
      return {
        ...t,
        avatarUrl: resolved || undefined,
      };
    })
  );

  return updatedTeachers;
}

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
 * Uploads a teacher avatar to Supabase Storage ('teacher-avatars') via Server API.
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

    const result = await res.json();
    if (!res.ok || !result.success) {
      return {
        success: false,
        error: result.error || '上傳教師照片失敗',
      };
    }

    return {
      success: true,
      storagePath: result.storagePath,
      signedUrl: result.signedUrl,
    };
  } catch (err: any) {
    console.error('[StorageService] Error uploading teacher avatar:', err);
    return {
      success: false,
      error: `上傳教師照片發生例外錯誤: ${err.message || String(err)}`,
    };
  }
}

/**
 * Deletes a teacher avatar from Supabase Storage ('teacher-avatars') via Server API.
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

    const result = await res.json();
    if (!res.ok || !result.success) {
      return {
        success: false,
        error: result.error || '刪除教師照片失敗',
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[StorageService] Error deleting teacher avatar:', err);
    return {
      success: false,
      error: `刪除教師照片發生例外錯誤: ${err.message || String(err)}`,
    };
  }
}

/**
 * Batch resolves signed URLs for an array of Teacher objects from 'teacher-avatars'.
 */
export async function batchResolveTeacherAvatars(
  teachers: Teacher[]
): Promise<Teacher[]> {
  if (!teachers || teachers.length === 0) return teachers;

  const validTeachers = teachers.filter((t) => Boolean(t.id));
  if (validTeachers.length === 0) return teachers;

  try {
    const teacherIds = validTeachers.map((t) => t.id);
    const res = await fetch('/api/admin/get-teacher-avatar-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherIds }),
    });

    const result = await res.json();
    const urlMap: Record<string, string> = result?.urls || {};

    return teachers.map((t) => {
      const signedUrl = urlMap[t.id];
      return {
        ...t,
        avatarUrl: signedUrl || undefined,
      };
    });
  } catch (err) {
    console.warn('[StorageService] Error batch resolving teacher avatars:', err);
    return teachers;
  }
}

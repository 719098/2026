import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  Camera,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Check,
  Trash2,
  FileQuestion,
  Sparkles,
  Info,
  Image as ImageIcon,
} from 'lucide-react';
import { Student } from '../../types';
import { uploadStudentAvatar } from '../../lib/storageService';
import { updateStudentInSupabase } from '../../lib/studentService';

export interface BatchImportStudentPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onImportComplete: () => Promise<void> | void;
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export interface ParsedPhotoItem {
  id: string;
  file: File;
  fileName: string;
  baseName: string;
  extension: string;
  previewUrl: string;
  fileSize: number;
  status: 'matched' | 'unmatched' | 'conflict' | 'unsupported_format' | 'file_too_large' | 'invalid_name';
  errorMessage?: string;
  matchedStudent?: Student;
  hasExistingPhoto?: boolean;
  uploadStatus?: 'pending' | 'uploading' | 'success' | 'failed';
  uploadError?: string;
}

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const BatchImportStudentPhotosModal: React.FC<BatchImportStudentPhotosModalProps> = ({
  isOpen,
  onClose,
  students = [],
  onImportComplete,
  onShowToast,
}) => {
  const [photoItems, setPhotoItems] = useState<ParsedPhotoItem[]>([]);
  const [filterTab, setFilterTab] = useState<'ALL' | 'MATCHED' | 'ISSUES'>('ALL');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentName?: string } | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{ success: number; failed: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Clean up object URLs on unmount or on clear
  useEffect(() => {
    return () => {
      photoItems.forEach((item) => {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // ignore
        }
      });
    };
  }, [photoItems]);

  // Handle ESC key to close modal if not uploading
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isUploading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isUploading, onClose]);

  // Re-evaluates matching and conflicts across all current items
  const recomputeStatusForItems = useCallback(
    (items: ParsedPhotoItem[]): ParsedPhotoItem[] => {
      // 1. Group candidate student numbers among valid format items to detect conflicts
      const studentNumberCounts = new Map<string, number>();

      items.forEach((it) => {
        if (it.status !== 'unsupported_format' && it.status !== 'file_too_large' && it.status !== 'invalid_name') {
          const cleanKey = it.baseName.toLowerCase().trim();
          if (cleanKey) {
            studentNumberCounts.set(cleanKey, (studentNumberCounts.get(cleanKey) || 0) + 1);
          }
        }
      });

      return items.map((item) => {
        // If it was already a format or size issue, keep as is
        if (
          item.status === 'unsupported_format' ||
          item.status === 'file_too_large' ||
          item.status === 'invalid_name'
        ) {
          return item;
        }

        const cleanBase = item.baseName.toLowerCase().trim();
        const count = studentNumberCounts.get(cleanBase) || 0;

        // Strictly match student_number / stno
        const matched = students.find((s) => {
          const sNum = (s.studentNumber || s.stno || '').trim().toLowerCase();
          return sNum === cleanBase;
        });

        if (!matched) {
          return {
            ...item,
            status: 'unmatched',
            matchedStudent: undefined,
            errorMessage: `查無學號為「${item.baseName}」之學生檔案`,
          };
        }

        if (count > 1) {
          return {
            ...item,
            status: 'conflict',
            matchedStudent: matched,
            hasExistingPhoto: Boolean(matched.avatarUrl && matched.avatarUrl.trim() !== ''),
            errorMessage: `此學號 (${matched.studentNumber}) 於本次選擇中存在多張照片，請刪除重複項`,
          };
        }

        return {
          ...item,
          status: 'matched',
          matchedStudent: matched,
          hasExistingPhoto: Boolean(matched.avatarUrl && matched.avatarUrl.trim() !== ''),
          errorMessage: undefined,
        };
      });
    },
    [students]
  );

  // Handle files selected (from file input or drop)
  const handleFilesSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newRawItems: ParsedPhotoItem[] = [];

    Array.from(files).forEach((file, index) => {
      const fileName = file.name;
      const lastDotIndex = fileName.lastIndexOf('.');
      const previewUrl = URL.createObjectURL(file);

      // Check for missing extension
      if (lastDotIndex === -1) {
        newRawItems.push({
          id: `${file.name}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          file,
          fileName,
          baseName: fileName,
          extension: '',
          previewUrl,
          fileSize: file.size,
          status: 'unsupported_format',
          errorMessage: '檔案無副檔名，僅支援 .jpg, .jpeg, .png, .webp',
        });
        return;
      }

      const extension = fileName.slice(lastDotIndex).toLowerCase();
      const baseName = fileName.slice(0, lastDotIndex).trim();

      // Check supported format
      if (!SUPPORTED_EXTENSIONS.includes(extension)) {
        newRawItems.push({
          id: `${file.name}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          file,
          fileName,
          baseName,
          extension,
          previewUrl,
          fileSize: file.size,
          status: 'unsupported_format',
          errorMessage: `不支援的格式 (${extension})，僅支援 .jpg, .jpeg, .png, .webp`,
        });
        return;
      }

      // Check file size (5MB max)
      if (file.size > MAX_FILE_SIZE_BYTES) {
        newRawItems.push({
          id: `${file.name}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          file,
          fileName,
          baseName,
          extension,
          previewUrl,
          fileSize: file.size,
          status: 'file_too_large',
          errorMessage: `檔案過大 (${(file.size / (1024 * 1024)).toFixed(1)} MB)，單檔上限為 5MB`,
        });
        return;
      }

      // Check empty baseName
      if (!baseName) {
        newRawItems.push({
          id: `${file.name}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          file,
          fileName,
          baseName,
          extension,
          previewUrl,
          fileSize: file.size,
          status: 'invalid_name',
          errorMessage: '照片檔名不可為空白',
        });
        return;
      }

      // Temporary placeholder item (will be evaluated by recomputeStatusForItems)
      newRawItems.push({
        id: `${file.name}-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        fileName,
        baseName,
        extension,
        previewUrl,
        fileSize: file.size,
        status: 'unmatched',
      });
    });

    setPhotoItems((prev) => recomputeStatusForItems([...prev, ...newRawItems]));
    setUploadSummary(null);
  };

  // Remove a single item
  const handleRemoveItem = (id: string) => {
    setPhotoItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          // ignore
        }
      }
      const remaining = prev.filter((i) => i.id !== id);
      return recomputeStatusForItems(remaining);
    });
  };

  // Clear all items
  const handleClearAll = () => {
    photoItems.forEach((item) => {
      try {
        URL.revokeObjectURL(item.previewUrl);
      } catch {
        // ignore
      }
    });
    setPhotoItems([]);
    setUploadSummary(null);
    setUploadProgress(null);
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!isUploading && e.dataTransfer.files) {
      handleFilesSelect(e.dataTransfer.files);
    }
  };

  // Metric counts
  const totalCount = photoItems.length;
  const matchedCount = photoItems.filter((i) => i.status === 'matched').length;
  const unmatchedCount = photoItems.filter((i) => i.status === 'unmatched').length;
  const conflictCount = photoItems.filter((i) => i.status === 'conflict').length;
  const errorCount = photoItems.filter(
    (i) => i.status === 'unsupported_format' || i.status === 'file_too_large' || i.status === 'invalid_name'
  ).length;

  const filteredItems = useMemo(() => {
    if (filterTab === 'MATCHED') return photoItems.filter((i) => i.status === 'matched');
    if (filterTab === 'ISSUES') return photoItems.filter((i) => i.status !== 'matched');
    return photoItems;
  }, [photoItems, filterTab]);

  // Execute upload process for matched items
  const handleStartUpload = async () => {
    const uploadableItems = photoItems.filter((i) => i.status === 'matched' && i.matchedStudent);
    if (uploadableItems.length === 0) {
      onShowToast('目前無符合條件之匹配照片可上傳', 'warning');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: uploadableItems.length, currentName: '' });
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < uploadableItems.length; i++) {
      const item = uploadableItems[i];
      const student = item.matchedStudent!;

      setUploadProgress({
        current: i + 1,
        total: uploadableItems.length,
        currentName: `${student.name} (${student.studentNumber || student.stno})`,
      });

      // Update state to uploading
      setPhotoItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, uploadStatus: 'uploading' } : it))
      );

      try {
        // 1. Upload file to Supabase Storage private 'student-avatars' bucket
        const uploadRes = await uploadStudentAvatar(student.id, item.file);

        if (!uploadRes.success || !uploadRes.storagePath) {
          throw new Error(uploadRes.error || '照片上傳至 Storage 失敗');
        }

        // 2. Update student avatarUrl in public.students table
        const updatedStudent: Student = {
          ...student,
          avatarUrl: uploadRes.signedUrl || uploadRes.storagePath,
        };

        const updateRes = await updateStudentInSupabase(updatedStudent);
        if (updateRes.error) {
          throw new Error(updateRes.error.message || '更新學生資料庫個人照片連結失敗');
        }

        successCount++;
        setPhotoItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, uploadStatus: 'success' } : it))
        );
      } catch (err: any) {
        failedCount++;
        const errMsg = err?.message || String(err);
        setPhotoItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, uploadStatus: 'failed', uploadError: errMsg } : it
          )
        );
      }
    }

    setIsUploading(false);
    setUploadSummary({ success: successCount, failed: failedCount });

    if (successCount > 0) {
      await onImportComplete();
      onShowToast(
        `🎉 成功為 ${successCount} 位學員更新個人大頭照！${failedCount > 0 ? ` (失敗 ${failedCount} 位)` : ''}`,
        'success'
      );
    } else {
      onShowToast('照片上傳失敗，請檢查網路連線或儲存庫權限', 'error');
    }
  };

  if (!isOpen) return null;

  // Render modal into document.body with createPortal for top-level stacking context
  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-photo-modal-title"
      onClick={(e) => {
        if (!isUploading && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 my-auto max-h-[92vh] flex flex-col transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 id="batch-photo-modal-title" className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <span>批量匯入學生照片</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  以學號自動配對
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                系統依檔案名稱中的「學生學號」自動精準配對學生，支援即時預覽、覆蓋更新與防呆驗證。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            aria-label="關閉"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* STEP 1: Instructions & Selection Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/60 scale-[1.005]'
                : isUploading
                ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
                : 'border-indigo-200 bg-indigo-50/20 hover:bg-indigo-50/35 hover:border-indigo-300'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                handleFilesSelect(e.target.files);
                e.target.value = '';
              }}
            />

            <div className="flex flex-col items-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100/80 text-indigo-700 flex items-center justify-center shadow-2xs">
                <Upload className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {isDragOver ? '釋放滑鼠以上傳照片' : '選擇照片或將多張照片拖曳至此'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-lg leading-relaxed">
                  請將學生照片檔名設定為「<strong>學生學號</strong>」（例如：
                  <code className="text-indigo-700 font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-100 mx-1">
                    C11421260.jpg
                  </code>
                  、
                  <code className="text-indigo-700 font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-100 mx-1">
                    STU2026102.png
                  </code>
                  ），系統會依學號自動配對學生。
                </p>
              </div>

              <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>選擇照片 (可多選)</span>
                </button>

                {photoItems.length > 0 && !isUploading && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空重選</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500 pt-1">
                <span>
                  支援格式：<strong className="text-slate-700 font-mono">.jpg, .jpeg, .png, .webp</strong>
                </span>
                <span>•</span>
                <span>單檔上限：5MB</span>
                <span>•</span>
                <span>英文字母大小寫不敏感</span>
              </div>
            </div>
          </div>

          {/* STEP 3: Statistics Dashboard Banner */}
          {photoItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[11px] font-bold text-slate-500 block">總選取照片</span>
                <span className="text-xl font-black text-slate-800 font-mono">{totalCount}</span>
                <span className="text-[10px] text-slate-400 block">張檔案</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <span className="text-[11px] font-bold text-emerald-800 block">成功配對</span>
                <span className="text-xl font-black text-emerald-700 font-mono">{matchedCount}</span>
                <span className="text-[10px] text-emerald-600 block">位學生可匯入</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <span className="text-[11px] font-bold text-amber-800 block">查無學號</span>
                <span className="text-xl font-black text-amber-700 font-mono">{unmatchedCount}</span>
                <span className="text-[10px] text-amber-600 block">張未匹配</span>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                <span className="text-[11px] font-bold text-rose-800 block">重複或異常</span>
                <span className="text-xl font-black text-rose-700 font-mono">
                  {conflictCount + errorCount}
                </span>
                <span className="text-[10px] text-rose-600 block">需排除之檔案</span>
              </div>
            </div>
          )}

          {/* STEP 5: Upload Progress Bar */}
          {isUploading && uploadProgress && (
            <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-4 text-xs space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between font-bold text-indigo-950">
                <span className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>正在處理上傳照片至學生學籍檔案...</span>
                  {uploadProgress.currentName && (
                    <span className="text-[11px] text-indigo-700 font-medium">
                      ({uploadProgress.currentName})
                    </span>
                  )}
                </span>
                <span className="font-mono text-indigo-700">
                  {uploadProgress.current} / {uploadProgress.total} (
                  {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-indigo-200/80 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2.5 transition-all duration-300 rounded-full"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Complete Alert */}
          {uploadSummary && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border ${
                uploadSummary.failed === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-sm block">匯入作業已順利完成！</span>
                  <span>
                    成功上傳更新 <strong>{uploadSummary.success}</strong> 位學生的個人大頭照
                    {uploadSummary.failed > 0 && `，失敗 ${uploadSummary.failed} 張`}。
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0 ml-3"
              >
                關閉視窗
              </button>
            </div>
          )}

          {/* STEP 2: Preview Table */}
          {photoItems.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterTab('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'ALL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    全部照片 ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('MATCHED')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'MATCHED'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    成功配對 ({matchedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('ISSUES')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'ISSUES'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    異常 / 未配對 ({totalCount - matchedCount})
                  </button>
                </div>

                <div className="text-[11px] text-slate-400">
                  點擊確認匯入時僅會上傳「成功配對」的照片
                </div>
              </div>

              {/* Table Container */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold z-10 shadow-2xs">
                      <tr>
                        <th className="py-2.5 px-3 w-16 text-center">縮圖</th>
                        <th className="py-2.5 px-3">照片檔名</th>
                        <th className="py-2.5 px-3">解析學號</th>
                        <th className="py-2.5 px-3">學生姓名</th>
                        <th className="py-2.5 px-3">配對狀態 / 說明</th>
                        <th className="py-2.5 px-3 w-16 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                            此篩選條件下無符合的照片
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          const isMatched = item.status === 'matched';
                          const isConflict = item.status === 'conflict';
                          const isUnmatched = item.status === 'unmatched';
                          const isError =
                            item.status === 'unsupported_format' ||
                            item.status === 'file_too_large' ||
                            item.status === 'invalid_name';

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors hover:bg-slate-50/80 ${
                                isMatched
                                  ? 'bg-emerald-50/15'
                                  : isConflict
                                  ? 'bg-rose-50/20'
                                  : isUnmatched
                                  ? 'bg-amber-50/15'
                                  : 'bg-slate-50/40'
                              }`}
                            >
                              {/* Thumbnail */}
                              <td className="py-2 px-3 text-center align-middle">
                                <img
                                  src={item.previewUrl}
                                  alt={item.fileName}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200 mx-auto bg-white shadow-2xs"
                                />
                              </td>

                              {/* File name & size */}
                              <td className="py-2 px-3 align-middle">
                                <div className="font-mono font-bold text-slate-800 truncate max-w-[170px]" title={item.fileName}>
                                  {item.fileName}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {(item.fileSize / 1024).toFixed(1)} KB
                                </div>
                              </td>

                              {/* Parsed Student Number */}
                              <td className="py-2 px-3 align-middle font-mono">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200">
                                  {item.baseName || '—'}
                                </span>
                              </td>

                              {/* Matched Student Name */}
                              <td className="py-2 px-3 align-middle">
                                {item.matchedStudent ? (
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      {item.matchedStudent.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      {item.matchedStudent.englishName ||
                                        item.matchedStudent.ename ||
                                        item.matchedStudent.studentNumber}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic font-medium">
                                    (查無此人)
                                  </span>
                                )}
                              </td>

                              {/* Status Badge */}
                              <td className="py-2 px-3 align-middle">
                                {isMatched && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>✓ 配對成功</span>
                                    </span>
                                    {item.hasExistingPhoto ? (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        將更新現有照片
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                        首次設定照片
                                      </span>
                                    )}
                                  </div>
                                )}

                                {isUnmatched && (
                                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    <span>✗ 無法配對（未找到對應學號）</span>
                                  </span>
                                )}

                                {isConflict && (
                                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[11px]" title={item.errorMessage}>
                                    <AlertCircle className="w-3 h-3 text-rose-600" />
                                    <span>⚠ 重複衝突（同學號多張照片）</span>
                                  </span>
                                )}

                                {isError && (
                                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-[11px]" title={item.errorMessage}>
                                    <FileQuestion className="w-3 h-3 text-slate-500" />
                                    <span>{item.errorMessage || '檔案異常'}</span>
                                  </span>
                                )}

                                {/* Individual upload indicator */}
                                {item.uploadStatus === 'uploading' && (
                                  <div className="mt-1 text-[11px] text-indigo-600 font-bold flex items-center space-x-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>正在上傳儲存庫...</span>
                                  </div>
                                )}
                                {item.uploadStatus === 'success' && (
                                  <div className="mt-1 text-[11px] text-emerald-700 font-bold flex items-center space-x-1">
                                    <Check className="w-3 h-3" />
                                    <span>上傳完成</span>
                                  </div>
                                )}
                                {item.uploadStatus === 'failed' && (
                                  <div className="mt-1 text-[11px] text-rose-600 font-semibold flex items-center space-x-1" title={item.uploadError}>
                                    <X className="w-3 h-3" />
                                    <span>失敗: {item.uploadError || '寫入失敗'}</span>
                                  </div>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="py-2 px-3 text-center align-middle">
                                {!isUploading && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    title="從本次名單中移除"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100 shrink-0 text-xs">
          <div className="text-slate-600">
            {matchedCount > 0 ? (
              <span className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  已精準比對 <strong>{matchedCount} 位學員</strong> 照片，確認後將寫入資料庫與儲存庫。
                  {unmatchedCount + conflictCount + errorCount > 0 && (
                    <span className="text-slate-400 ml-1">
                      (其餘 {unmatchedCount + conflictCount + errorCount} 張異常檔案將被略過)
                    </span>
                  )}
                </span>
              </span>
            ) : (
              <span className="text-slate-400">
                尚未選取照片，或選取的照片尚未成功配對任何在校學生。
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5 justify-end">
            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              {uploadSummary ? '完成關閉' : '取消'}
            </button>
            <button
              type="button"
              disabled={isUploading || matchedCount === 0}
              onClick={handleStartUpload}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold shadow-xs hover:shadow disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 transition-all"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>上傳處理中...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>確認匯入 ({matchedCount} 張)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

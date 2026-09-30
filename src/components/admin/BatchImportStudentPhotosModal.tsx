import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Camera, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Check, 
  RefreshCw, 
  ImageIcon, 
  Trash2, 
  Eye,
  HelpCircle,
  FileQuestion
} from 'lucide-react';
import { Student } from '../../types';
import { uploadStudentAvatar } from '../../lib/storageService';
import { updateStudentInSupabase } from '../../lib/studentService';

interface BatchImportStudentPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onImportComplete: () => Promise<void> | void;
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface ParsedPhotoItem {
  id: string;
  file: File;
  fileName: string;
  baseName: string;
  previewUrl: string;
  fileSize: number;
  status: 'matched' | 'unmatched' | 'conflict' | 'unsupported_format' | 'invalid_name';
  errorMessage?: string;
  matchedStudent?: Student;
  uploadStatus?: 'pending' | 'uploading' | 'success' | 'failed';
  uploadError?: string;
}

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export const BatchImportStudentPhotosModal: React.FC<BatchImportStudentPhotosModalProps> = ({
  isOpen,
  onClose,
  students,
  onImportComplete,
  onShowToast,
}) => {
  const [photoItems, setPhotoItems] = useState<ParsedPhotoItem[]>([]);
  const [filterTab, setFilterTab] = useState<'ALL' | 'MATCHED' | 'ISSUES'>('ALL');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{ success: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount or items cleanup
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
  }, []);

  if (!isOpen) return null;

  // Handle files selected
  const handleFilesSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: ParsedPhotoItem[] = [];
    const studentCountMap = new Map<string, number>();

    // First, register any previously matched students if we keep existing items
    photoItems.forEach((item) => {
      if (item.matchedStudent) {
        studentCountMap.set(item.matchedStudent.id, (studentCountMap.get(item.matchedStudent.id) || 0) + 1);
      }
    });

    Array.from(files).forEach((file, index) => {
      const fileName = file.name;
      const lastDotIndex = fileName.lastIndexOf('.');
      const previewUrl = URL.createObjectURL(file);

      if (lastDotIndex === -1) {
        newItems.push({
          id: `${file.name}-${index}-${Date.now()}`,
          file,
          fileName,
          baseName: fileName,
          previewUrl,
          fileSize: file.size,
          status: 'unsupported_format',
          errorMessage: '檔案無副檔名，僅支援 .jpg, .jpeg, .png, .webp',
        });
        return;
      }

      const ext = fileName.slice(lastDotIndex).toLowerCase();
      const baseName = fileName.slice(0, lastDotIndex).trim();

      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        newItems.push({
          id: `${file.name}-${index}-${Date.now()}`,
          file,
          fileName,
          baseName,
          previewUrl,
          fileSize: file.size,
          status: 'unsupported_format',
          errorMessage: `不支援的檔案格式 (${ext})，僅支援 .jpg, .jpeg, .png, .webp`,
        });
        return;
      }

      if (!baseName) {
        newItems.push({
          id: `${file.name}-${index}-${Date.now()}`,
          file,
          fileName,
          baseName,
          previewUrl,
          fileSize: file.size,
          status: 'invalid_name',
          errorMessage: '檔案名稱不可為空白',
        });
        return;
      }

      // Match against students
      const cleanBase = baseName.toLowerCase();
      const matched = students.find((s) => {
        const sNum = (s.studentNumber || '').trim().toLowerCase();
        return sNum === cleanBase;
      });

      if (!matched) {
        newItems.push({
          id: `${file.name}-${index}-${Date.now()}`,
          file,
          fileName,
          baseName,
          previewUrl,
          fileSize: file.size,
          status: 'unmatched',
          errorMessage: `在學生名冊中找不到學號為「${baseName}」的學生`,
        });
      } else {
        const currentCount = studentCountMap.get(matched.id) || 0;
        studentCountMap.set(matched.id, currentCount + 1);

        if (currentCount > 0) {
          newItems.push({
            id: `${file.name}-${index}-${Date.now()}`,
            file,
            fileName,
            baseName,
            previewUrl,
            fileSize: file.size,
            status: 'conflict',
            matchedStudent: matched,
            errorMessage: `學生「${matched.name}」(${matched.studentNumber}) 已有其他照片，重複衝突`,
          });
        } else {
          newItems.push({
            id: `${file.name}-${index}-${Date.now()}`,
            file,
            fileName,
            baseName,
            previewUrl,
            fileSize: file.size,
            status: 'matched',
            matchedStudent: matched,
          });
        }
      }
    });

    setPhotoItems((prev) => [...prev, ...newItems]);
    setUploadSummary(null);
  };

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
      return prev.filter((i) => i.id !== id);
    });
  };

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
  };

  // Metrics
  const totalCount = photoItems.length;
  const matchedCount = photoItems.filter((i) => i.status === 'matched').length;
  const unmatchedCount = photoItems.filter((i) => i.status === 'unmatched').length;
  const conflictCount = photoItems.filter((i) => i.status === 'conflict').length;
  const formatErrorCount = photoItems.filter(
    (i) => i.status === 'unsupported_format' || i.status === 'invalid_name'
  ).length;

  const filteredItems = useMemo(() => {
    if (filterTab === 'MATCHED') return photoItems.filter((i) => i.status === 'matched');
    if (filterTab === 'ISSUES') return photoItems.filter((i) => i.status !== 'matched');
    return photoItems;
  }, [photoItems, filterTab]);

  // Execute Upload
  const handleStartUpload = async () => {
    const uploadableItems = photoItems.filter((i) => i.status === 'matched' && i.matchedStudent);
    if (uploadableItems.length === 0) {
      onShowToast('沒有可上傳的匹配照片', 'warning');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: uploadableItems.length });
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < uploadableItems.length; i++) {
      const item = uploadableItems[i];
      setUploadProgress({ current: i + 1, total: uploadableItems.length });

      // Update item status in state
      setPhotoItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, uploadStatus: 'uploading' } : it))
      );

      try {
        const student = item.matchedStudent!;
        // 1. Upload to Supabase Storage
        const uploadRes = await uploadStudentAvatar(student.id, item.file);

        if (!uploadRes.success || !uploadRes.storagePath) {
          throw new Error(uploadRes.error || '照片上傳 Storage 失敗');
        }

        // 2. Update student avatarUrl in Supabase public.students
        const updatedStudent: Student = {
          ...student,
          avatarUrl: uploadRes.storagePath,
        };
        const updateRes = await updateStudentInSupabase(updatedStudent);

        if (updateRes.error) {
          throw new Error(updateRes.error.message || '更新學生資料庫照片連結失敗');
        }

        successCount++;
        setPhotoItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, uploadStatus: 'success' } : it))
        );
      } catch (err: any) {
        failedCount++;
        const errMsg = err.message || String(err);
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
      onShowToast(`🎉 成功為 ${successCount} 位學生匯入個人照片！`, 'success');
    } else {
      onShowToast('照片上傳失敗，請檢查網路連線或儲存空間權限', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">學生照片批量匯入</h2>
              <p className="text-xs text-slate-500">
                以「學號」作為照片檔名進行批次比對與上傳
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Dropzone / File Picker */}
        <div
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
            isUploading
              ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
              : 'border-indigo-200 bg-indigo-50/20 hover:bg-indigo-50/40 hover:border-indigo-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              handleFilesSelect(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="flex flex-col items-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-2xs">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-800">
              點擊此處或拖曳多張照片至此
            </div>
            <p className="text-xs text-slate-500 max-w-md">
              支援格式：<code>.jpg</code>, <code>.jpeg</code>, <code>.png</code>, <code>.webp</code>。
              請將照片檔名命名為學生學號（例如：<code>C11421260.jpg</code>、<code>STU2026102.png</code>）。
            </p>
          </div>
        </div>

        {/* Statistics Dashboard Banner */}
        {photoItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-bold text-slate-500 block">選擇照片</span>
              <span className="text-xl font-black text-slate-800 font-mono">{totalCount}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-bold text-emerald-700 block">成功匹配</span>
              <span className="text-xl font-black text-emerald-700 font-mono">{matchedCount}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-bold text-amber-700 block">無法匹配</span>
              <span className="text-xl font-black text-amber-700 font-mono">{unmatchedCount}</span>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-bold text-rose-700 block">衝突/重複</span>
              <span className="text-xl font-black text-rose-700 font-mono">{conflictCount}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-500 block">格式錯誤</span>
              <span className="text-xl font-black text-slate-600 font-mono">{formatErrorCount}</span>
            </div>
          </div>
        )}

        {/* Upload Progress Bar */}
        {isUploading && uploadProgress && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between font-bold text-indigo-900">
              <span className="flex items-center space-x-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>正在上傳照片至學生檔案與雲端儲存庫...</span>
              </span>
              <span className="font-mono">
                {uploadProgress.current} / {uploadProgress.total} ({Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 transition-all duration-300 rounded-full"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Upload Result Alert */}
        {uploadSummary && (
          <div
            className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
              uploadSummary.failed === 0
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                匯入作業已完成：成功匯入 {uploadSummary.success} 張照片
                {uploadSummary.failed > 0 && `，失敗 ${uploadSummary.failed} 張`}。
              </span>
            </div>
          </div>
        )}

        {/* Filter Tabs & Preview List */}
        {photoItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <button
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
                  onClick={() => setFilterTab('MATCHED')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    filterTab === 'MATCHED'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  成功匹配 ({matchedCount})
                </button>
                <button
                  onClick={() => setFilterTab('ISSUES')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    filterTab === 'ISSUES'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  異常 / 無法匹配 ({totalCount - matchedCount})
                </button>
              </div>

              {!isUploading && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-slate-400 hover:text-rose-600 flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空重選</span>
                </button>
              )}
            </div>

            {/* List Table / Cards */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    item.status === 'matched'
                      ? 'bg-emerald-50/30 border-emerald-200 hover:bg-emerald-50/50'
                      : item.status === 'conflict'
                      ? 'bg-rose-50/30 border-rose-200 hover:bg-rose-50/50'
                      : 'bg-amber-50/30 border-amber-200 hover:bg-amber-50/50'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    {/* Thumbnail preview */}
                    <img
                      src={item.previewUrl}
                      alt={item.fileName}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 bg-white"
                    />

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800 font-mono truncate max-w-[160px]">
                          {item.fileName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({(item.fileSize / 1024).toFixed(1)} KB)
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center space-x-1.5 text-[11px]">
                        {item.status === 'matched' && item.matchedStudent && (
                          <div className="flex items-center space-x-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              比對成功 → {item.matchedStudent.name} (學號: {item.matchedStudent.studentNumber})
                            </span>
                          </div>
                        )}
                        {item.status === 'unmatched' && (
                          <div className="flex items-center space-x-1 text-amber-700 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{item.errorMessage}</span>
                          </div>
                        )}
                        {item.status === 'conflict' && (
                          <div className="flex items-center space-x-1 text-rose-700 font-bold">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>{item.errorMessage}</span>
                          </div>
                        )}
                        {(item.status === 'unsupported_format' || item.status === 'invalid_name') && (
                          <div className="flex items-center space-x-1 text-slate-600 font-semibold">
                            <FileQuestion className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{item.errorMessage}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {item.uploadStatus === 'uploading' && (
                      <span className="text-[11px] font-bold text-indigo-600 flex items-center space-x-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>上傳中</span>
                      </span>
                    )}
                    {item.uploadStatus === 'success' && (
                      <span className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>完成</span>
                      </span>
                    )}
                    {item.uploadStatus === 'failed' && (
                      <span
                        className="text-[11px] font-bold text-rose-600 flex items-center space-x-1"
                        title={item.uploadError}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>失敗</span>
                      </span>
                    )}
                    {!isUploading && !item.uploadStatus && (
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                        title="自本次匯入清單中移除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
          <div className="text-slate-500">
            {matchedCount > 0 ? (
              <span>
                準備匯入 <strong>{matchedCount} 位學生</strong> 的照片
              </span>
            ) : (
              <span>請選取符合學號命名規則的照片檔</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
            >
              {uploadSummary ? '完成關閉' : '取消'}
            </button>
            <button
              type="button"
              disabled={isUploading || matchedCount === 0}
              onClick={handleStartUpload}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50 flex items-center space-x-1.5 transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>上傳處理中...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>確認匯入匹配照片 ({matchedCount} 張)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

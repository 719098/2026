import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  Trash2, 
  Image as ImageIcon, 
  Loader2, 
  Check, 
  AlertCircle,
  FileText,
  ExternalLink
} from 'lucide-react';
import { Student, StudentPeriodAttendance } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { 
  uploadAttendanceEvidenceImage, 
  validateEvidenceFile 
} from '../lib/storageService';

interface StudentRemarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  sessionId: string;
  courseName: string;
  className: string;
  currentAttendance: StudentPeriodAttendance;
  onSave: (updatedRemarks: string, evidenceImagePath?: string, evidenceImageUrl?: string) => void;
  isReadOnly?: boolean;
}

export const StudentRemarkModal: React.FC<StudentRemarkModalProps> = ({
  isOpen,
  onClose,
  student,
  sessionId,
  courseName,
  className,
  currentAttendance,
  onSave,
  isReadOnly = false,
}) => {
  if (!isOpen) return null;

  const [remarks, setRemarks] = useState<string>(currentAttendance.remarks || '');
  const [evidenceImagePath, setEvidenceImagePath] = useState<string | undefined>(currentAttendance.evidenceImagePath);
  const [evidenceImageUrl, setEvidenceImageUrl] = useState<string | undefined>(currentAttendance.evidenceImageUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(currentAttendance.evidenceImageUrl || null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateEvidenceFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || '佐證照片格式不符');
      e.target.value = '';
      return;
    }

    setUploadError(null);
    setSelectedFile(file);
    const previewUrl = URL.createObjectURL(file);
    setFilePreview(previewUrl);
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setEvidenceImagePath(undefined);
    setEvidenceImageUrl(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmSave = async () => {
    setUploadError(null);

    // If there is a new file to upload
    if (selectedFile) {
      setIsUploading(true);
      try {
        const result = await uploadAttendanceEvidenceImage(sessionId, student.id, selectedFile);
        if (!result.success || !result.storagePath) {
          setUploadError(result.error || '照片上傳失敗，請稍後再試');
          setIsUploading(false);
          return;
        }

        onSave(remarks.trim(), result.storagePath, result.signedUrl);
        onClose();
      } catch (err: any) {
        setUploadError(err.message || '照片上傳異常');
        setIsUploading(false);
        return;
      }
    } else {
      // No new file: preserve existing path/URL or removed state
      onSave(remarks.trim(), evidenceImagePath, evidenceImageUrl);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <StudentAvatar 
              avatarUrl={student.avatarUrl} 
              name={student.name} 
              sizeClassName="w-11 h-11" 
            />
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">{student.name}</h3>
                <span className="text-xs text-slate-500 font-mono">({student.studentNumber})</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {className} • {courseName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <div className="mt-5 space-y-4">
          {/* Remark Text Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
              <FileText className="w-4 h-4 text-teal-600" />
              <span>點名備註說明</span>
            </label>
            <textarea
              disabled={isReadOnly}
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="請輸入點名特別事由（例如：發燒就醫請假、事假外出、晚到30分鐘、已出示診斷證明等）..."
              className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          {/* Evidence Image Upload / Preview */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <ImageIcon className="w-4 h-4 text-teal-600" />
                <span>佐證照片 / 假單附件 (支援 JPG / PNG / WebP，上限 5MB)</span>
              </span>
            </label>

            {/* Error Message */}
            {uploadError && (
              <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{uploadError}</span>
              </div>
            )}

            {filePreview ? (
              <div className="relative border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <img
                    src={filePreview}
                    alt="佐證照片預覽"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-300 shrink-0"
                  />
                  <div className="text-xs text-slate-600 truncate">
                    <p className="font-semibold text-slate-800">
                      {selectedFile ? selectedFile.name : '已上傳佐證照片'}
                    </p>
                    {selectedFile && (
                      <p className="text-[11px] text-slate-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                    {evidenceImageUrl && !selectedFile && (
                      <a
                        href={evidenceImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-600 hover:text-teal-800 inline-flex items-center space-x-1 text-[11px] mt-0.5"
                      >
                        <span>檢視大圖</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                    title="移除照片"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              !isReadOnly && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-teal-50/40"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-700">點擊或拖曳上傳佐證照片</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    如：診斷證明書、請假單截圖、車票票根等證明
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            取消
          </button>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={isUploading}
              className="inline-flex items-center space-x-1.5 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>照片上傳與儲存中...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>儲存備註與附件</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

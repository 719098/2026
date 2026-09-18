import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Loader2, 
  Check, 
  RefreshCw,
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, EnrollmentStatus } from '../../types';
import { supabase } from '../../lib/supabase';
import { createStudentInSupabase } from '../../lib/studentService';

interface BatchImportStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingStudents: Student[];
  onImportComplete: () => Promise<void> | void;
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface ParsedStudentRow {
  rowNum: number;
  studentNumber: string;
  name: string;
  englishName: string;
  gender: 'M' | 'F';
  nationality: string;
  nationalityCode?: string;
  passportNumber?: string;
  birthday?: string;
  email?: string;
  phone?: string;
  status: 'valid' | 'duplicate_existing' | 'duplicate_in_file' | 'missing_required' | 'invalid_format';
  errors: string[];
}

export const BatchImportStudentModal: React.FC<BatchImportStudentModalProps> = ({
  isOpen,
  onClose,
  existingStudents,
  onImportComplete,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Template Download Handler
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        '學號': 'STU2026101',
        '姓名': '佐藤健',
        '英文姓名': 'Ken Sato',
        '性別(男/女/M/F)': '男',
        '國籍': '日本',
        '護照號碼': 'TK12345678',
        '生日(YYYY-MM-DD)': '2004-05-12',
        '電子信箱': 'ken.sato@example.com',
        '聯絡電話': '0912-345-678',
      },
      {
        '學號': 'STU2026102',
        '姓名': '金敏智',
        '英文姓名': 'Minji Kim',
        '性別(男/女/M/F)': '女',
        '國籍': '韓國',
        '護照號碼': 'M98765432',
        '生日(YYYY-MM-DD)': '2005-09-20',
        '電子信箱': 'minji.kim@example.com',
        '聯絡電話': '0988-765-432',
      },
      {
        '學號': 'STU2026103',
        '姓名': '阮文勇',
        '英文姓名': 'Van Dung Nguyen',
        '性別(男/女/M/F)': 'M',
        '國籍': '越南',
        '護照號碼': 'B45678912',
        '生日(YYYY-MM-DD)': '2003-11-03',
        '電子信箱': 'dung.nguyen@example.com',
        '聯絡電話': '0955-123-456',
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '學生匯入範本');

    XLSX.writeFile(workbook, '學生批量匯入範本_範例.xlsx');
    onShowToast('學生匯入範本下載完成', 'info');
  };

  // Helper to normalize column names
  const normalizeKey = (key: string): string => {
    const clean = key.trim().toLowerCase();
    if (clean.includes('學號') || clean === 'stno' || clean === 'student_number') return 'studentNumber';
    if (clean === '姓名' || clean === 'name' || clean === '學生姓名') return 'name';
    if (clean.includes('英文') || clean === 'ename' || clean === 'english_name') return 'englishName';
    if (clean.includes('性別') || clean === 'sex' || clean === 'gender') return 'gender';
    if (clean.includes('國籍') || clean === 'nation' || clean === 'nationality') return 'nationality';
    if (clean.includes('護照') || clean === 'idno' || clean === 'passport') return 'passportNumber';
    if (clean.includes('生日') || clean === 'birthday' || clean === 'birth_date') return 'birthday';
    if (clean.includes('信箱') || clean.includes('email') || clean === 'mail') return 'email';
    if (clean.includes('電話') || clean.includes('手機') || clean === 'phone' || clean === 'mobile') return 'phone';
    return clean;
  };

  // Parse File (CSV or XLSX)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('試算表檔案中沒有任何工作表');
      }

      const worksheet = workbook.Sheets[sheetName];
      const rawData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawData.length === 0) {
        throw new Error('試算表中未包含任何資料列');
      }

      // Existing student numbers & passports set
      const existingStnoSet = new Set(existingStudents.map((s) => s.studentNumber?.trim().toLowerCase()).filter(Boolean));
      const fileStnoSet = new Set<string>();

      const rows: ParsedStudentRow[] = [];

      rawData.forEach((item, index) => {
        const rowNum = index + 2; // header is row 1
        const normalized: Record<string, any> = {};
        Object.keys(item).forEach((k) => {
          normalized[normalizeKey(k)] = String(item[k]).trim();
        });

        const stno = normalized.studentNumber || '';
        const name = normalized.name || '';
        const englishName = normalized.englishName || '';
        const rawGender = normalized.gender || '';
        const nationality = normalized.nationality || '未指定';
        const passportNumber = normalized.passportNumber || undefined;
        const birthday = normalized.birthday || undefined;
        const email = normalized.email || undefined;
        const phone = normalized.phone || undefined;

        // Gender parse
        let gender: 'M' | 'F' = 'M';
        const gUpper = rawGender.toUpperCase();
        if (gUpper === '女' || gUpper === 'F' || gUpper === 'FEMALE') {
          gender = 'F';
        }

        const errors: string[] = [];

        // Validation
        if (!stno) {
          errors.push('缺少學號');
        }
        if (!name) {
          errors.push('缺少中文姓名');
        }

        let status: ParsedStudentRow['status'] = 'valid';

        if (errors.length > 0) {
          status = 'missing_required';
        } else if (existingStnoSet.has(stno.toLowerCase())) {
          status = 'duplicate_existing';
          errors.push(`學號「${stno}」已存在於資料庫中`);
        } else if (fileStnoSet.has(stno.toLowerCase())) {
          status = 'duplicate_in_file';
          errors.push(`學號「${stno}」在匯入檔案中重複出現`);
        } else {
          fileStnoSet.add(stno.toLowerCase());
        }

        rows.push({
          rowNum,
          studentNumber: stno,
          name,
          englishName: englishName || name,
          gender,
          nationality,
          passportNumber,
          birthday,
          email,
          phone,
          status,
          errors,
        });
      });

      setParsedRows(rows);
    } catch (err: any) {
      console.error('[BatchImport] Parsing failed:', err);
      setParseError(err.message || '檔案解析失敗，請確認是否為標準 Excel (.xlsx) 或 CSV 格式');
      setParsedRows([]);
    } finally {
      setIsParsing(false);
    }
  };

  const validRows = parsedRows.filter((r) => r.status === 'valid');
  const invalidRows = parsedRows.filter((r) => r.status !== 'valid');

  // Confirm Import to Supabase
  const handleConfirmImport = async () => {
    if (validRows.length === 0) {
      onShowToast('沒有可匯入的有效學生資料', 'warning');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setImportProgress({ current: i + 1, total: validRows.length });

      const newStudentPayload: Omit<Student, 'id'> = {
        studentNumber: row.studentNumber,
        stno: row.studentNumber,
        name: row.name,
        englishName: row.englishName,
        ename: row.englishName,
        gender: row.gender,
        sex: row.gender,
        nationality: row.nationality,
        nation: row.nationality,
        passportNumber: row.passportNumber,
        idno: row.passportNumber,
        birthday: row.birthday,
        email: row.email,
        phone: row.phone,
        mobilePhone: row.phone,
        className: '', // Explicit requirement: do not auto-assign classes
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        nationalityCode: row.nationalityCode || 'TW',
        overallAttendanceRate: 100,
        totalAbsenceHours: 0,
        totalLeaveHours: 0,
        enrollmentStatus: 'active',
        enrollmentHistory: [
          {
            id: `h-import-${Date.now()}-${i}`,
            date: new Date().toISOString().split('T')[0],
            action: 'admitted',
            actionName: '新生註冊入學',
            studentNumber: row.studentNumber,
            note: '批次檔案匯入建立學籍（尚未分班）。',
            operator: '教務行政組 (Excel/CSV 批量匯入)',
          }
        ],
        grades: {
          listeningSpeaking: 0,
          readingWriting: 0,
          dailyPerformance: 0,
        },
      };

      try {
        const { error } = await createStudentInSupabase(newStudentPayload, []);
        if (error) {
          console.error(`[BatchImport] Error creating student ${row.studentNumber}:`, error);
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`[BatchImport] Exception creating student ${row.studentNumber}:`, err);
        failCount++;
      }
    }

    setIsImporting(false);
    setImportProgress(null);

    if (successCount > 0) {
      onShowToast(`🎉 成功匯入 ${successCount} 位學員資料至 Supabase 資料庫！`, 'success');
      await onImportComplete();
      onClose();
    } else {
      onShowToast(`❌ 匯入失敗：共 ${failCount} 筆資料寫入失敗，請檢查資料庫連線或權限`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl border border-teal-100">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">批量匯入學生名單 (Excel / CSV)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                行政端一次性批次建立新學員檔案，支援即時驗證、學號重複檢查與欄位對應（不自動分班）。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload & Template Bar */}
        <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing || isImporting}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>{selectedFile ? '更換試算表檔案' : '選擇 Excel / CSV 檔案'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            {selectedFile && (
              <span className="text-xs font-mono font-medium text-slate-700 truncate max-w-xs">
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors shrink-0"
          >
            <Download className="w-4 h-4 text-teal-600" />
            <span>下載標準匯入範本 (.xlsx)</span>
          </button>
        </div>

        {/* Notice Info Box */}
        <div className="mt-3 p-3 bg-teal-50/60 border border-teal-200/80 rounded-xl text-xs text-teal-900 flex items-start space-x-2">
          <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-[11px] leading-relaxed">
            <span className="font-bold">格式要求：</span>
            <span>「學號」與「姓名」為必填項。支援國籍、英文名、性別、護照號碼、生日、Email 與電話。所有新匯入學生將初始為「在學中（尚未分班）」，後續可至學員管理進行編班。</span>
          </div>
        </div>

        {/* Parse Error Alert */}
        {parseError && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Parsing Indicator */}
        {isParsing && (
          <div className="py-12 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            <span>檔案讀取與資料驗證中...</span>
          </div>
        )}

        {/* Preview Table */}
        {!isParsing && parsedRows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-800">資料預覽與檢核：</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono">
                  可匯入 {validRows.length} 筆
                </span>
                {invalidRows.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold font-mono">
                    異常 {invalidRows.length} 筆 (將自動跳過)
                  </span>
                )}
              </div>
              <span className="text-slate-400 text-[11px]">共讀取 {parsedRows.length} 列資料</span>
            </div>

            <div className="border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">列號</th>
                    <th className="py-2.5 px-3">檢核狀態</th>
                    <th className="py-2.5 px-3">學號</th>
                    <th className="py-2.5 px-3">中文姓名</th>
                    <th className="py-2.5 px-3">英文姓名</th>
                    <th className="py-2.5 px-3">性別</th>
                    <th className="py-2.5 px-3">國籍</th>
                    <th className="py-2.5 px-3">護照號碼</th>
                    <th className="py-2.5 px-3">問題說明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.map((row) => (
                    <tr
                      key={row.rowNum}
                      className={row.status === 'valid' ? 'hover:bg-slate-50' : 'bg-rose-50/40'}
                    >
                      <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{row.rowNum}</td>
                      <td className="py-2 px-3">
                        {row.status === 'valid' ? (
                          <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Check className="w-3 h-3 mr-0.5 text-emerald-600" />
                            通過
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <AlertTriangle className="w-3 h-3 mr-0.5 text-rose-600" />
                            無效
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{row.studentNumber || '—'}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{row.name || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{row.englishName || '—'}</td>
                      <td className="py-2 px-3">{row.gender === 'F' ? '女' : '男'}</td>
                      <td className="py-2 px-3">{row.nationality}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{row.passportNumber || '—'}</td>
                      <td className="py-2 px-3 text-rose-600 text-[11px]">
                        {row.errors.length > 0 ? row.errors.join('；') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Progress Bar during Import */}
        {isImporting && importProgress && (
          <div className="mt-4 p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-teal-900">
              <span className="flex items-center space-x-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                <span>正在寫入 Supabase 資料庫...</span>
              </span>
              <span className="font-mono">
                {importProgress.current} / {importProgress.total} 筆
              </span>
            </div>
            <div className="w-full bg-teal-200 rounded-full h-2">
              <div
                className="bg-teal-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {validRows.length > 0 ? `已準備就緒，點擊確認即可寫入 ${validRows.length} 位學員` : '請先上傳包含學生名單之檔案'}
          </span>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting || validRows.length === 0}
              className="inline-flex items-center space-x-1.5 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>批次寫入中...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>確認匯入 ({validRows.length} 筆)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Edit2, 
  CheckCircle2, 
  RefreshCw,
  FolderPlus,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  X
} from 'lucide-react';
import { ClassEntity } from '../../types';
import { 
  MaterialEntity, 
  fetchMaterialsFromSupabase,
  fetchMaterialByIdFromSupabase,
  createMaterialInSupabase,
  updateMaterialInSupabase
} from '../../lib/materialService';

interface AdminMaterialManagementViewProps {
  classes?: ClassEntity[];
  materials?: MaterialEntity[];
  onRefreshMaterials?: () => void;
}

export const AdminMaterialManagementView: React.FC<AdminMaterialManagementViewProps> = ({
  onRefreshMaterials,
}) => {
  const [materials, setMaterials] = useState<MaterialEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchErrorMsg, setFetchErrorMsg] = useState<string | null>(null);

  console.log('[MATERIAL DEBUG] render materials.length =', materials.length);
  console.log('[MATERIAL DEBUG] materials =', materials);

  // New Material Modal
  const [isNewMatModalOpen, setIsNewMatModalOpen] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [newMatCode, setNewMatCode] = useState('');
  const [newMatDesc, setNewMatDesc] = useState('');

  // Edit Material Modal
  const [editingMat, setEditingMat] = useState<MaterialEntity | null>(null);
  const [fetchingMatId, setFetchingMatId] = useState<string | null>(null);
  const [editMatName, setEditMatName] = useState('');
  const [editMatCode, setEditMatCode] = useState('');
  const [editMatDesc, setEditMatDesc] = useState('');
  const [editMatActive, setEditMatActive] = useState(true);

  const handleStartEditMaterial = async (materialId: string, fallbackMat?: MaterialEntity) => {
    setFetchingMatId(materialId);
    setStatusMsg(null);
    try {
      // 點擊教材 -> 使用該教材唯一 id 查詢 materials -> 取得該筆教材 -> 開啟編輯表單
      const { data, error } = await fetchMaterialByIdFromSupabase(materialId);
      const target = data || fallbackMat;
      if (!target) {
        setStatusMsg({ type: 'error', text: `取得教材資料失敗：${error?.message || '找不到該教材資料'}` });
        return;
      }
      setEditingMat(target);
      setEditMatName(target.name || '');
      setEditMatCode(target.code || '');
      setEditMatDesc(target.description || '');
      setEditMatActive(target.isActive !== false);
    } catch (err: any) {
      console.error('handleStartEditMaterial exception:', err);
      setStatusMsg({ type: 'error', text: `讀取教材失敗：${err.message || String(err)}` });
    } finally {
      setFetchingMatId(null);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    setLoading(true);
    setStatusMsg(null);
    setFetchErrorMsg(null);
    const { data, error } = await fetchMaterialsFromSupabase();
    console.log('[MATERIAL DEBUG] fetch result count =', data?.length);
    console.log('[MATERIAL DEBUG] fetch result =', data);

    if (error) {
      const errMsg = error.message || JSON.stringify(error);
      console.error('Final materials count (on error): 0', error);
      setStatusMsg({ type: 'error', text: `載入教材資料庫失敗：${errMsg}` });
      setFetchErrorMsg(errMsg);
      setMaterials([]);
    } else {
      console.log('Final materials count:', data ? data.length : 0);
      setMaterials(data || []);
    }
    setLoading(false);
    if (onRefreshMaterials) onRefreshMaterials();
  };

  const handleCreateMasterMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) return;
    setSaving(true);
    setStatusMsg(null);

    const { error } = await createMaterialInSupabase(newMatName, newMatDesc, newMatCode);
    if (error) {
      setStatusMsg({ type: 'error', text: `新增教材失敗：${error.message || '未知錯誤'}` });
    } else {
      setStatusMsg({ type: 'success', text: `成功新增教材「${newMatName}」！` });
      setNewMatName('');
      setNewMatCode('');
      setNewMatDesc('');
      setIsNewMatModalOpen(false);
      await loadMaterials();
    }
    setSaving(false);
  };

  const handleEditMasterMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMat || !editMatName.trim()) return;
    setSaving(true);
    setStatusMsg(null);

    console.log('[AdminMaterialManagementView] updating materialId (UUID):', editingMat.id, {
      name: editMatName,
      code: editMatCode,
      description: editMatDesc,
      isActive: editMatActive,
    });

    const { error } = await updateMaterialInSupabase(editingMat.id, {
      name: editMatName,
      code: editMatCode,
      description: editMatDesc,
      isActive: editMatActive,
    });

    if (error) {
      setStatusMsg({ type: 'error', text: `編輯教材失敗：${error.message || '未知錯誤'}` });
    } else {
      setStatusMsg({ type: 'success', text: `成功更新教材「${editMatName}」！` });
      setEditingMat(null);
      await loadMaterials();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-teal-600/60 text-teal-100 rounded-full text-xs font-semibold tracking-wider uppercase">
              靜宜華語中心教務系統
            </span>
            <span className="text-teal-200 text-xs">· 教材主資料</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">教材主資料管理</h1>
          <p className="text-teal-100 text-sm mt-1 max-w-2xl">
            維護華語中心核心主教材清單（例如：漢語拼音、當代中文課程第一至四冊、當代社會剪影系列等）。班級使用教材請於「開設班級管理」頁面進行指派。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMaterials}
            disabled={loading}
            className="p-2.5 bg-teal-700/60 hover:bg-teal-600/80 rounded-xl text-teal-100 transition-colors flex items-center gap-1.5 text-xs font-medium"
            title="重新整理教材資料"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>重新整理</span>
          </button>
          <button
            onClick={() => {
              setNewMatName('');
              setNewMatDesc('');
              setIsNewMatModalOpen(true);
            }}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>新增主教材</span>
          </button>
        </div>
      </div>

      {/* Status Alert Message */}
      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Master Materials Table / Card Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-bold text-slate-800">中心主教材庫 ({materials.length} 本)</h2>
          </div>
          <span className="text-xs text-slate-500">
            資料庫同步狀態：共 {materials.length} 本教材
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>載入 Supabase 教材主資料中...</span>
          </div>
        ) : fetchErrorMsg ? (
          <div className="py-12 text-center text-rose-600 text-xs flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-6 h-6 text-rose-500" />
            <span className="font-bold">載入 Supabase 教材失敗</span>
            <span className="text-slate-500 font-mono text-[11px] max-w-md bg-rose-50 p-3 rounded-xl border border-rose-200">{fetchErrorMsg}</span>
            <button
              onClick={loadMaterials}
              className="mt-2 px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition-colors text-xs"
            >
              重試載入
            </button>
          </div>
        ) : materials.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            尚無教材資料。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {materials.map((mat) => (
              <div
                key={mat.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-teal-300 transition-all shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-teal-100 text-teal-800 font-bold rounded-lg text-xs">
                        {mat.name}
                      </span>
                      {mat.code && (
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-mono text-[10px] rounded-md font-semibold">
                          {mat.code}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                        mat.isActive !== false
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                          : 'text-slate-500 bg-slate-100 border-slate-200'
                      }`}
                    >
                      {mat.isActive !== false ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed min-h-[36px]">
                    {mat.description || '靜宜大學華語文教學中心標準研習教材'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]" title={mat.id}>
                    ID: {mat.id.slice(0, 8)}...
                  </span>
                  <button
                    onClick={() => handleStartEditMaterial(mat.id, mat)}
                    disabled={fetchingMatId === mat.id}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-teal-500 hover:text-teal-700 rounded-lg text-slate-700 font-bold transition-colors flex items-center gap-1 shadow-2xs disabled:opacity-50"
                  >
                    <Edit2 className={`w-3.5 h-3.5 ${fetchingMatId === mat.id ? 'animate-spin' : ''}`} />
                    <span>{fetchingMatId === mat.id ? '載入中...' : '編輯'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Material Modal */}
      {isNewMatModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-teal-600" />
                <span>新增主教材</span>
              </h2>
              <button
                onClick={() => setIsNewMatModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMasterMaterial} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  教材名稱 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：當代中文課程5"
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">教材代碼 (Code)</label>
                <input
                  type="text"
                  placeholder="例如：MC1, CHN-101"
                  value={newMatCode}
                  onChange={(e) => setNewMatCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">教材說明 / 簡介</label>
                <textarea
                  rows={3}
                  placeholder="請輸入教材簡介、冊數說明..."
                  value={newMatDesc}
                  onChange={(e) => setNewMatDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setIsNewMatModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {saving ? '儲存中...' : '確認新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Material Modal */}
      {editingMat && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-teal-600" />
                <span>編輯教材：{editingMat.name}</span>
              </h2>
              <button onClick={() => setEditingMat(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditMasterMaterial} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  教材名稱 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editMatName}
                  onChange={(e) => setEditMatName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">教材代碼 (Code)</label>
                <input
                  type="text"
                  placeholder="例如：MC1"
                  value={editMatCode}
                  onChange={(e) => setEditMatCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">教材說明 / 簡介</label>
                <textarea
                  rows={3}
                  value={editMatDesc}
                  onChange={(e) => setEditMatDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editMatActiveCheck"
                  checked={editMatActive}
                  onChange={(e) => setEditMatActive(e.target.checked)}
                  className="w-4 h-4 text-teal-600 rounded-md border-slate-300 focus:ring-teal-500"
                />
                <label htmlFor="editMatActiveCheck" className="font-bold text-slate-700 cursor-pointer">
                  啟用此教材 (Is Active)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingMat(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {saving ? '更新中...' : '儲存變更'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

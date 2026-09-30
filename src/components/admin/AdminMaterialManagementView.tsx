import React, { useState, useEffect, useMemo } from 'react';
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
  Trash2,
  CheckSquare,
  Square,
  Search,
  Layers,
  AlertTriangle,
  X
} from 'lucide-react';
import { ClassEntity } from '../../types';
import { 
  MaterialEntity, 
  fetchMaterialsFromSupabase,
  fetchMaterialByIdFromSupabase,
  createMaterialInSupabase,
  updateMaterialInSupabase,
  deleteMaterialInSupabase,
  batchUpdateMaterialsStatus,
  batchDeleteMaterials,
  checkMaterialUsageInClasses
} from '../../lib/materialService';
import { InfoTooltip } from '../common/InfoTooltip';
import { BatchActionBar, BatchActionItem } from '../common/BatchActionBar';

interface AdminMaterialManagementViewProps {
  classes?: ClassEntity[];
  materials?: MaterialEntity[];
  onRefreshMaterials?: () => void;
}

export const AdminMaterialManagementView: React.FC<AdminMaterialManagementViewProps> = ({
  classes = [],
  onRefreshMaterials,
}) => {
  const [materials, setMaterials] = useState<MaterialEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchErrorMsg, setFetchErrorMsg] = useState<string | null>(null);

  // Search and status filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Batch Selection
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

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

  // Single Delete Confirmation Modal
  const [deletingMaterial, setDeletingMaterial] = useState<MaterialEntity | null>(null);
  const [isCheckingUsage, setIsCheckingUsage] = useState(false);
  const [materialUsage, setMaterialUsage] = useState<{ isUsed: boolean; classCount: number; classNames: string[] } | null>(null);

  // Batch Delete Confirmation Modal
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  const handleStartEditMaterial = async (materialId: string, fallbackMat?: MaterialEntity) => {
    setFetchingMatId(materialId);
    setStatusMsg(null);
    try {
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

    if (error) {
      const errMsg = error.message || JSON.stringify(error);
      setStatusMsg({ type: 'error', text: `載入教材資料庫失敗：${errMsg}` });
      setFetchErrorMsg(errMsg);
      setMaterials([]);
    } else {
      setMaterials(data || []);
    }
    setLoading(false);
    if (onRefreshMaterials) onRefreshMaterials();
  };

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((mat) => {
      const matchesSearch =
        mat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (mat.code && mat.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (mat.description && mat.description.toLowerCase().includes(searchTerm.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === 'ACTIVE') matchesStatus = mat.isActive !== false;
      if (statusFilter === 'INACTIVE') matchesStatus = mat.isActive === false;

      return matchesSearch && matchesStatus;
    });
  }, [materials, searchTerm, statusFilter]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllCurrentPage = () => {
    if (filteredMaterials.length === 0) return;
    const allSelected = filteredMaterials.every((m) => selectedMaterialIds.has(m.id));
    if (allSelected) {
      setSelectedMaterialIds((prev) => {
        const next = new Set(prev);
        filteredMaterials.forEach((m) => next.delete(m.id));
        return next;
      });
    } else {
      setSelectedMaterialIds((prev) => {
        const next = new Set(prev);
        filteredMaterials.forEach((m) => next.add(m.id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedMaterialIds(new Set());
  };

  // Batch Activate / Deactivate
  const handleBatchToggleStatus = async (isActive: boolean) => {
    const ids: string[] = Array.from(selectedMaterialIds);
    if (ids.length === 0) return;
    setIsBatchProcessing(true);
    setStatusMsg(null);
    try {
      const res = await batchUpdateMaterialsStatus(ids, isActive);
      if (!res.success || res.error) {
        setStatusMsg({ type: 'error', text: `批量變更狀態失敗：${res.error?.message || '未知錯誤'}` });
      } else {
        setStatusMsg({
          type: 'success',
          text: `成功將 ${res.updatedCount} 本教材設定為【${isActive ? '啟用中' : '已停用'}】！`,
        });
        setSelectedMaterialIds(new Set());
        await loadMaterials();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `批量變更狀態失敗：${err.message || String(err)}` });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Batch Delete Execution
  const handleExecuteBatchDelete = async () => {
    const ids: string[] = Array.from(selectedMaterialIds);
    if (ids.length === 0) return;
    setIsBatchProcessing(true);
    setStatusMsg(null);
    try {
      const materialMap = new Map<string, string>();
      materials.forEach((m) => materialMap.set(m.id, m.name));

      const res = await batchDeleteMaterials(ids, materialMap);
      setIsBatchDeleteModalOpen(false);

      if (!res.success || res.error) {
        setStatusMsg({ type: 'error', text: `批量刪除教材失敗：${res.error?.message || '未知錯誤'}` });
      } else {
        let msg = `已安全刪除 ${res.deletedCount} 本教材。`;
        if (res.blockedCount > 0) {
          msg += ` 注意：另有 ${res.blockedCount} 本教材因已被班級使用，已自動保護未刪除（避免損壞資料關聯）。`;
        }
        setStatusMsg({
          type: res.deletedCount > 0 ? 'success' : 'error',
          text: msg,
        });
        setSelectedMaterialIds(new Set());
        await loadMaterials();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `批量刪除發生錯誤：${err.message || String(err)}` });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Single delete initiation
  const handleInitiateSingleDelete = async (mat: MaterialEntity) => {
    setDeletingMaterial(mat);
    setIsCheckingUsage(true);
    setMaterialUsage(null);
    try {
      const usage = await checkMaterialUsageInClasses(mat.id);
      setMaterialUsage(usage);
    } catch (err) {
      console.error('Error checking usage:', err);
    } finally {
      setIsCheckingUsage(false);
    }
  };

  // Single delete confirmation
  const handleConfirmSingleDelete = async () => {
    if (!deletingMaterial) return;
    setSaving(true);
    try {
      const res = await deleteMaterialInSupabase(deletingMaterial.id);
      if (!res.success || res.error) {
        setStatusMsg({ type: 'error', text: res.error?.message || '刪除教材失敗' });
      } else {
        setStatusMsg({ type: 'success', text: `已成功刪除教材「${deletingMaterial.name}」！` });
        setDeletingMaterial(null);
        setSelectedMaterialIds((prev) => {
          const next = new Set(prev);
          next.delete(deletingMaterial.id);
          return next;
        });
        await loadMaterials();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `刪除失敗：${err.message || String(err)}` });
    } finally {
      setSaving(false);
    }
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

  // Batch Action Bar Configuration
  const batchActions: BatchActionItem[] = [
    {
      key: 'activate',
      label: '批量啟用',
      icon: <ToggleRight className="w-3.5 h-3.5 text-emerald-600" />,
      onClick: () => handleBatchToggleStatus(true),
      disabled: isBatchProcessing,
    },
    {
      key: 'deactivate',
      label: '批量停用',
      icon: <ToggleLeft className="w-3.5 h-3.5 text-slate-500" />,
      onClick: () => handleBatchToggleStatus(false),
      disabled: isBatchProcessing,
    },
    {
      key: 'delete',
      label: '批量刪除',
      icon: <Trash2 className="w-3.5 h-3.5 text-rose-600" />,
      variant: 'danger',
      onClick: () => setIsBatchDeleteModalOpen(true),
      disabled: isBatchProcessing,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <h1 className="text-lg font-bold text-slate-800">教材主資料管理</h1>
            <InfoTooltip
              title="教材主資料管理"
              content="維護華語中心核心主教材清單（例如：漢語拼音、當代中文課程各冊、實用視聽華語等）。支援多選批量啟用、批量停用與安全關聯刪除。班級使用教材請於「開設班級管理」頁面進行指派綁定。"
            />
            <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-teal-50 text-teal-700 border border-teal-200">
              共 {materials.length} 本教材
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMaterials}
            disabled={loading}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="重新整理教材資料"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>重新整理</span>
          </button>
          <button
            onClick={() => {
              setNewMatName('');
              setNewMatDesc('');
              setNewMatCode('');
              setIsNewMatModalOpen(true);
            }}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>新增主教材</span>
          </button>
        </div>
      </div>

      {/* Status Alert Message */}
      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-2xs ${
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

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋教材名稱 / 代碼 / 簡介..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          {(
            [
              { key: 'ALL', label: `全部教材 (${materials.length})` },
              { key: 'ACTIVE', label: `啟用中 (${materials.filter((m) => m.isActive !== false).length})` },
              { key: 'INACTIVE', label: `已停用 (${materials.filter((m) => m.isActive === false).length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === tab.key
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batch Actions Bar */}
      <BatchActionBar
        selectedCount={selectedMaterialIds.size}
        totalCount={filteredMaterials.length}
        onClearSelection={handleClearSelection}
        onSelectAllCurrentPage={handleSelectAllCurrentPage}
        isAllSelected={filteredMaterials.length > 0 && filteredMaterials.every((m) => selectedMaterialIds.has(m.id))}
        actions={batchActions}
      />

      {/* Master Materials Card Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-bold text-slate-800">
              中心教材清單 ({filteredMaterials.length} 本)
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              onClick={handleSelectAllCurrentPage}
              className="text-teal-700 hover:text-teal-800 font-bold"
            >
              {filteredMaterials.length > 0 && filteredMaterials.every((m) => selectedMaterialIds.has(m.id))
                ? '取消全選'
                : '全選目前教材'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
            <span>載入教材主資料中...</span>
          </div>
        ) : fetchErrorMsg ? (
          <div className="py-12 text-center text-rose-600 text-xs flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-6 h-6 text-rose-500" />
            <span className="font-bold">載入教材資料失敗</span>
            <span className="text-slate-500 font-mono text-[11px] max-w-md bg-rose-50 p-3 rounded-xl border border-rose-200">{fetchErrorMsg}</span>
            <button
              onClick={loadMaterials}
              className="mt-2 px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition-colors text-xs"
            >
              重試載入
            </button>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            {searchTerm ? '找不到符合關鍵字的教材' : '尚無教材資料。'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMaterials.map((mat) => {
              const isSelected = selectedMaterialIds.has(mat.id);
              return (
                <div
                  key={mat.id}
                  className={`p-4 rounded-xl border transition-all shadow-2xs flex flex-col justify-between ${
                    isSelected
                      ? 'border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/20'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-teal-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(mat.id)}
                          className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500 cursor-pointer"
                        />
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
                    <p className="text-xs text-slate-600 leading-relaxed min-h-[36px] ml-6">
                      {mat.description || '靜宜大學華語文教學中心標準研習教材'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]" title={mat.id}>
                      ID: {mat.id.slice(0, 8)}...
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleStartEditMaterial(mat.id, mat)}
                        disabled={fetchingMatId === mat.id}
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:border-teal-500 hover:text-teal-700 rounded-lg text-slate-700 font-bold transition-colors flex items-center gap-1 shadow-2xs text-[11px]"
                      >
                        <Edit2 className={`w-3 h-3 ${fetchingMatId === mat.id ? 'animate-spin' : ''}`} />
                        <span>編輯</span>
                      </button>
                      <button
                        onClick={() => handleInitiateSingleDelete(mat)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="刪除此教材"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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

      {/* Single Delete Confirmation Modal */}
      {deletingMaterial && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">確認刪除教材</h3>
                  <p className="text-xs text-slate-500">「{deletingMaterial.name}」</p>
                </div>
              </div>
              <button
                onClick={() => setDeletingMaterial(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isCheckingUsage ? (
              <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                <span>正在檢查班級關聯性...</span>
              </div>
            ) : materialUsage?.isUsed ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2 text-amber-900">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>無法直接刪除（班級關聯保護）</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  該教材目前已被 <strong>{materialUsage.classCount} 個班級</strong>（例如：{materialUsage.classNames.join('、')}）關聯使用。
                </p>
                <p className="text-[11px] text-amber-700">
                  為避免破壞歷史排課與班級教材紀錄，禁止直接刪除。建議點擊「編輯」將狀態設為「停用」，或先至對應班級解除教材綁定。
                </p>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                此教材尚未被任何班級使用，可安全執行物理刪除。刪除後將無法復原。
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMaterial(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                取消
              </button>
              {materialUsage && !materialUsage.isUsed && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmSingleDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>確認刪除</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">批量刪除所選教材</h3>
                  <p className="text-xs text-slate-500">已選取 {selectedMaterialIds.size} 本教材</p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2 text-amber-900">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>關聯保護機制說明：</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                系統將逐筆自動驗證教材之班級使用狀態。<strong>若教材已指派給任何班級，系統將主動予以保留防護，絕不損壞班級歷史紀錄</strong>；僅有「無班級關聯」之教材才會被安全刪除。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isBatchProcessing}
                onClick={handleExecuteBatchDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isBatchProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>執行安全檢查並刪除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

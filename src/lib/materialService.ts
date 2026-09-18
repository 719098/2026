import { supabase } from './supabase';

export interface MaterialEntity {
  id: string;
  name: string;
  code?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClassMaterialEntity {
  id: string;
  classId: string;
  materialId: string;
  materialName: string;
  materialDescription?: string;
  lessonStart: string; // e.g. "1" or "11"
  lessonEnd: string;   // e.g. "10" or "15"
  displayOrder: number;
  formattedText: string; // e.g. "當代中文課程1 (第11-15課)"
}

export interface LevelMaterialRule {
  levelCode: string; // "101" | "102" | "201" | "202" | "301" | "302" | "303"
  levelName: string; // "101 (零起點 → A1)"
  targetAudience: string;
  materials: {
    materialName: string;
    lessonStart: string;
    lessonEnd: string;
    displayOrder: number;
  }[];
}

export const LEVEL_MATERIAL_RULES: LevelMaterialRule[] = [
  {
    levelCode: '101',
    levelName: '101 (零起點 → A1)',
    targetAudience: '零起點 → A1',
    materials: [
      { materialName: '漢語拼音', lessonStart: '', lessonEnd: '', displayOrder: 1 },
      { materialName: '當代中文課程1', lessonStart: '1', lessonEnd: '10', displayOrder: 2 },
    ],
  },
  {
    levelCode: '102',
    levelName: '102 (A1 → A2)',
    targetAudience: 'A1 → A2',
    materials: [
      { materialName: '當代中文課程1', lessonStart: '11', lessonEnd: '15', displayOrder: 1 },
      { materialName: '當代中文課程2', lessonStart: '1', lessonEnd: '5', displayOrder: 2 },
    ],
  },
  {
    levelCode: '201',
    levelName: '201 (A2 → B1)',
    targetAudience: 'A2 → B1',
    materials: [
      { materialName: '當代中文課程2', lessonStart: '6', lessonEnd: '15', displayOrder: 1 },
    ],
  },
  {
    levelCode: '202',
    levelName: '202 (B1 → B2)',
    targetAudience: 'B1 → B2',
    materials: [
      { materialName: '當代中文課程3', lessonStart: '1', lessonEnd: '8', displayOrder: 1 },
    ],
  },
  {
    levelCode: '301',
    levelName: '301 (B2 → C1)',
    targetAudience: 'B2 → C1',
    materials: [
      { materialName: '當代中文課程3', lessonStart: '9', lessonEnd: '12', displayOrder: 1 },
      { materialName: '當代中文課程4', lessonStart: '1', lessonEnd: '4', displayOrder: 2 },
    ],
  },
  {
    levelCode: '302',
    levelName: '302 (C1以上)',
    targetAudience: 'C1以上',
    materials: [
      { materialName: '當代中文課程4', lessonStart: '5', lessonEnd: '12', displayOrder: 1 },
    ],
  },
  {
    levelCode: '303',
    levelName: '303 (C1以上)',
    targetAudience: 'C1以上',
    materials: [
      { materialName: '當代社會剪影系列第三冊', lessonStart: '', lessonEnd: '', displayOrder: 1 },
    ],
  },
];

export function formatMaterialRange(materialName: string, lessonStart?: string, lessonEnd?: string): string {
  const start = lessonStart?.trim();
  const end = lessonEnd?.trim();
  if (start && end) {
    return `${materialName}（第 ${start} - ${end} 課）`;
  } else if (start) {
    return `${materialName}（第 ${start} 課起）`;
  } else if (end) {
    return `${materialName}（至第 ${end} 課）`;
  }
  return materialName;
}

export async function fetchMaterialsFromSupabase(): Promise<{ data: MaterialEntity[]; error: any }> {
  if (!supabase) {
    console.error('[MaterialService] Supabase client unavailable');
    return { data: [], error: new Error('Supabase client unavailable') };
  }

  try {
    const { data: raw, error } = await supabase
      .from('materials')
      .select('*');

    console.log('[MATERIAL DEBUG] Supabase raw count =', raw?.length);
    console.log('[MATERIAL DEBUG] Supabase raw error =', error);

    if (error) {
      console.error('[MaterialService] Error fetching materials from Supabase:', error);
      return { data: [], error };
    }

    const mapped: MaterialEntity[] = (raw || []).map((row: any) => ({
      id: String(row.id),
      name: row.name || row.title || row.material_name || '未命名教材',
      code: row.code || row.material_code || '',
      description: row.description || '',
      isActive: row.is_active !== false && row.is_active !== 0 && row.active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    mapped.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-TW'));

    console.log('[MATERIAL DEBUG] mapped count =', mapped?.length);
    console.log('[MATERIAL DEBUG] mapped data =', mapped);

    return {
      data: mapped,
      error: null,
    };
  } catch (err: any) {
    console.error('[MaterialService] Exception in fetchMaterialsFromSupabase:', err);
    return { data: [], error: err };
  }
}

/**
 * Fetches a single master material by its unique id from Supabase public.materials.
 */
export async function fetchMaterialByIdFromSupabase(
  materialId: string
): Promise<{ data: MaterialEntity | null; error: any }> {
  if (!supabase) return { data: null, error: new Error('Supabase client unavailable') };

  const cleanId = String(materialId || '').trim();
  if (!cleanId) return { data: null, error: new Error('教材 ID 不可為空白') };

  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', cleanId);

    if (error) {
      console.error('[MaterialService] Error fetching material by ID:', error);
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      return { data: null, error: new Error(`找不到 ID 為 ${cleanId} 的教材資料`) };
    }

    const row = data[0];
    return {
      data: {
        id: String(row.id),
        name: row.name || row.title || row.material_name || '',
        code: row.code || row.material_code || '',
        description: row.description || '',
        isActive: row.is_active !== false && row.is_active !== 0 && row.active !== false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      error: null,
    };
  } catch (err: any) {
    console.error('[MaterialService] Exception in fetchMaterialByIdFromSupabase:', err);
    return { data: null, error: err };
  }
}

/**
 * Creates a master material in Supabase public.materials.
 */
export async function createMaterialInSupabase(
  name: string,
  description?: string,
  code?: string
): Promise<{ data: MaterialEntity | null; error: any }> {
  if (!supabase) return { data: null, error: new Error('Supabase unavailable') };

  try {
    const cleanName = name.trim();
    if (!cleanName) return { data: null, error: new Error('教材名稱不可為空白') };

    const payload: Record<string, any> = {
      name: cleanName,
      description: description?.trim() || '',
      is_active: true,
    };
    if (code?.trim()) payload.code = code.trim();

    const { data, error } = await supabase
      .from('materials')
      .insert(payload)
      .select('*');

    if (error) {
      console.error('[MaterialService] Error creating material:', error);
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      return { data: null, error: new Error('新增教材未生效（未回傳建立的教材資料）') };
    }

    const row = data[0];
    return {
      data: {
        id: String(row.id),
        name: row.name,
        code: row.code || '',
        description: row.description || '',
        isActive: row.is_active !== false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Updates a master material in Supabase public.materials.
 */
export async function updateMaterialInSupabase(
  materialId: string,
  updates: { name?: string; code?: string; description?: string; isActive?: boolean }
): Promise<{ data: MaterialEntity | null; error: any }> {
  if (!supabase) return { data: null, error: new Error('Supabase unavailable') };

  const cleanId = String(materialId || '').trim();
  if (!cleanId) return { data: null, error: new Error('教材 ID 不可為空白') };

  console.log('[MaterialService] updateMaterialInSupabase called with UUID:', cleanId, updates);

  try {
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.code !== undefined) payload.code = updates.code.trim();
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    const { data, error } = await supabase
      .from('materials')
      .update(payload)
      .eq('id', cleanId)
      .select('*');

    if (error) {
      console.error('[MaterialService] Error updating material in Supabase:', error);
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      const rlsMsg = '教材資料庫更新未生效（0 筆被修改）。請確認 Supabase public.materials 資料表是否具備 UPDATE 權限。';
      console.warn('[MaterialService] No rows affected on update:', rlsMsg);
      return { data: null, error: new Error(rlsMsg) };
    }

    const row = data[0];
    return {
      data: {
        id: String(row.id),
        name: row.name,
        code: row.code || '',
        description: row.description || '',
        isActive: row.is_active !== false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      error: null,
    };
  } catch (err: any) {
    console.error('[MaterialService] Exception in updateMaterialInSupabase:', err);
    return { data: null, error: err };
  }
}

/**
 * Fetch all class_materials for a specific class, or all classes if classId not specified.
 */
export async function fetchClassMaterialsFromSupabase(
  classId?: string
): Promise<{ data: ClassMaterialEntity[]; error: any }> {
  if (!supabase) return { data: [], error: null };

  try {
    let query = supabase
      .from('class_materials')
      .select('*, materials(id, name, code, description, is_active)')
      .order('display_order', { ascending: true });

    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MaterialService] Error in fetchClassMaterialsFromSupabase:', error);
      return { data: [], error };
    }

    const mapped: ClassMaterialEntity[] = (data || []).map((row: any) => {
      const mat = row.materials || {};
      const matName = mat.name || '未指定教材';
      const start = row.lesson_start || '';
      const end = row.lesson_end || '';
      return {
        id: String(row.id),
        classId: String(row.class_id),
        materialId: String(row.material_id),
        materialName: matName,
        materialDescription: mat.description || '',
        lessonStart: start,
        lessonEnd: end,
        displayOrder: Number(row.display_order || 1),
        formattedText: formatMaterialRange(matName, start, end),
      };
    });

    return { data: mapped, error: null };
  } catch (err: any) {
    console.error('[MaterialService] Error in fetchClassMaterialsFromSupabase:', err);
    return { data: [], error: err };
  }
}

/**
 * Assigns or updates a material for a class in public.class_materials.
 * Enforces maximum 2 materials per class, sequential display_order (1 and 2),
 * and prevents violations of unique constraint "uq_class_material_display" and "uq_class_material_pair".
 */
export async function assignMaterialToClassInSupabase(
  classId: string,
  materialId: string,
  lessonStart: string = '',
  lessonEnd: string = '',
  displayOrder?: number
): Promise<{ data: ClassMaterialEntity | null; error: any }> {
  if (!supabase) return { data: null, error: new Error('Supabase unavailable') };

  try {
    const cleanClassId = String(classId || '').trim();
    const cleanMaterialId = String(materialId || '').trim();
    if (!cleanClassId || !cleanMaterialId) {
      return { data: null, error: new Error('classId and materialId are required') };
    }

    // 1. Fetch current class_materials for this class
    const { data: existingRows, error: fetchErr } = await supabase
      .from('class_materials')
      .select('*, materials(id, name, code, description, is_active)')
      .eq('class_id', cleanClassId)
      .order('display_order', { ascending: true });

    if (fetchErr) {
      console.warn('[MaterialService] Notice querying existing class_materials:', fetchErr);
    }

    const existing = existingRows || [];

    // 2. Check if this material is already assigned to this class
    const existingMat = existing.find((r: any) => r.material_id === cleanMaterialId);
    if (existingMat) {
      // Update existing record lesson start/end without duplicate insert
      const { data: updated, error: updErr } = await supabase
        .from('class_materials')
        .update({
          lesson_start: lessonStart.trim(),
          lesson_end: lessonEnd.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMat.id)
        .select('*, materials(id, name, code, description, is_active)')
        .single();

      if (updErr) {
        console.error('[MaterialService] Error updating assigned material:', updErr);
        return { data: null, error: updErr };
      }

      const mat = updated.materials || {};
      const matName = mat.name || '';
      const start = updated.lesson_start || '';
      const end = updated.lesson_end || '';
      return {
        data: {
          id: String(updated.id),
          classId: String(updated.class_id),
          materialId: String(updated.material_id),
          materialName: matName,
          materialDescription: mat.description || '',
          lessonStart: start,
          lessonEnd: end,
          displayOrder: Number(updated.display_order || 1),
          formattedText: formatMaterialRange(matName, start, end),
        },
        error: null,
      };
    }

    // 3. Material is not yet assigned. Determine target display_order (1 or 2).
    let targetOrder = 1;
    const hasOrder1 = existing.some((r: any) => Number(r.display_order) === 1);
    const hasOrder2 = existing.some((r: any) => Number(r.display_order) === 2);

    if (displayOrder === 2) {
      targetOrder = 2;
    } else if (displayOrder === 1) {
      targetOrder = 1;
    } else {
      // Automatically choose next available order
      if (!hasOrder1) {
        targetOrder = 1;
      } else if (!hasOrder2) {
        targetOrder = 2;
      } else {
        // Both 1 and 2 exist, replace order 2
        targetOrder = 2;
      }
    }

    // 4. Remove any existing row occupying targetOrder or cleanMaterialId to prevent uq_class_material_display violation
    const conflictingRows = existing.filter(
      (r: any) => Number(r.display_order) === targetOrder || r.material_id === cleanMaterialId
    );
    if (conflictingRows.length > 0) {
      const confIds = conflictingRows.map((r: any) => r.id);
      await supabase.from('class_materials').delete().in('id', confIds);
    }
    await supabase
      .from('class_materials')
      .delete()
      .eq('class_id', cleanClassId)
      .eq('display_order', targetOrder);

    // 5. Insert new record with targetOrder
    const payload = {
      class_id: cleanClassId,
      material_id: cleanMaterialId,
      lesson_start: lessonStart.trim(),
      lesson_end: lessonEnd.trim(),
      display_order: targetOrder,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('class_materials')
      .insert(payload)
      .select('*, materials(id, name, code, description, is_active)')
      .single();

    if (error) {
      console.error('[MaterialService] Error assigning class material:', error);
      return { data: null, error };
    }

    const mat = data.materials || {};
    const matName = mat.name || '';
    const start = data.lesson_start || '';
    const end = data.lesson_end || '';

    return {
      data: {
        id: String(data.id),
        classId: String(data.class_id),
        materialId: String(data.material_id),
        materialName: matName,
        materialDescription: mat.description || '',
        lessonStart: start,
        lessonEnd: end,
        displayOrder: Number(data.display_order || targetOrder),
        formattedText: formatMaterialRange(matName, start, end),
      },
      error: null,
    };
  } catch (err: any) {
    console.error('[MaterialService] Exception in assignMaterialToClassInSupabase:', err);
    return { data: null, error: err };
  }
}

/**
 * Removes an assigned material from a class.
 */
export async function removeClassMaterialFromSupabase(
  classMaterialId: string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) return { success: false, error: new Error('Supabase unavailable') };

  try {
    const { error } = await supabase
      .from('class_materials')
      .delete()
      .eq('id', classMaterialId);

    if (error) return { success: false, error };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}

/**
 * Saves/replaces up to 2 selected materials for a class in public.class_materials.
 * 嚴格遵循規則：
 * 1. 使用者選幾本，就儲存幾本；資料庫有幾本，就顯示幾本。
 * 2. 選 0 本 -> DELETE 該班級全部 class_materials，不寫入任何新資料。
 * 3. 選 1 本 -> DELETE 既有資料後，寫入 1 筆 (display_order = 1)。
 * 4. 選 2 本 -> 若同一本教材被選兩次自動去重為 1 本；若為 2 本不同教材，DELETE 既有資料後依序寫入 (第 1 筆 display_order = 1, 第 2 筆 display_order = 2)。
 * 5. 嚴格檢查所有 DELETE 與 INSERT 的 error，若有 error 立即 throw，絕不假裝成功。
 * 6. 寫入完成後，立即從 Supabase 重新 SELECT 該 class_id 的 class_materials 與 JOIN materials 驗證資料庫實際筆數。
 */
export async function saveClassMaterialsInSupabase(
  classId: string,
  materialIds: string[]
): Promise<{ success: boolean; data?: ClassMaterialEntity[]; error: any }> {
  if (!supabase) {
    const err = new Error('Supabase client unavailable');
    console.error('[class_materials ERROR]', err);
    throw err;
  }

  const cleanClassId = String(classId || '').trim();
  if (!cleanClassId) {
    const err = new Error('classId 為必填欄位');
    console.error('[class_materials ERROR]', err);
    throw err;
  }

  // 1. 嚴格過濾與去重：空字串、null、undefined、「未指定教材」皆算 0 本
  const uniqueIds: string[] = [];
  for (const id of materialIds || []) {
    const clean = String(id || '').trim();
    if (
      clean &&
      clean !== '-- 未指定教材 --' &&
      clean !== '未指定教材' &&
      clean !== 'null' &&
      clean !== 'undefined' &&
      !uniqueIds.includes(clean)
    ) {
      uniqueIds.push(clean);
      if (uniqueIds.length >= 2) break;
    }
  }

  console.log(`[class_materials SYNC] classId=${cleanClassId}, inputIds=`, materialIds, 'filteredUniqueIds=', uniqueIds);

  try {
    // 2. 檢查既有資料庫記錄
    const { data: existingRows, error: fetchErr } = await supabase
      .from('class_materials')
      .select('id, class_id, material_id, display_order')
      .eq('class_id', cleanClassId)
      .order('display_order', { ascending: true });

    if (fetchErr) {
      console.error('[class_materials FETCH ERROR]', fetchErr);
      throw fetchErr;
    }

    const existing = existingRows || [];

    // 檢查現有資料庫記錄是否已經與 uniqueIds 順序完全一致
    const alreadyMatched =
      existing.length === uniqueIds.length &&
      uniqueIds.every((id, idx) => existing[idx]?.material_id === id && Number(existing[idx]?.display_order) === idx + 1);

    if (!alreadyMatched) {
      // 3. 避免 duplicate key (uq_class_material_display 與 uq_class_material_pair)：
      // 先刪除該班級在 public.class_materials 的所有既有資料
      if (existing.length > 0) {
        const { error: delErr } = await supabase
          .from('class_materials')
          .delete()
          .eq('class_id', cleanClassId);

        if (delErr) {
          console.error('[class_materials DELETE ERROR]', delErr);
          throw delErr;
        }

        // 檢查 DELETE 是否真正生效 (防範 RLS 權限阻擋導致 0 rows affected)
        const { data: checkRemaining, error: checkErr } = await supabase
          .from('class_materials')
          .select('id')
          .eq('class_id', cleanClassId);

        if (checkErr) {
          console.error('[class_materials CHECK DELETE ERROR]', checkErr);
          throw checkErr;
        }

        if (checkRemaining && checkRemaining.length > 0) {
          const rlsMsg = `Supabase class_materials 既有記錄刪除未生效（資料庫中仍有 ${checkRemaining.length} 筆資料）。請確認 Supabase RLS 政策已允許 authenticated 角色執行 DELETE 操作。`;
          console.error('[class_materials RLS DELETE BLOCKED]', rlsMsg);
          throw new Error(rlsMsg);
        }
      }

      // 4. 依序寫入使用者選取的教材
      // 【情況 A：選 0 本】已完成刪除，不寫入任何新資料
      if (uniqueIds.length > 0) {
        // 【情況 B：選 1 本】寫入 1 筆 (display_order = 1)
        // 【情況 C：選 2 本】寫入 2 筆 (第一筆 display_order = 1, 第二筆 display_order = 2)
        for (let i = 0; i < uniqueIds.length; i++) {
          const matId = uniqueIds[i];
          const displayOrder = i + 1;
          const payload = {
            class_id: cleanClassId,
            material_id: matId,
            display_order: displayOrder,
            lesson_start: '',
            lesson_end: '',
            updated_at: new Date().toISOString(),
          };

          const { error: insErr } = await supabase
            .from('class_materials')
            .insert(payload);

          if (insErr) {
            console.error(`[class_materials INSERT ERROR order ${displayOrder}]`, insErr);
            throw insErr;
          }
        }
      }
    }

    // 5. 儲存完成後，重新從 Supabase 取得最新 class_materials 與 JOIN materials 驗證實際筆數
    const { data: freshRows, error: verifyErr } = await supabase
      .from('class_materials')
      .select('*, materials(id, name, code, description, is_active)')
      .eq('class_id', cleanClassId)
      .order('display_order', { ascending: true });

    if (verifyErr) {
      console.error('[class_materials VERIFY FETCH ERROR]', verifyErr);
      throw verifyErr;
    }

    const verifiedList: ClassMaterialEntity[] = (freshRows || []).map((r: any) => {
      const mat = r.materials || {};
      const matName = mat.name || '';
      const start = r.lesson_start || '';
      const end = r.lesson_end || '';
      return {
        id: String(r.id),
        classId: String(r.class_id),
        materialId: String(r.material_id),
        materialName: matName,
        materialDescription: mat.description || '',
        lessonStart: start,
        lessonEnd: end,
        displayOrder: Number(r.display_order || 1),
        formattedText: formatMaterialRange(matName, start, end),
      };
    });

    console.log(`[class_materials VERIFIED] classId=${cleanClassId}, dbActualCount=${verifiedList.length}, materials=`, verifiedList.map(m => m.materialName));
    return { success: true, data: verifiedList, error: null };
  } catch (err: any) {
    console.error('[class_materials FATAL ERROR]', err);
    throw err;
  }
}


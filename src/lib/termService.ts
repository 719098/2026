import { supabase } from './supabase';
import { Term } from '../types';

/**
 * Converts a database record in public.terms to the frontend Term interface.
 */
export function mapDbToTerm(row: any): Term {
  return {
    id: String(row.id),
    name: row.name || '未命名學期',
    termCode: row.term_code || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    isLocked: Boolean(row.is_locked),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetches all terms directly from Supabase public.terms table.
 * Strictly uses Supabase data without creating or re-initializing mock data.
 */
export async function fetchTermsFromSupabase(): Promise<{ data: Term[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    const { data: rows, error } = await supabase
      .from('terms')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) {
      console.error('[TermService] Error fetching terms from Supabase:', error);
      return { data: [], error };
    }

    const mapped = (rows || []).map(mapDbToTerm);
    return { data: mapped, error: null };
  } catch (err: any) {
    console.error('[TermService] Unexpected exception fetching terms:', err);
    return { data: [], error: err };
  }
}

/**
 * Creates a new term directly in Supabase public.terms.
 */
export async function createTermInSupabase(
  termData: Partial<Term>
): Promise<{ data: Term | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    const payload: Record<string, any> = {
      name: termData.name?.trim(),
      term_code: termData.termCode?.trim() || `TERM-${Date.now().toString().slice(-4)}`,
      start_date: termData.startDate,
      end_date: termData.endDate,
      is_active: termData.isActive !== false,
      is_locked: termData.isLocked === true,
    };

    const { data, error } = await supabase
      .from('terms')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('[TermService] Error creating term in Supabase:', error);
      return { data: null, error };
    }

    return { data: mapDbToTerm(data), error: null };
  } catch (err: any) {
    console.error('[TermService] Unexpected exception creating term:', err);
    return { data: null, error: err };
  }
}

/**
 * Updates an existing term in Supabase public.terms.
 */
export async function updateTermInSupabase(
  termId: string,
  updateData: Partial<Term>
): Promise<{ data: Term | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updateData.name !== undefined) payload.name = updateData.name.trim();
    if (updateData.termCode !== undefined) payload.term_code = updateData.termCode.trim();
    if (updateData.startDate !== undefined) payload.start_date = updateData.startDate;
    if (updateData.endDate !== undefined) payload.end_date = updateData.endDate;
    if (updateData.isActive !== undefined) payload.is_active = updateData.isActive;
    if (updateData.isLocked !== undefined) payload.is_locked = updateData.isLocked;

    const { data, error } = await supabase
      .from('terms')
      .update(payload)
      .eq('id', termId)
      .select('*')
      .single();

    if (error) {
      console.error('[TermService] Error updating term in Supabase:', error);
      return { data: null, error };
    }

    return { data: mapDbToTerm(data), error: null };
  } catch (err: any) {
    console.error('[TermService] Unexpected exception updating term:', err);
    return { data: null, error: err };
  }
}

/**
 * Toggles a term's is_active status in Supabase.
 */
export async function toggleTermActiveInSupabase(
  termId: string,
  isActive: boolean
): Promise<{ data: Term | null; error: any }> {
  return updateTermInSupabase(termId, { isActive });
}

/**
 * Toggles a term's is_locked status in Supabase.
 */
export async function toggleTermLockedInSupabase(
  termId: string,
  isLocked: boolean
): Promise<{ data: Term | null; error: any }> {
  return updateTermInSupabase(termId, { isLocked });
}

export const toggleTermLockInSupabase = toggleTermLockedInSupabase;

/**
 * Safely deletes a term from Supabase public.terms.
 * Foreign Key Safety Check: Verifies if any class in public.classes uses this term_id.
 * If bound classes exist, prevents deletion and returns an explanatory error.
 */
export async function deleteTermFromSupabase(
  termId: string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    // 1. Check for foreign key references in public.classes
    const { data: referencingClasses, error: checkError } = await supabase
      .from('classes')
      .select('id, name, class_code')
      .eq('term_id', termId);

    if (checkError) {
      console.warn('[TermService] Notice checking class references for term:', checkError);
    }

    if (referencingClasses && referencingClasses.length > 0) {
      const classNames = referencingClasses
        .slice(0, 3)
        .map((c: any) => c.name || c.class_code)
        .join('、');
      const moreCount = referencingClasses.length > 3 ? ` 等 ${referencingClasses.length} 個班級` : '';
      return {
        success: false,
        error: new Error(
          `該學期目前尚有 ${referencingClasses.length} 個開設班級（${classNames}${moreCount}）使用中，禁止刪除！請先將所屬班級轉移或刪除。`
        ),
      };
    }

    // 2. Perform safe deletion
    const { error: deleteError } = await supabase
      .from('terms')
      .delete()
      .eq('id', termId);

    if (deleteError) {
      console.error('[TermService] Error deleting term from Supabase:', deleteError);
      return { success: false, error: deleteError };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[TermService] Unexpected exception deleting term:', err);
    return { success: false, error: err };
  }
}

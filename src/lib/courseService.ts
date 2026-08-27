import { supabase } from './supabase';
import { CourseDefinition } from '../types';

/**
 * Serializes UI fields (textbook, targetAudience, description) into the DB description text column.
 */
export function formatCourseDescription(description?: string, textbook?: string, targetAudience?: string): string {
  const parts: string[] = [];
  if (textbook && textbook.trim()) {
    parts.push(`【教材】${textbook.trim()}`);
  }
  if (description && description.trim()) {
    parts.push(`【說明】${description.trim()}`);
  }
  if (targetAudience && targetAudience.trim()) {
    parts.push(`【對象】${targetAudience.trim()}`);
  }
  return parts.length > 0 ? parts.join('\n') : (description || '');
}

/**
 * Parses the DB description text column into UI fields (textbook, description, targetAudience).
 */
export function parseCourseDescription(rawDesc?: string | null): {
  textbook: string;
  description: string;
  targetAudience: string;
} {
  if (!rawDesc) {
    return { textbook: '《當代中文課程》', description: '無詳細說明', targetAudience: '華語中心學員' };
  }

  let textbook = '';
  let description = '';
  let targetAudience = '';

  const lines = rawDesc.split('\n');
  let isFormatted = false;

  for (const line of lines) {
    if (line.startsWith('【教材】')) {
      textbook = line.replace('【教材】', '').trim();
      isFormatted = true;
    } else if (line.startsWith('【說明】')) {
      description = line.replace('【說明】', '').trim();
      isFormatted = true;
    } else if (line.startsWith('【對象】')) {
      targetAudience = line.replace('【對象】', '').trim();
      isFormatted = true;
    }
  }

  if (!isFormatted) {
    // If not structured with tags, use raw description
    description = rawDesc;
    textbook = '《當代中文課程》';
    targetAudience = '華語中心學員';
  }

  return {
    textbook: textbook || '《當代中文課程》',
    description: description || rawDesc,
    targetAudience: targetAudience || '華語中心學員',
  };
}

/**
 * Converts a database record in public.course_definitions to the frontend CourseDefinition interface.
 */
export function mapDbToCourse(row: any): CourseDefinition {
  const parsed = parseCourseDescription(row.description);

  return {
    id: String(row.id),
    code: row.code || `CRS-${row.id}`,
    name: row.name || '未命名課程',
    level: row.level || '初級 A1',
    textbook: parsed.textbook,
    suggestedHours: Number(row.default_hours || 0),
    description: parsed.description,
    targetAudience: parsed.targetAudience,
    createdAt: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : '2026-08-18',
  };
}

/**
 * Initial 8 formal course definitions from the curriculum specification.
 */
export const INITIAL_8_COURSES = [
  {
    code: 'CHN-101',
    name: '初級華語一',
    level: '初級 A1',
    default_hours: 165,
    description: formatCourseDescription(
      '專為華語初學者設計，著重基礎發音（漢語拼音/注音）、實用問候、日常生活會話與基礎漢字書寫。',
      '《當代中文課程》第一冊 (課本+作業本)',
      '零起點或初學華語 0-50 小時之外籍學員'
    ),
    is_active: true,
  },
  {
    code: 'CHN-102',
    name: '初級華語二',
    level: '初級 A2',
    default_hours: 165,
    description: formatCourseDescription(
      '延續初級一基礎，深入購物、交通、餐飲點餐、旅遊與就醫等生活情境表達，擴充至 800 個常用字詞。',
      '《當代中文課程》第二冊 (課本+作業本)',
      '已具備 A1 基礎或累計 150 小時學習者'
    ),
    is_active: true,
  },
  {
    code: 'CHN-201',
    name: '中級華語一',
    level: '中級 B1',
    default_hours: 165,
    description: formatCourseDescription(
      '加強複雜句型、敘事邏輯、台灣社會風俗討論與短文寫作，奠定流利溝通能力。',
      '《當代中文課程》第三冊 (課本+練習冊)',
      '已通過 TOCFL A2 / HSK 3-4 之學員'
    ),
    is_active: true,
  },
  {
    code: 'CHN-202',
    name: '中級華語二',
    level: '中級 B2',
    default_hours: 165,
    description: formatCourseDescription(
      '探討環境議題、人際關係、科技發展等深度主題，培養口頭發表與正式書面表達能力。',
      '《當代中文課程》第四冊 (課本+練習冊)',
      '已完成中級一或具備 400 小時以上學習者'
    ),
    is_active: true,
  },
  {
    code: 'CHN-301',
    name: '高級華語三',
    level: '高級 C1',
    default_hours: 165,
    description: formatCourseDescription(
      '新聞時事評論、學術研討發表、中華古典文學短篇選讀與高級商業談判語法。',
      '《當代中文課程》第五冊 / 現代散文與新聞文選',
      '準備在台求學、考取 TOCFL B2/C1 或就業之高級學員'
    ),
    is_active: true,
  },
  {
    code: 'CHN-CONV',
    name: '生活實用會話',
    level: '基礎 A2~B1',
    default_hours: 165,
    description: formatCourseDescription(
      '純口語加強課程，模擬台灣夜市、租屋簽約、銀行開戶、郵局與各類真實生活互動情境。',
      '《實用生活華語會話》第一冊（生活情境專題）',
      '希望快速融入在台生活之學員'
    ),
    is_active: true,
  },
  {
    code: 'CHN-BUS',
    name: '商務華語實務',
    level: '中高階 B2',
    default_hours: 165,
    description: formatCourseDescription(
      '商務電子郵件寫作、產品提案簡報、職場溝通禮儀、跨國經貿洽談與合約導讀。',
      '《遠東商務漢語》上冊（商務簡報與書信專題）',
      '跨國企業外籍主管、經貿人士或有商業應用需求者'
    ),
    is_active: true,
  },
  {
    code: 'CHN-CUL',
    name: '台灣文化與影視欣賞',
    level: '中階 B1~B2',
    default_hours: 110,
    description: formatCourseDescription(
      '結合台灣經典電影、紀錄片、流行音樂與節慶民俗（媽祖遶境、原住民文化），提升文化理解深度。',
      '《台灣文化探索與影視專題教材》（影音配合）',
      '對台灣在地歷史與文化藝術感興趣之中級以上學員'
    ),
    is_active: true,
  },
];

/**
 * Fetch all course definitions from Supabase public.course_definitions.
 * If the table is currently empty, it auto-seeds the official 8 course definitions.
 */
export async function fetchCourseDefinitions(): Promise<{ data: CourseDefinition[]; error: any }> {
  if (!supabase) {
    return { data: [], error: new Error('Supabase client is not configured') };
  }

  try {
    const { data: rawCourses, error: courseErr } = await supabase
      .from('course_definitions')
      .select('*')
      .order('code', { ascending: true });

    if (courseErr) {
      console.error('[CourseService] Error fetching course_definitions from Supabase:', courseErr);
      return { data: [], error: courseErr };
    }

    // Auto-seed if empty
    if (!rawCourses || rawCourses.length === 0) {
      console.log('[CourseService] course_definitions is empty, seeding initial 8 courses...');
      const { data: seeded, error: seedErr } = await supabase
        .from('course_definitions')
        .insert(INITIAL_8_COURSES)
        .select();

      if (seedErr) {
        console.error('[CourseService] Error seeding initial course definitions:', seedErr);
        return { data: [], error: seedErr };
      }

      const mappedSeeded = (seeded || []).map(mapDbToCourse);
      return { data: mappedSeeded, error: null };
    }

    const mapped = rawCourses.map(mapDbToCourse);
    return { data: mapped, error: null };
  } catch (err: any) {
    console.error('[CourseService] Unexpected error in fetchCourseDefinitions:', err);
    return { data: [], error: err };
  }
}

/**
 * Creates a new course definition in Supabase public.course_definitions.
 */
export async function createCourseDefinition(
  courseData: Partial<CourseDefinition>
): Promise<{ data: CourseDefinition | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    const desc = formatCourseDescription(
      courseData.description,
      courseData.textbook,
      courseData.targetAudience
    );

    const payload = {
      code: courseData.code?.trim().toUpperCase(),
      name: courseData.name?.trim(),
      level: courseData.level?.trim() || '初級 A1',
      default_hours: Number(courseData.suggestedHours) || 0,
      description: desc,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('course_definitions')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[CourseService] Error creating course_definition in Supabase:', error);
      return { data: null, error };
    }

    return { data: mapDbToCourse(data), error: null };
  } catch (err: any) {
    console.error('[CourseService] Exception in createCourseDefinition:', err);
    return { data: null, error: err };
  }
}

/**
 * Updates an existing course definition in Supabase public.course_definitions.
 */
export async function updateCourseDefinition(
  courseId: string,
  courseData: Partial<CourseDefinition>
): Promise<{ data: CourseDefinition | null; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }

  try {
    const desc = formatCourseDescription(
      courseData.description,
      courseData.textbook,
      courseData.targetAudience
    );

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (courseData.code !== undefined) payload.code = courseData.code.trim().toUpperCase();
    if (courseData.name !== undefined) payload.name = courseData.name.trim();
    if (courseData.level !== undefined) payload.level = courseData.level.trim();
    if (courseData.suggestedHours !== undefined) payload.default_hours = Number(courseData.suggestedHours);
    payload.description = desc;

    const { data, error } = await supabase
      .from('course_definitions')
      .update(payload)
      .eq('id', courseId)
      .select()
      .single();

    if (error) {
      console.error('[CourseService] Error updating course_definition in Supabase:', error);
      return { data: null, error };
    }

    return { data: mapDbToCourse(data), error: null };
  } catch (err: any) {
    console.error('[CourseService] Exception in updateCourseDefinition:', err);
    return { data: null, error: err };
  }
}

/**
 * Safely deletes a course definition from Supabase public.course_definitions.
 * Strict safety check: If any class in public.classes references this course_definition_id, deletion is BLOCKED.
 */
export async function deleteCourseDefinition(
  courseId: string
): Promise<{ success: boolean; error: any }> {
  if (!supabase) {
    return { success: false, error: new Error('Supabase client is not configured') };
  }

  try {
    // 1. Check if any class is currently using this course definition
    const { data: referencingClasses, error: checkError } = await supabase
      .from('classes')
      .select('id, name, course_definition_id')
      .eq('course_definition_id', courseId);

    if (checkError) {
      console.error('[CourseService] Error checking referencing classes:', checkError);
      return { success: false, error: checkError };
    }

    if (referencingClasses && referencingClasses.length > 0) {
      const classNames = referencingClasses.map((c) => c.name).join('、');
      return {
        success: false,
        error: new Error(`此課程目前已有班級使用（${classNames}），無法刪除，請先處理相關班級。`),
      };
    }

    // 2. Safe to delete when not referenced
    const { error: deleteError } = await supabase
      .from('course_definitions')
      .delete()
      .eq('id', courseId);

    if (deleteError) {
      console.error('[CourseService] Error deleting course_definition from Supabase:', deleteError);
      return { success: false, error: deleteError };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[CourseService] Exception in deleteCourseDefinition:', err);
    return { success: false, error: err };
  }
}

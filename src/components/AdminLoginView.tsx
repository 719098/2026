import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, Teacher, UserRole } from '../types';
import { mapDbToTeacher, fetchTeacherWithClassesByProfileId } from '../lib/teacherService';
import { 
  Building2, 
  Lock, 
  Mail, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  ShieldCheck,
  GraduationCap,
  UserCheck
} from 'lucide-react';

interface AdminLoginViewProps {
  onLoginSuccess: (profile: UserProfile) => void;
  onTeacherLoginSuccess?: (teacher: Teacher, profile: UserProfile) => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLoginSuccess,
  onTeacherLoginSuccess,
}) => {
  const [loginRoleTab, setLoginRoleTab] = useState<UserRole>('ADMIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isConfigured = isSupabaseConfigured();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('請輸入 Email 與密碼');
      return;
    }

    setLoading(true);

    try {
      if (!isConfigured || !supabase) {
        setErrorMessage('Supabase 尚未設定，請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY');
        setLoading(false);
        return;
      }

      // 1. Supabase Auth 登入驗證
      const cleanEmail = email.trim().toLowerCase();
      
      console.log('[DEBUG Auth] Calling signInWithPassword...', {
        supabaseUrl: 'https://rcvetyahocznanvbggqf.supabase.co',
        loginEmail: cleanEmail,
        signInWithPasswordCalled: true,
      });

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (authError || !authData?.user) {
        console.log('[DEBUG Auth] signInWithPassword returned error:', {
          errorMessage: authError?.message || 'No user returned',
          errorStatus: authError?.status,
        });

        const rawMsg = authError?.message || '';
        if (rawMsg.toLowerCase().includes('invalid login credentials')) {
          setErrorMessage('登入失敗：帳號或密碼不正確 (Invalid login credentials)。請確認輸入的 Email 與密碼。');
        } else {
          setErrorMessage(rawMsg ? `登入失敗：${rawMsg}` : 'Email 或密碼錯誤');
        }
        setLoading(false);
        return;
      }

      console.log('[DEBUG Auth] signInWithPassword success:', {
        userId: authData.user.id,
      });

      const currentUser = authData.user;
      const userId = currentUser.id;

      // 2. 查詢 public.profiles 驗證權限 (使用當前登入者 auth uid)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Supabase profiles query error:', {
          code: profileError.code,
          message: profileError.message,
          queriedId: userId,
        });
        await supabase.auth.signOut();
        
        if (profileError.code === '42501') {
          setErrorMessage(
            `資料庫權限未授予 (PostgreSQL 42501: permission denied for table profiles)。請在 Supabase SQL Editor 執行：GRANT SELECT ON public.profiles TO authenticated;`
          );
        } else {
          setErrorMessage(`查詢使用者資料庫失敗 [${profileError.code || 'ERROR'}]: ${profileError.message}`);
        }
        setLoading(false);
        return;
      }

      if (!profile) {
        console.warn('Profile not found in public.profiles for auth user ID:', userId);
        await supabase.auth.signOut();
        setErrorMessage(`找不到使用者 Profile（Auth ID: ${userId} 在 public.profiles 中無對應紀錄），請聯絡系統管理員。`);
        setLoading(false);
        return;
      }

      // 3. 檢查帳號是否啟用
      if (profile.is_active === false) {
        await supabase.auth.signOut();
        setErrorMessage('此帳號目前已停用 (is_active = false)');
        setLoading(false);
        return;
      }

      const dbRole: UserRole = profile.role === 'TEACHER' ? 'TEACHER' : 'ADMIN';

      // 4. 角色判斷與路由
      if (loginRoleTab === 'ADMIN') {
        if (dbRole !== 'ADMIN') {
          await supabase.auth.signOut();
          setErrorMessage(`登入失敗：您選擇的是「管理員登入」，但此帳號在資料庫的角色為【${dbRole}】。請切換至「教師登入」頁籤！`);
          setLoading(false);
          return;
        }

        const userProfile: UserProfile = {
          id: profile.id,
          role: 'ADMIN',
          fullName: profile.full_name || '系統管理員',
          email: profile.email || authData.user.email || '',
          avatarUrl: profile.avatar_url,
          isActive: profile.is_active,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        };

        onLoginSuccess(userProfile);
      } else {
        // TEACHER Login
        if (dbRole !== 'TEACHER') {
          await supabase.auth.signOut();
          setErrorMessage(`登入失敗：您選擇的是「教師登入」，但此帳號在資料庫的角色為【${dbRole}】。請切換至「管理員登入」頁籤！`);
          setLoading(false);
          return;
        }

        // Fetch corresponding teacher profile from public.teachers where profile_id = profile.id
        const { data: teacherRow, error: teacherErr } = await supabase
          .from('teachers')
          .select('*')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (teacherErr || !teacherRow) {
          // Fallback search by email or emp_email
          const userEmail = profile.email || authData.user.email || '';
          let teacherByEmail = null;
          const { data: searchByEmpEmail } = await supabase
            .from('teachers')
            .select('*')
            .eq('emp_email', userEmail)
            .maybeSingle();

          teacherByEmail = searchByEmpEmail;

          if (!teacherByEmail) {
            await supabase.auth.signOut();
            setErrorMessage(`已確認具備 TEACHER 角色，但在 public.teachers 資料表中找不到對應的教師檔案 (Profile ID: ${profile.id})。請聯絡管理員建檔。`);
            setLoading(false);
            return;
          }

          const teacher = (await fetchTeacherWithClassesByProfileId(profile.id)) || mapDbToTeacher(teacherByEmail);
          const userProfile: UserProfile = {
            id: profile.id,
            role: 'TEACHER',
            fullName: teacher.name || profile.full_name || '教師',
            email: profile.email || authData.user.email || '',
            avatarUrl: profile.avatar_url,
            isActive: profile.is_active,
          };

          if (onTeacherLoginSuccess) {
            onTeacherLoginSuccess(teacher, userProfile);
          } else {
            onLoginSuccess(userProfile);
          }
        } else {
          const teacher = (await fetchTeacherWithClassesByProfileId(profile.id)) || mapDbToTeacher(teacherRow);
          const userProfile: UserProfile = {
            id: profile.id,
            role: 'TEACHER',
            fullName: teacher.name || profile.full_name || '教師',
            email: profile.email || authData.user.email || '',
            avatarUrl: profile.avatar_url,
            isActive: profile.is_active,
          };

          if (onTeacherLoginSuccess) {
            onTeacherLoginSuccess(teacher, userProfile);
          } else {
            onLoginSuccess(userProfile);
          }
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage(err.message || '登入時發生錯誤，請稍後再試');
      if (supabase) {
        await supabase.auth.signOut().catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Subtle Gradient Spheres */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-xl shadow-blue-900/40 mb-4 ring-4 ring-blue-500/20">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            靜宜大學華語中心
          </h1>
          <p className="mt-2 text-sm text-slate-400 font-medium flex items-center justify-center space-x-1.5">
            {loginRoleTab === 'ADMIN' ? (
              <>
                <ShieldCheck className="w-4 h-4 text-blue-400 inline" />
                <span>教務行政管理系統 (ADMIN)</span>
              </>
            ) : (
              <>
                <GraduationCap className="w-4 h-4 text-teal-400 inline" />
                <span>教師授課端系統 (TEACHER)</span>
              </>
            )}
          </p>
        </div>

        {/* Missing Supabase Env Warning Banner */}
        {!isConfigured && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
            <div className="flex items-center space-x-2 font-bold text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Supabase 尚未設定</span>
            </div>
            <p className="text-amber-300/90 leading-relaxed font-medium">
              請於環境變數設定 <code className="bg-amber-950/60 px-1.5 py-0.5 rounded font-mono text-[11px] text-amber-200">VITE_SUPABASE_URL</code> 與對應的 Anon / Publishable Key。
            </p>
          </div>
        )}

        {/* Shared Login Card */}
        <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-950/50">
          
          {/* Role Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-700/60 mb-6">
            <button
              type="button"
              onClick={() => {
                setLoginRoleTab('ADMIN');
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                loginRoleTab === 'ADMIN'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>管理員登入</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginRoleTab('TEACHER');
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                loginRoleTab === 'TEACHER'
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-900/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span>教師登入</span>
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Error Message Box */}
            {errorMessage && (
              <div 
                id="login-error-alert"
                className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-start space-x-2.5 text-rose-300 text-xs font-semibold animate-in fade-in duration-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5">
              <label 
                htmlFor="user-email" 
                className="block text-xs font-bold text-slate-300 tracking-wide"
              >
                {loginRoleTab === 'ADMIN' ? '管理員 Email' : '教師 Email 帳號'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="user-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={loginRoleTab === 'ADMIN' ? 'admin@test.com' : 'test@pu.edu.tw'}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  disabled={loading}
                />
              </div>
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (loginRoleTab === 'ADMIN') {
                      setEmail('admin@test.com');
                      setPassword('password123');
                    } else {
                      setEmail('test@pu.edu.tw');
                      setPassword('password123');
                    }
                    setErrorMessage(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-blue-400 underline font-medium cursor-pointer transition-colors"
                >
                  {loginRoleTab === 'ADMIN' ? '一鍵填入預設管理員帳密' : '一鍵填入預設教師帳密'}
                </button>
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label 
                htmlFor="user-password" 
                className="block text-xs font-bold text-slate-300 tracking-wide"
              >
                登入密碼
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="user-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 text-white text-sm font-bold rounded-xl shadow-lg focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                loginRoleTab === 'ADMIN'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/30 focus:ring-blue-500'
                  : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 shadow-teal-900/30 focus:ring-teal-500'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>登入驗證中...</span>
                </>
              ) : (
                <>
                  {loginRoleTab === 'ADMIN' ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <GraduationCap className="w-4 h-4" />
                  )}
                  <span>{loginRoleTab === 'ADMIN' ? '登入管理系統' : '登入教師系統'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500">
          靜宜大學華語中心 Providence University CLC © 2026
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { User } from 'lucide-react';

interface StudentAvatarProps {
  avatarUrl?: string | null;
  name?: string;
  className?: string;
  sizeClassName?: string;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  avatarUrl,
  name,
  className = '',
  sizeClassName = 'w-10 h-10',
}) => {
  const [imgError, setImgError] = useState(false);

  const showImage = Boolean(avatarUrl && !imgError && avatarUrl.trim() !== '');

  if (showImage && avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || '學生照片'}
        onError={() => setImgError(true)}
        className={`${sizeClassName} rounded-full object-cover border border-slate-200 shrink-0 ${className}`}
      />
    );
  }

  // Fallback placeholder
  const initial = name ? name.trim().charAt(0) : '';

  return (
    <div
      className={`${sizeClassName} rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0 select-none ${className}`}
      title={name || '尚未上傳照片'}
    >
      {initial ? <span>{initial}</span> : <User className="w-1/2 h-1/2 text-slate-400" />}
    </div>
  );
};

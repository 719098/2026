import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';

interface TeacherAvatarProps {
  avatarUrl?: string | null;
  name?: string;
  className?: string;
  sizeClassName?: string;
}

export const TeacherAvatar: React.FC<TeacherAvatarProps> = ({
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
        alt={name || '教師照片'}
        onError={() => setImgError(true)}
        className={`${sizeClassName} rounded-full object-cover border border-indigo-200 shrink-0 ${className}`}
      />
    );
  }

  // Fallback default avatar
  const initial = name ? name.trim().charAt(0) : '';

  return (
    <div
      className={`${sizeClassName} rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0 select-none ${className}`}
      title={name || '教師預設頭像'}
    >
      {initial ? <span>{initial}</span> : <UserCheck className="w-1/2 h-1/2 text-indigo-400" />}
    </div>
  );
};

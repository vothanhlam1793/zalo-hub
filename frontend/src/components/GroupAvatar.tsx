import { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitial } from '@/utils';
import type { Contact, GroupMember } from '@/types';

interface GroupAvatarProps {
  avatar?: string;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  members?: Array<GroupMember | Contact | { avatar?: string; displayName?: string; name?: string }>;
  memberCount?: number;
  className?: string;
}

const SIZE_MAP = {
  sm: { container: 'w-8 h-8', item: 'w-3.5 h-3.5 text-[8px]', font: 'text-xs', plus: 'text-[7px]' },
  md: { container: 'w-[42px] h-[42px]', item: 'w-[19px] h-[19px] text-[9px]', font: 'text-base', plus: 'text-[8px]' },
  lg: { container: 'w-12 h-12', item: 'w-[22px] h-[22px] text-[10px]', font: 'text-lg', plus: 'text-[9px]' },
  xl: { container: 'w-16 h-16', item: 'w-7 h-7 text-xs', font: 'text-xl', plus: 'text-[10px]' },
};

const BG_GRADIENTS = [
  'from-blue-500 to-cyan-400',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-indigo-500 to-purple-400',
  'from-violet-500 to-fuchsia-400',
];

export function GroupAvatar({
  avatar,
  title,
  size = 'md',
  members = [],
  memberCount,
  className = '',
}: GroupAvatarProps) {
  const cfg = SIZE_MAP[size] || SIZE_MAP.md;

  // 1. If explicit group avatar exists, show it directly
  if (avatar) {
    return (
      <Avatar className={`${cfg.container} rounded-full shrink-0 ${className}`}>
        <img src={avatar} alt={title} className="w-full h-full object-cover rounded-full" />
        <AvatarFallback className={`bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] ${cfg.font} font-bold`}>
          {getInitial(title)}
        </AvatarFallback>
      </Avatar>
    );
  }

  // 2. Extract valid member avatar candidates
  const validMemberAvatars = useMemo(() => {
    if (!members || !Array.isArray(members)) return [];
    return members
      .map((m) => {
        const name = ('displayName' in m ? m.displayName : undefined) || ('name' in m ? m.name : undefined) || 'U';
        return { avatar: m.avatar, name };
      })
      .slice(0, 4);
  }, [members]);

  // If we have at least 2 member avatars or members list, render a neat Collage Grid
  if (validMemberAvatars.length >= 2) {
    const totalCount = memberCount || members.length || validMemberAvatars.length;
    const slots = validMemberAvatars.slice(0, 4);
    const showPlusCount = totalCount > 4;

    return (
      <div
        className={`${cfg.container} rounded-full bg-[var(--muted)] border border-[var(--border)] p-0.5 grid grid-cols-2 grid-rows-2 gap-0.5 items-center justify-items-center overflow-hidden shrink-0 ${className}`}
        title={`${title} (${totalCount} thành viên)`}
      >
        {slots.map((item, idx) => {
          // If this is the 4th slot and there are more than 4 members, show +N counter
          if (idx === 3 && showPlusCount) {
            const remaining = totalCount - 3;
            return (
              <div
                key="plus-more"
                className={`${cfg.item} rounded-full bg-slate-700 text-white font-bold flex items-center justify-center ${cfg.plus}`}
              >
                +{remaining > 99 ? '99' : remaining}
              </div>
            );
          }

          const grad = BG_GRADIENTS[idx % BG_GRADIENTS.length];
          return (
            <div
              key={idx}
              className={`${cfg.item} rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br ${grad} text-white font-bold shadow-2xs`}
            >
              {item.avatar ? (
                <img src={item.avatar} alt={item.name} className="w-full h-full object-cover rounded-full" />
              ) : (
                <span>{getInitial(item.name)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Fallback: Group Icon Gradient
  return (
    <Avatar className={`${cfg.container} rounded-full shrink-0 ${className}`}>
      <AvatarFallback className={`bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 text-white ${cfg.font} font-bold flex flex-col items-center justify-center leading-none`}>
        <span className="text-[11px] opacity-80 mb-0.5">👥</span>
        <span className="text-[11px] font-extrabold">{getInitial(title)}</span>
      </AvatarFallback>
    </Avatar>
  );
}

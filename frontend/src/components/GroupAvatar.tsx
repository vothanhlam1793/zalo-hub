import { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitial } from '@/utils';
import type { Contact, GroupMember } from '@/types';

interface GroupAvatarProps {
  avatar?: string;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  members?: Array<GroupMember | Contact | { avatar?: string; displayName?: string; name?: string; userId?: string }>;
  memberAvatars?: string[];
  contacts?: Contact[];
  memberCount?: number;
  className?: string;
}

const SIZE_MAP = {
  sm: { container: 'w-8 h-8', cell: 'w-3.5 h-3.5 text-[8px]', font: 'text-xs', gap: 'gap-[1px]', p: 'p-[1px]' },
  md: { container: 'w-[42px] h-[42px]', cell: 'w-[19px] h-[19px] text-[9px]', font: 'text-base', gap: 'gap-[1.5px]', p: 'p-[1.5px]' },
  lg: { container: 'w-12 h-12', cell: 'w-[21px] h-[21px] text-[10px]', font: 'text-lg', gap: 'gap-[1.5px]', p: 'p-[1.5px]' },
  xl: { container: 'w-16 h-16', cell: 'w-7 h-7 text-xs', font: 'text-xl', gap: 'gap-[2px]', p: 'p-[2px]' },
};

const DEFAULT_PALETTE = [
  { bg: 'bg-blue-500', text: 'text-white', from: 'from-blue-500 to-indigo-600' },
  { bg: 'bg-emerald-500', text: 'text-white', from: 'from-emerald-500 to-teal-600' },
  { bg: 'bg-amber-500', text: 'text-white', from: 'from-amber-500 to-orange-600' },
  { bg: 'bg-purple-500', text: 'text-white', from: 'from-purple-500 to-pink-600' },
];

export function GroupAvatar({
  avatar,
  title,
  size = 'md',
  members = [],
  memberAvatars = [],
  contacts = [],
  memberCount,
  className = '',
}: GroupAvatarProps) {
  const cfg = SIZE_MAP[size] || SIZE_MAP.md;

  // 1. If explicit group avatar exists (like "Hội Doanh nghiệp Bình Quới"), show it directly
  if (avatar && avatar.trim() !== '') {
    return (
      <Avatar className={`${cfg.container} rounded-full shrink-0 ring-1 ring-[var(--border)] ${className}`}>
        <img src={avatar} alt={title} className="w-full h-full object-cover rounded-full" />
        <AvatarFallback className={`bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] ${cfg.font} font-bold`}>
          {getInitial(title)}
        </AvatarFallback>
      </Avatar>
    );
  }

  // 2. Resolve sub-avatars from memberAvatars first, then members and contacts lookup
  const subItems = useMemo(() => {
    const resolved: Array<{ avatar?: string; name: string }> = [];

    // Priority 1: Real member avatars passed directly from backend
    if (Array.isArray(memberAvatars) && memberAvatars.length > 0) {
      for (const av of memberAvatars) {
        if (resolved.length >= 4) break;
        if (av && av.trim() !== '') {
          resolved.push({ avatar: av, name: 'M' });
        }
      }
    }

    // Priority 2: Member object list with lookup into contacts
    if (resolved.length < 4 && Array.isArray(members) && members.length > 0) {
      const contactMap = new Map<string, Contact>();
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          if (c.userId) contactMap.set(c.userId, c);
        }
      }

      for (const m of members) {
        if (resolved.length >= 4) break;
        const uId = ('userId' in m ? m.userId : undefined) || '';
        const matchContact = uId ? contactMap.get(uId) : undefined;

        const av = m.avatar || matchContact?.avatar;
        const nm = ('displayName' in m ? m.displayName : undefined) || ('name' in m ? m.name : undefined) || matchContact?.displayName || 'U';
        
        // Avoid duplicate avatar URLs
        if (av && resolved.some((r) => r.avatar === av)) continue;
        resolved.push({ avatar: av, name: nm });
      }
    }

    // If less than 4 members are resolved, fill with deterministic stylish placeholders based on group title
    if (resolved.length < 4) {
      const words = title.split(/\s+/).filter(Boolean);
      const needed = 4 - resolved.length;
      for (let i = 0; i < needed; i++) {
        const char = words[i % words.length] ? words[i % words.length].charAt(0).toUpperCase() : String.fromCharCode(65 + i);
        resolved.push({ name: char });
      }
    }

    return resolved.slice(0, 4);
  }, [memberAvatars, members, contacts, title]);

  // 3. Zalo Style: 2x2 Circular Sub-Avatar Collage with crisp white/slate border dividers
  return (
    <div
      className={`${cfg.container} rounded-full bg-white dark:bg-slate-900 border border-[var(--border)] ${cfg.p} grid grid-cols-2 grid-rows-2 ${cfg.gap} items-center justify-items-center overflow-hidden shrink-0 shadow-2xs ${className}`}
      title={`${title}${memberCount ? ` (${memberCount} thành viên)` : ''}`}
    >
      {subItems.map((item, idx) => {
        const palette = DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
        return (
          <div
            key={idx}
            className={`${cfg.cell} rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br ${palette.from} text-white font-bold shrink-0 shadow-2xs`}
          >
            {item.avatar ? (
              <img src={item.avatar} alt={item.name} className="w-full h-full object-cover rounded-full" />
            ) : (
              <span className="leading-none select-none">{getInitial(item.name)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

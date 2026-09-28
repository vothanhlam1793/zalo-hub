import type { ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';

export function ComposerPopover({ label, icon, children, disabled, open, onOpenChange }: {
  label: string; icon: ReactNode; children: ReactNode; disabled?: boolean;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  return <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Popover.Trigger asChild><Button type="button" variant="ghost" size="icon-lg" className="rounded-xl" aria-label={label} title={label} disabled={disabled}>{icon}</Button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="top" align="start" sideOffset={8} collisionPadding={12}
      className="z-50 w-72 max-w-[calc(100vw-24px)] max-h-[min(360px,60dvh)] overflow-y-auto rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-xl outline-none">
      <h3 className="mb-2 font-semibold">{label}</h3>{children}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

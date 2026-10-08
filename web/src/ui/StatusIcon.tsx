import type { MachineStatus } from '@bakery/shared';
import { STATUS_COLOR } from './statusMeta';

/** Иконка статуса — форма различается, чтобы статус не передавался только цветом. */
export function StatusIcon({ status, size = 14 }: { status: MachineStatus; size?: number }) {
  const c = STATUS_COLOR[status];
  const common = { width: size, height: size, viewBox: '0 0 16 16', className: 'status-icon', 'aria-hidden': true } as const;
  switch (status) {
    case 'running':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M4.8 8.2l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'idle':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill={c} />
          <rect x="5.3" y="4.8" width="1.9" height="6.4" rx="0.6" fill="#3d2b00" />
          <rect x="8.8" y="4.8" width="1.9" height="6.4" rx="0.6" fill="#3d2b00" />
        </svg>
      );
    case 'alarm':
      return (
        <svg {...common}>
          <path d="M8 1.2l7 13H1z" fill={c} strokeLinejoin="round" />
          <rect x="7.1" y="5.4" width="1.8" height="4.8" rx="0.8" fill="#fff" />
          <circle cx="8" cy="12.2" r="1" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={c} strokeWidth="1.8" />
          <path d="M3.8 12.2l8.4-8.4" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

export function WarnIcon({ level }: { level: 'warning' | 'critical' }) {
  const c = level === 'critical' ? '#d03b3b' : '#fab219';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className="status-icon" aria-hidden>
      <path d="M8 1.2l7 13H1z" fill={c} />
      <rect x="7.1" y="5.4" width="1.8" height="4.8" rx="0.8" fill={level === 'critical' ? '#fff' : '#3d2b00'} />
      <circle cx="8" cy="12.2" r="1" fill={level === 'critical' ? '#fff' : '#3d2b00'} />
    </svg>
  );
}

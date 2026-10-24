import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CloseIcon = (p: IconProps) => (
  <Base {...p}><path d="M6 6l12 12M18 6L6 18" /></Base>
);
export const CheckIcon = (p: IconProps) => (
  <Base {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Base>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}><path d="M6 9l6 6 6-6" /></Base>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}><path d="M9 6l6 6-6 6" /></Base>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></Base>
);
export const ArrowDownIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" /></Base>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <Base {...p}><path d="M19 12H5M11.5 5.5L5 12l6.5 6.5" /></Base>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Base {...p}><path d="M5 12h14M12.5 5.5L19 12l-6.5 6.5" /></Base>
);
export const ChevronsUpDownIcon = (p: IconProps) => (
  <Base {...p}><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></Base>
);
export const PlusIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 5v14M5 12h14" /></Base>
);
export const TrashIcon = (p: IconProps) => (
  <Base {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Base>
);
export const InfoIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Base>
);
export const AlertIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4M12 17h.01" /></Base>
);
export const CheckCircleIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></Base>
);
export const ClockIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Base>
);
export const FileIcon = (p: IconProps) => (
  <Base {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Base>
);
export const TrendUpIcon = (p: IconProps) => (
  <Base {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Base>
);
export const TrendDownIcon = (p: IconProps) => (
  <Base {...p}><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></Base>
);
export const LightbulbIcon = (p: IconProps) => (
  <Base {...p}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></Base>
);
export const GiftIcon = (p: IconProps) => (
  <Base {...p}><path d="M4 11h16v10H4zM3 7h18v4H3zM12 7v14" /><path d="M12 7c-1.5-3-5-3.5-5-1.2C7 7 9 7 12 7zM12 7c1.5-3 5-3.5 5-1.2C17 7 15 7 12 7z" /></Base>
);
export const UserIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Base>
);
export const CpuIcon = (p: IconProps) => (
  <Base {...p}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></Base>
);
export const BriefcaseIcon = (p: IconProps) => (
  <Base {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></Base>
);
export const ShieldIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></Base>
);
export const LockIcon = (p: IconProps) => (
  <Base {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Base>
);
export const SearchIcon = (p: IconProps) => (
  <Base {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Base>
);
export const RefreshIcon = (p: IconProps) => (
  <Base {...p}><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></Base>
);
export const PenIcon = (p: IconProps) => (
  <Base {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Base>
);

/** Крутилка. Анимация задаётся через CSS-класс снаружи. */
export const SpinnerIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Base>
);

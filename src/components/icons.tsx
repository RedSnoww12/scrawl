// Inline icons: 24px tool icons and 20px property swatches.
import type { ReactNode } from 'react';

interface IconProps { d?: string; size?: number; sw?: number; children?: ReactNode }
export const Icon = ({ d, size = 24, sw = 1.7, children }: IconProps) => (
  <svg viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);

export const ToolIcons: Record<string, ReactNode> = {
  selection: <Icon d="M6 3.5l12 7-5.2 1.4L10.5 17z" />,
  hand: <Icon d="M8.5 12.5V6a1.5 1.5 0 013 0v5M11.5 11V4.5a1.5 1.5 0 013 0V11M14.5 11V6a1.5 1.5 0 013 0v7.5a6.5 6.5 0 01-6.5 6.5h-.7a6 6 0 01-5-2.7l-2.6-4a1.5 1.5 0 012.4-1.8l1.9 2" />,
  rectangle: <Icon><rect x="4" y="5.5" width="16" height="13" rx="2.5" /></Icon>,
  diamond: <Icon d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" />,
  ellipse: <Icon><ellipse cx="12" cy="12" rx="8.5" ry="6.5" /></Icon>,
  arrow: <Icon d="M5 19L19 5M10 5h9v9" />,
  line: <Icon d="M5 19L19 5" />,
  freedraw: <Icon d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5zM13.5 7l3 3" />,
  text: <Icon d="M5 7V5h14v2M12 5v14M9 19h6" />,
  image: <Icon><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20 16l-5-5-8 8" /></Icon>,
  eraser: <Icon d="M8.5 19.5l-4-4a1.5 1.5 0 010-2.1L13.4 4.5a1.5 1.5 0 012.1 0l4 4a1.5 1.5 0 010 2.1L11 19.5zM9.5 9l5.5 5.5M8.5 19.5H20" />,
  lock: <Icon><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Icon>,
  unlock: <Icon><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 017.6-1.7" /></Icon>,
};

export const UiIcons = {
  menu: <Icon d="M4 7h16M4 12h16M4 17h16" sw={1.8} />,
  chevron: <Icon d="M7 10l5 5 5-5" sw={2} />,
  close: <Icon d="M6 6l12 12M18 6L6 18" sw={1.8} />,
  minus: <Icon d="M6 12h12" sw={1.8} />,
  plus: <Icon d="M6 12h12M12 6v12" sw={1.8} />,
  undo: <Icon sw={1.8}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></Icon>,
  redo: <Icon sw={1.8}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></Icon>,
  help: <Icon sw={1.8}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01" /></Icon>,
  palette: <Icon sw={1.8}><path d="M12 3a9 9 0 100 18c1.1 0 1.6-.9 1.2-1.8-.5-1.2.2-2.4 1.5-2.4H17a4 4 0 004-4c0-5.5-4-9.8-9-9.8z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></Icon>,
  pencil: <Icon d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5z" sw={1.8} />,
  trash: <Icon d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" sw={1.8} />,
  more: <Icon sw={2.2}><path d="M6 12h.01M12 12h.01M18 12h.01" /></Icon>,
  folder: <Icon d="M3.5 7.5A1.5 1.5 0 015 6h4l2 2h8a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5z" sw={1.7} />,
  folderPlus: <Icon sw={1.7}><path d="M3.5 7.5A1.5 1.5 0 015 6h4l2 2h8a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5z" /><path d="M12 11v5M9.5 13.5h5" /></Icon>,
  share: <Icon sw={1.8}><circle cx="17.5" cy="6" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18" r="2.5" /><path d="M8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6" /></Icon>,
  link: <Icon sw={1.8}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Icon>,
  users: <Icon sw={1.8}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0M15.5 5.6a3.2 3.2 0 010 5.8M17.5 14.2A5.5 5.5 0 0120.5 19" /></Icon>,
  mail: <Icon sw={1.8}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></Icon>,
  eye: <Icon sw={1.8}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></Icon>,
};

const sv = (children: ReactNode) => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">{children}</svg>;
export const PropIcons: Record<string, ReactNode> = {
  hachure: sv(<><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3.5 10l6.5-6.5M3.5 16.5l13-13M10 16.5l6.5-6.5" /></>),
  crosshatch: sv(<><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3.5 10l6.5-6.5M3.5 16.5l13-13M10 16.5l6.5-6.5M10 3.5l6.5 6.5M3.5 3.5l13 13M3.5 10l6.5 6.5" /></>),
  solid: sv(<rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor" />),
  sw1: sv(<path d="M3 10h14" strokeWidth="1" />), sw2: sv(<path d="M3 10h14" strokeWidth="2.4" />), sw4: sv(<path d="M3 10h14" strokeWidth="4" />),
  ssSolid: sv(<path d="M3 10h14" strokeWidth="2" />), ssDashed: sv(<path d="M3 10h14" strokeWidth="2" strokeDasharray="4 3" />),
  ssDotted: sv(<path d="M3 10h14" strokeWidth="2" strokeDasharray="0.5 3.5" />),
  r0: sv(<path d="M3 14c4-1 9-6 14-8" strokeWidth="1.6" />),
  r1: sv(<path d="M3 14c4-1 9-6 14-8M3.5 13c4.5-.5 8.5-6.5 13-8" strokeWidth="1.3" />),
  r2: sv(<path d="M3 14c2 0 2-3 4-3s2 2 4 0 2-4 4-4 1 0 2-1M3.5 12.5c2.5 1 3-2.5 5-2s2.5 1 3.5-1 3-3 4.5-3.5" strokeWidth="1.3" />),
  sharp: sv(<path d="M4 16V4h12" strokeWidth="1.8" />), round: sv(<path d="M4 16V9.5A5.5 5.5 0 019.5 4H16" strokeWidth="1.8" />),
  back: sv(<path d="M10 3v10M6 9l4 4 4-4M4 17h12" strokeWidth="1.6" />), backward: sv(<path d="M10 4v12M6 12l4 4 4-4" strokeWidth="1.6" />),
  forward: sv(<path d="M10 16V4M6 8l4-4 4 4" strokeWidth="1.6" />), front: sv(<path d="M10 17V7M6 11l4-4 4 4M4 3h12" strokeWidth="1.6" />),
  dup: sv(<><rect x="7" y="7" width="10" height="10" rx="2" strokeWidth="1.6" /><path d="M13 4.5V4a1.5 1.5 0 00-1.5-1.5h-7A1.5 1.5 0 003 4v7.5A1.5 1.5 0 004.5 13H5" strokeWidth="1.6" /></>),
  del: sv(<path d="M4 6h12M8 6V4h4v2M6 6l.8 10.5h6.4L14 6" strokeWidth="1.6" strokeLinejoin="round" />),
  group: sv(<><rect x="2.5" y="2.5" width="15" height="15" rx="2" strokeDasharray="2 2" /><rect x="5.5" y="5.5" width="5" height="5" rx="1" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /></>),
  ungroup: sv(<><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></>),
};

export const GoogleG = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

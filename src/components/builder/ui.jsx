/**
 * Shared UI primitives for the DBFLOW builder — ported from the Claude Design
 * handoff. Buttons, labels, dropdowns, chips, toggles, inputs + color helpers.
 *
 * Icons are mapped from the design's string names onto lucide-react glyphs
 * (already a dependency) so step metadata can stay declarative.
 */
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Database, GitMerge, Filter, Layers, ArrowDownUp, Columns3, Play, Plus,
  Settings, Braces, X, Download, ChevronDown, ChevronUp, ChevronRight,
  Table, Search, Trash2, GripVertical, Sparkles, Users, Package, TrendingUp,
  ShoppingCart, Grid3x3, RotateCcw, UserPlus, ShieldCheck, Lock, Server,
  Check, Pencil, Copy, Zap, Factory, XCircle, ListOrdered, Globe, FolderOpen, Minus,
  AlertTriangle, Eye, EyeOff, WifiOff, Loader2, Info, Square, Upload,
} from 'lucide-react';

const ICON_MAP = {
  database: Database, merge: GitMerge, filter: Filter, funnel: Filter, layers: Layers,
  sort: ArrowDownUp, columns: Columns3, play: Play, plus: Plus, settings: Settings,
  braces: Braces, x: X, download: Download, chevronDown: ChevronDown, chevronUp: ChevronUp,
  chevronRight: ChevronRight, table: Table, search: Search, trash: Trash2, grip: GripVertical,
  sparkles: Sparkles, users: Users, package: Package, trending: TrendingUp, cart: ShoppingCart,
  grid: Grid3x3, rotate: RotateCcw, userPlus: UserPlus, shield: ShieldCheck, lock: Lock,
  server: Server, check: Check, pencil: Pencil, copy: Copy, zap: Zap, factory: Factory,
  xCircle: XCircle, listOrdered: ListOrdered, globe: Globe, folder: FolderOpen, minus: Minus,
  warning: AlertTriangle, eye: Eye, eyeOff: EyeOff, offline: WifiOff, spinner: Loader2, info: Info, stop: Square, upload: Upload,
};

export function Icon({ name, size = 16, strokeWidth = 2, style = {}, className = '' }) {
  const Cmp = ICON_MAP[name] || Database;
  const cls = name === 'spinner' ? `spin ${className}`.trim() : className;
  return <Cmp size={size} strokeWidth={strokeWidth} style={{ flexShrink: 0, ...style }} className={cls} aria-hidden="true" />;
}

/** Shared 28–30px icon-only button style (cards, panels, modals). */
export const iconBtnStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', transition: 'all .14s', flexShrink: 0 };

// ─── Color helpers ──────────────────────────────────────────────────────────
export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
export function lighten(hex) {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  r = Math.round(r + (255 - r) * 0.55); g = Math.round(g + (255 - g) * 0.55); b = Math.round(b + (255 - b) * 0.55);
  return `rgb(${r},${g},${b})`;
}

export const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, monospace";

// ─── Eyebrow (tiny uppercase wide-tracked label) ────────────────────────────
export function Eyebrow({ children, color, style = {} }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
      color: color || 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', ...style,
    }}>{children}</div>
  );
}

// ─── Button ─────────────────────────────────────────────────────────────────
export function Btn({ children, variant = 'ghost', size = 'md', icon, iconRight, onClick, style = {}, disabled, title }) {
  const [hover, setHover] = useState(false);
  const sizes = {
    sm: { padding: '6px 10px', fontSize: 12.5, gap: 6, h: 30 },
    md: { padding: '8px 14px', fontSize: 13.5, gap: 7, h: 38 },
    lg: { padding: '11px 20px', fontSize: 14.5, gap: 8, h: 46 },
  };
  const s = sizes[size];
  const variants = {
    primary: {
      background: hover ? '#2563eb' : '#3b82f6', color: '#fff', border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: hover ? '0 8px 28px -6px rgba(59,130,246,0.7)' : '0 4px 18px -6px rgba(59,130,246,0.55)',
    },
    glass: { background: hover ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.12)' },
    ghost: { background: hover ? 'rgba(255,255,255,0.06)' : 'transparent', color: hover ? '#fff' : 'rgba(255,255,255,0.62)', border: '1px solid transparent' },
    danger: { background: hover ? 'rgba(244,63,94,0.16)' : 'transparent', color: hover ? '#fb7185' : 'rgba(255,255,255,0.5)', border: '1px solid transparent' },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      disabled={disabled} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
        padding: s.padding, height: s.h, fontSize: s.fontSize, fontWeight: 550,
        borderRadius: 'calc(var(--card-radius) * 0.5)', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap',
        transition: 'all 0.16s ease', letterSpacing: '0.005em', ...variants[variant], ...style,
      }}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 17 : 15} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 17 : 15} />}
    </button>
  );
}

// ─── Chip ───────────────────────────────────────────────────────────────────
export function Chip({ children, color, onRemove, onClick, mono, style = {}, title }) {
  const [hover, setHover] = useState(false);
  const c = color || '#3b82f6';
  return (
    <span
      onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: onRemove ? '4px 6px 4px 10px' : '4px 10px',
        borderRadius: 999, fontSize: 12.5, fontWeight: 550, fontFamily: mono ? MONO : 'inherit',
        background: hexA(c, 0.13), color: lighten(c), border: `1px solid ${hexA(c, 0.28)}`,
        cursor: onClick ? 'pointer' : 'default', transition: 'all .14s ease', ...style,
      }}
    >
      {children}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{
          display: 'flex', background: hover ? hexA(c, 0.25) : 'transparent', border: 'none',
          borderRadius: 999, padding: 2, cursor: 'pointer', color: lighten(c),
        }}><Icon name="x" size={12} /></button>
      )}
    </span>
  );
}

// ─── Dropdown ───────────────────────────────────────────────────────────────
// Menu is portalled to <body> with fixed positioning so it never gets clipped
// by a card's `overflow:hidden` and never sits beneath a later card's
// backdrop-filter stacking context. Flips above the trigger when low on space.
export function Dropdown({ trigger, children, align = 'left', width = 220 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const spaceBelow = vh - r.bottom, spaceAbove = r.top;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, vw - width - 8));
    const maxH = Math.max(120, Math.min(320, (openUp ? spaceAbove : spaceBelow) - 16));
    setPos(openUp ? { left, bottom: vh - r.top + 7, maxH } : { left, top: r.bottom + 7, maxH });
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // Close on page/ancestor scroll (the fixed menu would drift), but NOT when
    // the user is scrolling inside the menu's own list.
    const onScroll = (e) => {
      if (menuRef.current && e.target && (menuRef.current === e.target || menuRef.current.contains(e.target))) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <div onClick={() => setOpen(o => !o)}>{trigger(open)}</div>
      {open && pos && createPortal(
        <div ref={menuRef} className="dd-pop" style={{
          position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width, zIndex: 1000,
          background: 'rgba(20,20,24,0.95)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 6,
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          maxHeight: pos.maxH, overflowY: 'auto',
        }}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function MenuItem({ icon, iconColor, children, onClick, active, right, mono, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={disabled ? undefined : onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9,
        cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: mono ? MONO : 'inherit',
        opacity: disabled ? 0.4 : 1,
        color: active ? '#fff' : 'rgba(255,255,255,0.78)',
        background: (hover && !disabled) ? 'rgba(255,255,255,0.07)' : (active ? 'rgba(59,130,246,0.12)' : 'transparent'),
        transition: 'background .12s',
      }}>
      {icon && <Icon name={icon} size={15} style={{ color: iconColor || 'rgba(255,255,255,0.5)' }} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {active && <Icon name="check" size={14} style={{ color: '#3b82f6' }} />}
      {disabled && <Icon name="check" size={14} style={{ color: 'rgba(255,255,255,0.45)' }} />}
      {right && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{right}</span>}
    </div>
  );
}

// ─── Text input ─────────────────────────────────────────────────────────────
export function TextField({ value, onChange, placeholder, icon, mono, type = 'text', style = {}, prefix, suffix, onKeyDown, autoComplete, inputMode, maxLength = 256, ariaLabel }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 38,
      background: 'rgba(255,255,255,0.04)', borderRadius: 10,
      border: `1px solid ${focus ? 'rgba(59,130,246,0.55)' : 'rgba(255,255,255,0.1)'}`,
      boxShadow: focus ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none', transition: 'all .15s', ...style,
    }}>
      {icon && <Icon name={icon} size={15} style={{ color: 'rgba(255,255,255,0.4)' }} />}
      {prefix && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: MONO }}>{prefix}</span>}
      <input
        type={type} value={value ?? ''} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength}
        aria-label={ariaLabel || placeholder} spellCheck={false}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13.5, fontFamily: mono ? MONO : 'inherit', minWidth: 0 }}
      />
      {suffix}
    </div>
  );
}

export function Toggle({ value, onChange, color = '#3b82f6' }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 38, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 2,
      background: value ? color : 'rgba(255,255,255,0.15)', transition: 'background .18s',
      display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start',
    }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: '#fff', transition: 'all .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
    </button>
  );
}


// ─── Modal ──────────────────────────────────────────────────────────────────
// One overlay implementation for Settings / Publish / Confirm: Esc closes,
// click on the backdrop closes, body scroll is locked, first field focused.
export function Modal({ onClose, width = 540, children, labelledBy }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus the first focusable control so keyboard users land inside
    const first = boxRef.current?.querySelector('input,select,textarea,button');
    first?.focus?.();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{
      position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="modal-in" style={{
        width: `min(${width}px, 94vw)`, maxHeight: '90vh', overflowY: 'auto', borderRadius: 22, padding: 26,
        background: 'rgba(18,18,22,0.95)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.85)',
      }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Modal header: colored icon tile + title/subtitle + close. */
export function ModalHeader({ icon, color = '#3b82f6', title, subtitle, onClose, id }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22 }}>
      <div style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(color, 0.15), border: `1px solid ${hexA(color, 0.3)}`, color: lighten(color), transition: 'all .2s', flexShrink: 0 }}>
        <Icon name={icon} size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 id={id} style={{ fontSize: 19, fontWeight: 600, margin: '0 0 3px', letterSpacing: '-0.01em' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{subtitle}</p>}
      </div>
      {onClose && <button onClick={onClose} style={iconBtnStyle} aria-label="Schließen"><Icon name="x" size={17} /></button>}
    </div>
  );
}

/** Yes/No dialog. `danger` colors the confirm button red. */
export function ConfirmDialog({ title, message, confirmLabel = 'Bestätigen', cancelLabel = 'Abbrechen', danger, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} width={420} labelledBy="confirm-title">
      <ModalHeader id="confirm-title" icon={danger ? 'warning' : 'info'} color={danger ? '#f43f5e' : '#3b82f6'} title={title} subtitle={message} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn variant="ghost" onClick={onCancel}>{cancelLabel}</Btn>
        <Btn variant="primary" onClick={onConfirm} style={danger ? { background: '#e11d48', boxShadow: '0 4px 18px -6px rgba(244,63,94,0.6)' } : {}}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

// ─── Notice (inline banner) ─────────────────────────────────────────────────
const NOTICE = {
  info:    { color: '#3b82f6', icon: 'info' },
  warning: { color: '#f59e0b', icon: 'warning' },
  error:   { color: '#f43f5e', icon: 'xCircle' },
  success: { color: '#10b981', icon: 'check' },
  offline: { color: '#f59e0b', icon: 'offline' },
};
export function Notice({ kind = 'info', title, children, action, style = {} }) {
  const n = NOTICE[kind] || NOTICE.info;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12,
      background: hexA(n.color, 0.09), border: `1px solid ${hexA(n.color, 0.28)}`, color: 'rgba(255,255,255,0.85)', fontSize: 12.5, lineHeight: 1.45, ...style,
    }}>
      <Icon name={n.icon} size={15} style={{ color: lighten(n.color), marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 600, color: lighten(n.color), marginBottom: children ? 2 : 0 }}>{title}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

/** Inline code (commands in hints). */
export function Code({ children }) {
  return <code style={{ fontFamily: MONO, fontSize: 12, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>{children}</code>;
}

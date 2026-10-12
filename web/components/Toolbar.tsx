'use client';

import {
  ArrowRight,
  Bold,
  ChevronDown,
  Circle,
  CircleX,
  Copy,
  Diamond,
  Eraser,
  Hexagon,
  Italic,
  Minus,
  MousePointer2,
  Palette,
  Pencil,
  Pentagon,
  Pipette,
  Redo2,
  Square,
  Star,
  Trash2,
  Triangle,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react';
import { useUI, type ShapeKind, type Tool } from '../store/ui';

const COLOR_COLUMNS = [
  {
    name: 'Slate',
    shades: [
      '#111827',
      '#1f2937',
      '#374151',
      '#4b5563',
      '#6b7280',
      '#9ca3af',
    ],
  },
  {
    name: 'Red',
    shades: [
      '#7f1d1d',
      '#b91c1c',
      '#dc2626',
      '#ef4444',
      '#f87171',
      '#fca5a5',
    ],
  },
  {
    name: 'Amber',
    shades: [
      '#78350f',
      '#92400e',
      '#b45309',
      '#d97706',
      '#f59e0b',
      '#fbbf24',
    ],
  },
  {
    name: 'Green',
    shades: [
      '#064e3b',
      '#065f46',
      '#047857',
      '#059669',
      '#10b981',
      '#6ee7b7',
    ],
  },
  {
    name: 'Cyan',
    shades: [
      '#164e63',
      '#155e75',
      '#0e7490',
      '#0891b2',
      '#06b6d4',
      '#67e8f9',
    ],
  },
  {
    name: 'Blue',
    shades: [
      '#1e3a8a',
      '#1e40af',
      '#1d4ed8',
      '#2563eb',
      '#3b82f6',
      '#93c5fd',
    ],
  },
  {
    name: 'Violet',
    shades: [
      '#4c1d95',
      '#5b21b6',
      '#6d28d9',
      '#7c3aed',
      '#8b5cf6',
      '#c4b5fd',
    ],
  },
  {
    name: 'Pink',
    shades: [
      '#831843',
      '#9d174d',
      '#be185d',
      '#db2777',
      '#ec4899',
      '#f9a8d4',
    ],
  },
];

const FONT_OPTIONS = [
  {
    label: 'Inter',
    value: 'Inter, system-ui, sans-serif',
  },
  {
    label: 'Arial',
    value: 'Arial, sans-serif',
  },
  {
    label: 'Helvetica',
    value: 'Helvetica, Arial, sans-serif',
  },
  {
    label: 'Georgia',
    value: 'Georgia, serif',
  },
  {
    label: 'Times New Roman',
    value: "'Times New Roman', Times, serif",
  },
  {
    label: 'Courier New',
    value: "'Courier New', Courier, monospace",
  },
  {
    label: 'Monospace',
    value: 'monospace',
  },
];

const TEXT_SIZES = [
  12,
  14,
  16,
  18,
  20,
  24,
  28,
  32,
  40,
  48,
  56,
  64,
  72,
];

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type ToolDefinition = {
  id: Exclude<Tool, 'shape'>;
  label: string;
  shortcut: string;
  icon: IconComponent;
};

type ShapeDefinition = {
  id: ShapeKind;
  label: string;
  icon: IconComponent;
};

const TOOLS: ToolDefinition[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'V',
    icon: MousePointer2,
  },
  {
    id: 'pen',
    label: 'Pen',
    shortcut: 'P',
    icon: Pencil,
  },
  {
    id: 'eraser',
    label: 'Eraser',
    shortcut: 'E',
    icon: Eraser,
  },
  {
    id: 'text',
    label: 'Text',
    shortcut: 'T',
    icon: Type,
  },
];

const SHAPES: ShapeDefinition[] = [
  {
    id: 'rect',
    label: 'Rectangle',
    icon: Square,
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    icon: Circle,
  },
  {
    id: 'line',
    label: 'Line',
    icon: Minus,
  },
  {
    id: 'arrow',
    label: 'Arrow',
    icon: ArrowRight,
  },
  {
    id: 'triangle',
    label: 'Triangle',
    icon: Triangle,
  },
  {
    id: 'diamond',
    label: 'Diamond',
    icon: Diamond,
  },
  {
    id: 'star',
    label: 'Star',
    icon: Star,
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    icon: Hexagon,
  },
  {
    id: 'pentagon',
    label: 'Pentagon',
    icon: Pentagon,
  },
];

const iconButtonBase =
  'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] transition-colors duration-150 focus-visible:outline-offset-2';

const iconButtonNeutral =
  `${iconButtonBase} text-[#596170] hover:bg-[#f3f4f6] hover:text-[#20242a]`;

const iconButtonActive =
  `${iconButtonBase} bg-[#eef4ff] text-[#2563eb]`;

function FlyingArrowIcon({
  size = 20,
}: {
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="
          M4.2 21
          C5.9 14.9 9.1 10.3 13.7 7.5
          L7.8 9.5
          C7.1 9.75 6.65 8.8 7.3 8.35
          L20.25 3.05
          C20.95 2.75 21.65 3.35 21.5 4.1
          L18.95 18.45
          C18.8 19.25 17.75 19.45 17.3 18.75
          L13.95 13.25
          C10.65 15.45 8.25 18.3 6.55 21.65
          C6.05 22.65 4.8 22.25 4.2 21
          Z
        "
        fill="currentColor"
      />
    </svg>
  );
}

function emit(name: string) {
  window.dispatchEvent(new CustomEvent(name));
}

function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]')
  );
}

function Tooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="group relative flex">
      {children}

      <div
        role="tooltip"
        className="
          pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[80]
          -translate-x-1/2 whitespace-nowrap rounded-[6px]
          bg-[#20242a] px-2 py-1 text-[11px] font-medium text-white
          opacity-0 shadow-sm transition-opacity duration-150
          group-hover:opacity-100 group-focus-within:opacity-100
        "
      >
        {label}

        <span
          aria-hidden="true"
          className="
            absolute -top-1 left-1/2 h-2 w-2
            -translate-x-1/2 rotate-45 bg-[#20242a]
          "
        />
      </div>
    </div>
  );
}

export default function Toolbar() {
  const {
    tool,
    setTool,
    color,
    setColor,
    width,
    setWidth,
    textSize,
    setTextSize,
    textFontFamily,
    setTextFontFamily,
    textBold,
    setTextBold,
    textItalic,
    setTextItalic,
    textUnderline,
    setTextUnderline,
    shapeKind,
    setShapeKind,
  } = useUI();

  const [hasSelection, setHasSelection] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);

  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);

  const selectedShape =
    SHAPES.find((shape) => shape.id === shapeKind) ?? SHAPES[0];

  useEffect(() => {
    const onSelectionChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string | null }>).detail;
      setHasSelection(Boolean(detail?.id));
    };

    window.addEventListener('wb-selection-changed', onSelectionChanged);

    return () => {
      window.removeEventListener('wb-selection-changed', onSelectionChanged);
    };
  }, []);

  useEffect(() => {
    if (!shapeMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;

      if (!shapeMenuRef.current?.contains(event.target)) {
        setShapeMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShapeMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [shapeMenuOpen]);

  useEffect(() => {
    if (!colorMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;

      if (!colorMenuRef.current?.contains(event.target)) {
        setColorMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setColorMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [colorMenuOpen]);

  useEffect(() => {
    if (tool === 'select' || tool === 'eraser') {
      setColorMenuOpen(false);
    }

    if (tool !== 'text') {
      setFontMenuOpen(false);
      setFontSizeMenuOpen(false);
    }

    if (tool === 'select' || tool === 'text') {
      setSizeMenuOpen(false);
    }
  }, [tool]);

  useEffect(() => {
    if (!sizeMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;

      if (!sizeMenuRef.current?.contains(event.target)) {
        setSizeMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSizeMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [sizeMenuOpen]);

  useEffect(() => {
    if (!fontMenuOpen && !fontSizeMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;

      if (
        fontMenuOpen &&
        !fontMenuRef.current?.contains(event.target)
      ) {
        setFontMenuOpen(false);
      }

      if (
        fontSizeMenuOpen &&
        !fontSizeMenuRef.current?.contains(event.target)
      ) {
        setFontSizeMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      setFontMenuOpen(false);
      setFontSizeMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [fontMenuOpen, fontSizeMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditing(event.target)) return;

      const key = event.key.toLowerCase();

      if (hasSelection && (event.metaKey || event.ctrlKey) && key === 'd') {
        event.preventDefault();
        emit('wb-duplicate');
        return;
      }

      if (hasSelection && (key === 'delete' || key === 'backspace')) {
        event.preventDefault();
        emit('wb-delete');
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (key === 'r') {
        setTool('shape');
        return;
      }

      const shortcut = TOOLS.find(
        (entry) => entry.shortcut.toLowerCase() === key
      );

      if (shortcut) {
        setTool(shortcut.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSelection, setTool]);

  const selectShape = (nextShape: ShapeKind) => {
    setShapeKind(nextShape);
    setTool('shape');
    setShapeMenuOpen(false);
  };

  const ShapeIcon = selectedShape.icon;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-3 xl:top-3">
      <div
        role="toolbar"
        aria-label="Whiteboard tools"
        className="
          wb-toolbar pointer-events-auto flex max-w-[calc(100vw-24px)] flex-nowrap items-center
          gap-1.5 rounded-[8px] border border-[#e5e7eb] bg-white
          px-1.5 py-1.5 text-[#20242a]
          shadow-[0_1px_4px_rgba(15,23,42,0.08)]
        "
      >
        <div className="flex items-center gap-0.5" aria-label="Drawing tools">
          {TOOLS.map((entry) => {
            const Icon = entry.icon;

            return (
              <Tooltip key={entry.id} label={entry.label}>
                <button
                  type="button"
                  aria-label={entry.label}
                  aria-pressed={tool === entry.id}
                  className={
                    tool === entry.id
                      ? iconButtonActive
                      : iconButtonNeutral
                  }
                  onClick={() => setTool(entry.id)}
                >
                  <Icon
                    aria-hidden="true"
                    width={18}
                    height={18}
                    strokeWidth={1.8}
                  />
                </button>
              </Tooltip>
            );
          })}

          <div ref={shapeMenuRef} className="relative flex">
            <Tooltip label="Shape">
              <button
                type="button"
                aria-label="Choose shape"
                aria-haspopup="menu"
                aria-expanded={shapeMenuOpen}
                aria-pressed={tool === 'shape'}
                className={
                  tool === 'shape'
                    ? `${iconButtonActive} w-auto gap-0.5 px-1.5`
                    : `${iconButtonNeutral} w-auto gap-0.5 px-1.5`
                }
                onClick={() => {
                  setTool('shape');
                  setColorMenuOpen(false);
                  setShapeMenuOpen((open) => !open);
                }}
              >
                <ShapeIcon
                  aria-hidden="true"
                  width={18}
                  height={18}
                  strokeWidth={1.8}
                />

                <ChevronDown
                  aria-hidden="true"
                  width={13}
                  height={13}
                  strokeWidth={2}
                  className={`transition-transform duration-150 ${
                    shapeMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </Tooltip>

            {shapeMenuOpen && (
              <div
                role="menu"
                aria-label="Choose a shape"
                className="
                  absolute left-0 top-[calc(100%+8px)] z-[90]
                  w-[210px] rounded-[9px] border border-[#e5e7eb] bg-white p-3
                  shadow-[0_10px_28px_rgba(15,23,42,0.12)]
                "
              >
                <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                  {SHAPES.map((shape) => {
                    const Icon = shape.icon;
                    const active = shapeKind === shape.id;

                    return (
                      <Tooltip key={shape.id} label={shape.label}>
                        <button
                          type="button"
                          role="menuitem"
                          aria-label={shape.label}
                          onClick={() => selectShape(shape.id)}
                          className={`
                            flex h-11 w-11 items-center justify-center rounded-[7px]
                            border transition-colors
                            ${
                              active
                                ? 'border-[#bfdbfe] bg-[#eaf1ff] text-[#1d4ed8]'
                                : 'border-transparent text-[#4b5563] hover:bg-[#f2f4f6] hover:text-[#20242a]'
                            }
                          `}
                        >
                          <Icon
                            aria-hidden="true"
                            width={18}
                            height={18}
                            strokeWidth={1.8}
                          />
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <span
          aria-hidden="true"
          className="mx-1 hidden h-5 w-px bg-[#e5e7eb] sm:block"
        />

        <div className="flex items-center gap-0.5" aria-label="History">
          <Tooltip label="Undo">
            <button
              type="button"
              aria-label="Undo"
              className={iconButtonNeutral}
              onClick={() => emit('wb-undo')}
            >
              <Undo2
                aria-hidden="true"
                width={18}
                height={18}
                strokeWidth={1.8}
              />
            </button>
          </Tooltip>

          <Tooltip label="Redo">
            <button
              type="button"
              aria-label="Redo"
              className={iconButtonNeutral}
              onClick={() => emit('wb-redo')}
            >
              <Redo2
                aria-hidden="true"
                width={18}
                height={18}
                strokeWidth={1.8}
              />
            </button>
          </Tooltip>
        </div>

        {hasSelection && (
          <div className="flex items-center gap-0.5 ml-0.5 pl-1">
            <Tooltip label="Duplicate">
              <button
                type="button"
                aria-label="Duplicate"
                className={iconButtonNeutral}
                onClick={() => emit('wb-duplicate')}
              >
                <Copy
                  aria-hidden="true"
                  width={17}
                  height={17}
                  strokeWidth={1.8}
                />
              </button>
            </Tooltip>

            <Tooltip label="Delete">
              <button
                type="button"
                aria-label="Delete"
                className={`${iconButtonBase} text-[#6b7280] hover:bg-[#fef3f2] hover:text-[#b42318]`}
                onClick={() => emit('wb-delete')}
              >
                <Trash2
                  aria-hidden="true"
                  width={17}
                  height={17}
                  strokeWidth={1.8}
                />
              </button>
            </Tooltip>
          </div>
        )}

        <span
          aria-hidden="true"
          className="mx-1 hidden h-5 w-px bg-[#e5e7eb] sm:block"
        />

        {(tool === 'pen' || tool === 'shape' || tool === 'text') && (
          <div
            ref={colorMenuRef}
            className="relative flex"
            aria-label="Drawing color"
          >
            <Tooltip label="Color">
              <button
                type="button"
                aria-label="Choose drawing color"
                aria-haspopup="menu"
                aria-expanded={colorMenuOpen}
                className={`${iconButtonNeutral} w-auto gap-0.5 px-1.5`}
                onClick={() => {
                  setShapeMenuOpen(false);
                  setColorMenuOpen((open) => !open);
                }}
              >
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <Palette
                    aria-hidden="true"
                    width={19}
                    height={19}
                    strokeWidth={1.8}
                  />

                  <span
                    aria-hidden="true"
                    className="
                      absolute -bottom-0.5 -right-0.5
                      h-2.5 w-2.5 rounded-full
                      border-2 border-white
                    "
                    style={{ backgroundColor: color }}
                  />
                </span>

                <ChevronDown
                  aria-hidden="true"
                  width={12}
                  height={12}
                  strokeWidth={2}
                  className={`transition-transform duration-150 ${
                    colorMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </Tooltip>

            {colorMenuOpen && (
              <div
                role="menu"
                aria-label="Choose drawing color"
                className="
                  absolute left-1/2 top-[calc(100%+8px)] z-[90]
                  w-[322px] -translate-x-1/2 rounded-[9px]
                  border border-[#e5e7eb] bg-white p-3
                  shadow-[0_12px_32px_rgba(15,23,42,0.14)]
                "
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#374151]">
                    Color
                  </span>

                  <span
                    className="
                      rounded-[5px] bg-[#f2f4f6]
                      px-2 py-1 font-mono text-[10px]
                      uppercase text-[#68717d]
                    "
                  >
                    {color}
                  </span>
                </div>

                <div className="flex justify-between gap-1.5">
                  {COLOR_COLUMNS.map((column) => (
                    <div
                      key={column.name}
                      className="flex flex-col gap-1.5"
                    >
                      {column.shades.map((value, index) => {
                        const active =
                          color.toLowerCase() === value.toLowerCase();

                        return (
                          <button
                            key={value}
                            type="button"
                            role="menuitemradio"
                            aria-label={`${column.name} ${index + 1}`}
                            aria-checked={active}
                            title={column.name}
                            onClick={() => {
                              setColor(value);
                              setColorMenuOpen(false);
                            }}
                            className={`
                              h-7 w-7 rounded-full
                              border border-black/[0.08]
                              transition-transform duration-100
                              hover:scale-110
                              ${
                                active
                                  ? 'outline-2 outline-offset-2 outline-[#2563eb]'
                                  : ''
                              }
                            `}
                            style={{
                              backgroundColor: value,
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t border-[#e2e5e9] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#68717d]">
                      Custom color
                    </span>

                    <Tooltip label="Pick custom color">
                      <label
                        className="
                          relative flex h-9 w-9 cursor-pointer
                          items-center justify-center rounded-[7px]
                          text-[#4b5563]
                          transition-colors
                          hover:bg-[#f2f4f6]
                          hover:text-[#20242a]
                        "
                      >
                        <Pipette
                          aria-hidden="true"
                          width={18}
                          height={18}
                          strokeWidth={1.8}
                        />

                        <input
                          type="color"
                          value={color}
                          onChange={(event) => setColor(event.target.value)}
                          aria-label="Pick custom color"
                          className="
                            absolute inset-0 h-full w-full
                            cursor-pointer opacity-0
                          "
                        />
                      </label>
                    </Tooltip>
                  </div>
                </div>
              </div>
            )}
          </div>

        )}

        {(tool === 'pen' || tool === 'eraser' || tool === 'shape') && (
          <div ref={sizeMenuRef} className="relative flex">
            <Tooltip
              label={
                tool === 'eraser'
                  ? 'Eraser size'
                  : tool === 'shape'
                    ? 'Shape stroke'
                    : 'Stroke width'
              }
            >
              <button
                type="button"
                aria-label={
                  tool === 'eraser'
                    ? 'Eraser size'
                    : tool === 'shape'
                      ? 'Shape stroke width'
                      : 'Pen stroke width'
                }
                aria-haspopup="menu"
                aria-expanded={sizeMenuOpen}
                className="
                  flex h-8 min-w-[46px] items-center
                  justify-center gap-1 rounded-[6px]
                  px-1.5 text-[#596170]
                  transition-colors
                  hover:bg-[#f2f4f6]
                "
                onClick={() => {
                  setShapeMenuOpen(false);
                  setColorMenuOpen(false);
                  setFontMenuOpen(false);
                  setFontSizeMenuOpen(false);
                  setSizeMenuOpen((open) => !open);
                }}
              >
                {tool === 'eraser' ? (
                  <span
                    aria-hidden="true"
                    className="
                      flex h-5 w-5 items-center justify-center
                    "
                  >
                    <span
                      className="
                        rounded-full border border-[#4b5563]
                        bg-[#f8f9fb]
                      "
                      style={{
                        width: `${Math.max(6, Math.min(16, 5 + width * 0.45))}px`,
                        height: `${Math.max(6, Math.min(16, 5 + width * 0.45))}px`,
                      }}
                    />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="
                      flex h-5 w-6 items-center justify-center
                    "
                  >
                    <span
                      className="
                        block w-6 rounded-full bg-current
                      "
                      style={{
                        height: `${Math.max(1, Math.min(6, width * 0.35))}px`,
                      }}
                    />
                  </span>
                )}

                <span className="text-[11px] tabular-nums">
                  {width}
                </span>

                <ChevronDown
                  aria-hidden="true"
                  width={11}
                  height={11}
                  strokeWidth={2}
                  className={`
                    transition-transform duration-150
                    ${
                      sizeMenuOpen
                        ? 'rotate-180'
                        : ''
                    }
                  `}
                />
              </button>
            </Tooltip>

            {sizeMenuOpen && (
              <div
                role="dialog"
                aria-label={
                  tool === 'eraser'
                    ? 'Eraser size'
                    : 'Stroke width'
                }
                className="
                  absolute left-1/2 top-[calc(100%+7px)]
                  z-[100] w-[196px] -translate-x-1/2
                  rounded-[9px]
                  border border-[#e5e7eb]
                  bg-white p-3
                  shadow-[0_10px_28px_rgba(15,23,42,0.12)]
                "
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#374151]">
                    {tool === 'eraser'
                      ? 'Eraser size'
                      : tool === 'shape'
                        ? 'Shape stroke'
                        : 'Stroke width'}
                  </span>

                  <span
                    className="
                      rounded-[5px] bg-[#f2f4f6]
                      px-2 py-1 text-[10px]
                      font-medium tabular-nums
                      text-[#68717d]
                    "
                  >
                    {width}px
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(tool === 'eraser'
                    ? [4, 10, 20]
                    : [2, 5, 10]
                  ).map((preset) => {
                    const active = width === preset;

                    return (
                      <button
                        key={preset}
                        type="button"
                        aria-label={`${preset} pixels`}
                        aria-pressed={active}
                        onClick={() => setWidth(preset)}
                        className={`
                          flex h-11 items-center justify-center
                          rounded-[7px] border
                          transition-colors
                          ${
                            active
                              ? 'border-[#bfdbfe] bg-[#eaf1ff] text-[#1d4ed8]'
                              : 'border-[#e2e5e9] text-[#4b5563] hover:bg-[#f8f9fb]'
                          }
                        `}
                      >
                        {tool === 'eraser' ? (
                          <span
                            aria-hidden="true"
                            className="
                              rounded-full border
                              border-current bg-transparent
                            "
                            style={{
                              width: `${Math.max(
                                8,
                                Math.min(22, 5 + preset * 0.7)
                              )}px`,
                              height: `${Math.max(
                                8,
                                Math.min(22, 5 + preset * 0.7)
                              )}px`,
                            }}
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="
                              block w-8 rounded-full
                              bg-current
                            "
                            style={{
                              height: `${Math.max(
                                1,
                                Math.min(7, preset * 0.5)
                              )}px`,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={width}
                    onChange={(event) =>
                      setWidth(Number(event.target.value))
                    }
                    aria-label={
                      tool === 'eraser'
                        ? 'Precise eraser size'
                        : 'Precise stroke width'
                    }
                    className="
                      h-1.5 w-full cursor-pointer
                      accent-[#2563eb]
                    "
                  />

                  <div
                    className="
                      mt-2 flex justify-between
                      text-[10px] text-[#9ca3af]
                    "
                  >
                    <span>1</span>
                    <span>24</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tool === 'text' && (
          <div
            className="
              flex items-center gap-0.5
              border-l border-[#e2e5e9] pl-1.5
            "
            aria-label="Text formatting"
          >
            <div
              ref={fontMenuRef}
              className="relative"
            >
              <button
                type="button"
                aria-label="Font family" data-wb-font-family="true"
                aria-haspopup="menu"
                aria-expanded={fontMenuOpen}
                className="
                  flex h-7 w-[100px] items-center
                  justify-between gap-2 rounded-[7px]
                  border border-[#e5e7eb] bg-white
                  px-2 text-[11px] font-medium
                  text-[#374151]
                  transition-colors
                  hover:bg-[#f8f9fb]
                "
                onClick={() => {
                  setFontSizeMenuOpen(false);
                  setShapeMenuOpen(false);
                  setColorMenuOpen(false);
                  setFontMenuOpen((open) => !open);
                }}
              >
                <span className="truncate">
                  {
                    FONT_OPTIONS.find(
                      (option) =>
                        option.value === textFontFamily
                    )?.label ?? 'Inter'
                  }
                </span>

                <ChevronDown
                  aria-hidden="true"
                  width={12}
                  height={12}
                  strokeWidth={2}
                  className={`
                    shrink-0 text-[#68717d]
                    transition-transform duration-150
                    ${
                      fontMenuOpen
                        ? 'rotate-180'
                        : ''
                    }
                  `}
                />
              </button>

              {fontMenuOpen && (
                <div
                  role="menu"
                  aria-label="Font family"
                  className="
                    absolute left-0 top-[calc(100%+6px)]
                    z-[100] w-[156px]
                    rounded-[9px]
                    border border-[#e5e7eb]
                    bg-white p-1.5
                    shadow-[0_10px_28px_rgba(15,23,42,0.12)]
                  "
                >
                  {FONT_OPTIONS.map((option) => {
                    const active =
                      option.value === textFontFamily;

                    return (
                      <button
                        key={option.label}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          setTextFontFamily(option.value);
                          setFontMenuOpen(false);
                        }}
                        className={`
                          flex h-7 w-full items-center
                          rounded-[6px] px-2
                          text-left text-[11px]
                          transition-colors
                          ${
                            active
                              ? 'bg-[#eaf1ff] text-[#1d4ed8]'
                              : 'text-[#374151] hover:bg-[#f2f4f6]'
                          }
                        `}
                        style={{
                          fontFamily: option.value,
                        }}
                      >
                        <span className="truncate">
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Tooltip label="Bold">
              <button
                type="button"
                aria-label="Bold"
                aria-pressed={textBold}
                className={`
                  flex h-7 w-7 items-center
                  justify-center rounded-[6px]
                  transition-colors
                  ${
                    textBold
                      ? 'bg-[#eaf1ff] text-[#1d4ed8]'
                      : 'text-[#4b5563] hover:bg-[#f2f4f6]'
                  }
                `}
                onClick={() => setTextBold(!textBold)}
              >
                <Bold
                  aria-hidden="true"
                  width={14}
                  height={14}
                  strokeWidth={2}
                />
              </button>
            </Tooltip>

            <Tooltip label="Italic">
              <button
                type="button"
                aria-label="Italic"
                aria-pressed={textItalic}
                className={`
                  flex h-7 w-7 items-center
                  justify-center rounded-[6px]
                  transition-colors
                  ${
                    textItalic
                      ? 'bg-[#eaf1ff] text-[#1d4ed8]'
                      : 'text-[#4b5563] hover:bg-[#f2f4f6]'
                  }
                `}
                onClick={() => setTextItalic(!textItalic)}
              >
                <Italic
                  aria-hidden="true"
                  width={14}
                  height={14}
                  strokeWidth={2}
                />
              </button>
            </Tooltip>

            <Tooltip label="Underline">
              <button
                type="button"
                aria-label="Underline"
                aria-pressed={textUnderline}
                className={`
                  flex h-7 w-7 items-center
                  justify-center rounded-[6px]
                  transition-colors
                  ${
                    textUnderline
                      ? 'bg-[#eaf1ff] text-[#1d4ed8]'
                      : 'text-[#4b5563] hover:bg-[#f2f4f6]'
                  }
                `}
                onClick={() =>
                  setTextUnderline(!textUnderline)
                }
              >
                <Underline
                  aria-hidden="true"
                  width={14}
                  height={14}
                  strokeWidth={2}
                />
              </button>
            </Tooltip>

            <div
              ref={fontSizeMenuRef}
              className="relative ml-1"
            >
              <button
                type="button"
                aria-label="Font size" data-wb-font-size="true"
                aria-haspopup="menu"
                aria-expanded={fontSizeMenuOpen}
                className="
                  flex h-7 w-[50px] items-center
                  justify-between rounded-[7px]
                  border border-[#e5e7eb]
                  bg-white px-2
                  text-[11px] font-medium
                  tabular-nums text-[#374151]
                  transition-colors
                  hover:bg-[#f8f9fb]
                "
                onClick={() => {
                  setFontMenuOpen(false);
                  setShapeMenuOpen(false);
                  setColorMenuOpen(false);
                  setFontSizeMenuOpen(
                    (open) => !open
                  );
                }}
              >
                <span>{textSize}</span>

                <ChevronDown
                  aria-hidden="true"
                  width={11}
                  height={11}
                  strokeWidth={2}
                  className={`
                    text-[#68717d]
                    transition-transform duration-150
                    ${
                      fontSizeMenuOpen
                        ? 'rotate-180'
                        : ''
                    }
                  `}
                />
              </button>

              {fontSizeMenuOpen && (
                <div
                  role="menu"
                  aria-label="Font size"
                  className="
                    absolute right-0
                    top-[calc(100%+6px)]
                    z-[100] w-[66px]
                    rounded-[9px]
                    border border-[#e5e7eb]
                    bg-white p-1.5
                    shadow-[0_10px_28px_rgba(15,23,42,0.12)]
                  "
                >
                  <div
                    className="
                      max-h-[244px]
                      overflow-y-auto
                    "
                  >
                    {TEXT_SIZES.map((size) => {
                      const active =
                        size === textSize;

                      return (
                        <button
                          key={size}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            setTextSize(size);
                            setFontSizeMenuOpen(false);
                          }}
                          className={`
                            flex h-7 w-full
                            items-center justify-center
                            rounded-[6px]
                            text-[11px]
                            tabular-nums
                            transition-colors
                            ${
                              active
                                ? 'bg-[#eaf1ff] font-medium text-[#1d4ed8]'
                                : 'text-[#374151] hover:bg-[#f2f4f6]'
                            }
                          `}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-0.5 ml-0.5 pl-1">
          <Tooltip label="Export">
            <button
              type="button"
              aria-label="Export"
              className={iconButtonNeutral}
              onClick={() => emit('wb-export')}
            >
              <FlyingArrowIcon size={21} />
            </button>
          </Tooltip>

          <Tooltip label="Clear board">
            <button
              type="button"
              aria-label="Clear board"
              className={`${iconButtonBase} text-[#6b7280] hover:bg-[#fef3f2] hover:text-[#b42318]`}
              onClick={() => emit('wb-clear')}
            >
              <CircleX
                aria-hidden="true"
                width={18}
                height={18}
                strokeWidth={1.8}
              />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import { useUI } from '../store/ui';

const COLORS = ['#22d3ee','#a78bfa','#60a5fa','#34d399','#f472b6','#f59e0b','#ef4444','#ffffff','#000000'];

export default function Toolbar() {
  const {
    tool, setTool,
    color, setColor,
    width, setWidth,
    shapeKind, setShapeKind,
  } = useUI();

  // local selection presence, driven by custom event from Whiteboard
  const [hasSelection, setHasSelection] = useState(false);

  // listen to selection changes from Whiteboard
  useEffect(() => {
    const onSelChange = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string | null }>).detail;
      setHasSelection(Boolean(detail?.id));
    };
    window.addEventListener('wb-selection-changed', onSelChange as any);
    return () => window.removeEventListener('wb-selection-changed', onSelChange as any);
  }, []);

  // keyboard: V/P/E/R + (when selection) Cmd/Ctrl+D duplicate, Delete/Backspace delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 'p') setTool('pen');
      else if (k === 'e') setTool('eraser');
      else if (k === 'r') setTool('shape');

      if (hasSelection) {
        const isMac = navigator.platform.toLowerCase().includes('mac');
        const mod = isMac ? e.metaKey : e.ctrlKey;

        if (mod && k === 'd') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('wb-duplicate'));
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('wb-delete'));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool, hasSelection]);

  const triggerDuplicate = useCallback(
    () => window.dispatchEvent(new CustomEvent('wb-duplicate')),
    []
  );
  const triggerDelete = useCallback(
    () => window.dispatchEvent(new CustomEvent('wb-delete')),
    []
  );

  const shapeDisabled = tool !== 'shape';
  const btn = (active: boolean) =>
    `px-3 py-1 rounded ${active ? 'bg-blue-600' : 'bg-neutral-700'} transition`;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50
                 w-[min(1400px,98vw)] rounded-xl bg-neutral-800/90 text-white
                 px-3 py-2 shadow-lg overflow-x-auto"
    >
      <div className="flex items-center gap-3 w-max min-w-full whitespace-nowrap pr-2">
        {/* Tools */}
        <div className="flex items-center gap-2">
          <button className={btn(tool==='select')} onClick={() => setTool('select')} title="Select/Move (V)" aria-label="Select">Select</button>
          <button className={btn(tool==='pen')}    onClick={() => setTool('pen')}    title="Pen (P)"         aria-label="Pen">Pen</button>
          <button className={btn(tool==='eraser')} onClick={() => setTool('eraser')} title="Eraser (E)"      aria-label="Eraser">Eraser</button>

          {/* Shape + dropdown */}
          <div className="flex items-center gap-1">
            <button
              className={btn(tool==='shape')}
              onClick={() => setTool('shape')}
              title="Add Shape (R)"
              aria-label="Shape"
            >
              Shape
            </button>
            <select
              value={shapeKind}
              onChange={(e) => setShapeKind(e.target.value as any)}
              className={`rounded px-2 py-1 text-sm outline-none ${shapeDisabled ? 'bg-neutral-700/50 text-white/50 cursor-not-allowed' : 'bg-neutral-700'}`}
              title="Choose shape"
              disabled={shapeDisabled}
              aria-label="Shape type"
            >
              <option value="rect">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="arrow">Arrow</option>
              <option value="text">Text</option>
            </select>
          </div>

          {/* Undo / Redo */}
          <button
            className="px-3 py-1 rounded bg-neutral-700"
            onClick={() => window.dispatchEvent(new CustomEvent('wb-undo'))}
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            Undo
          </button>
          <button
            className="px-3 py-1 rounded bg-neutral-700"
            onClick={() => window.dispatchEvent(new CustomEvent('wb-redo'))}
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
          >
            Redo
          </button>
        </div>

        {/* Selection actions — only visible when something is selected */}
        {hasSelection && (
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded bg-neutral-700"
              onClick={triggerDuplicate}
              title="Duplicate (⌘/Ctrl+D)"
              aria-label="Duplicate selected"
            >
              Duplicate
            </button>
            <button
              className="px-3 py-1 rounded bg-red-700"
              onClick={triggerDelete}
              title="Delete (Delete/Backspace)"
              aria-label="Delete selected"
            >
              Delete
            </button>
          </div>
        )}

        {/* Colors */}
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-6 h-6 rounded-full border border-white/30"
              style={{ background: c, outline: color===c ? '2px solid #fff' : 'none' }}
              title={c}
              aria-label={`Color ${c}`}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-6 bg-transparent"
            title="Custom color"
            aria-label="Custom color"
          />
        </div>

        {/* Width */}
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">Width</span>
          <input
            type="range"
            min={1}
            max={24}
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value))}
            aria-label="Stroke width"
          />
          <div className="w-8 text-center text-xs">{width}</div>
        </div>

        {/* Right end: Clear + Export */}
        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-3 py-1 rounded bg-red-600"
            onClick={() => window.dispatchEvent(new CustomEvent('wb-clear'))}
            title="Clear board (everyone)"
            aria-label="Clear"
          >
            Clear
          </button>
          <button
            className="px-3 py-1 rounded bg-emerald-600"
            onClick={() => window.dispatchEvent(new CustomEvent('wb-export'))}
            title="Export PNG"
            aria-label="Export PNG"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

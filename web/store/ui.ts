import { create } from 'zustand';

import type {
  ShapeItem,
  ShapeKind,
  Stroke,
} from '../types/whiteboard';

export type { ShapeKind } from '../types/whiteboard';

export type Tool = 'pen' | 'eraser' | 'shape' | 'text' | 'select';
type Snapshot = {
  strokes: Stroke[];
  shapes: ShapeItem[];
};

const MAX_STACK = 50;

type UIState = {
  tool: Tool;
  color: string;
  width: number;
  textSize: number;
  textFontFamily: string;
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  shapeKind: ShapeKind;

  // NEW: selection in global store
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  setTool: (t: Tool) => void;
  setColor: (c: string) => void;
  setWidth: (w: number) => void;
  setTextSize: (size: number) => void;
  setTextFontFamily: (family: string) => void;
  setTextBold: (enabled: boolean) => void;
  setTextItalic: (enabled: boolean) => void;
  setTextUnderline: (enabled: boolean) => void;
  setShapeKind: (k: ShapeKind) => void;

  undoStack: Snapshot[];
  redoStack: Snapshot[];
  pushUndo: (snap: Snapshot) => void;
  popUndo: () => Snapshot | undefined;
  pushRedo: (snap: Snapshot) => void;
  popRedo: () => Snapshot | undefined;
  clearRedo: () => void;
  resetHistory: () => void;
};

export const useUI = create<UIState>((set, get) => ({
  tool: 'pen',
  color: '#22d3ee',
  width: 3,
  textSize: 18,
  textFontFamily: 'Inter, system-ui, sans-serif',
  textBold: false,
  textItalic: false,
  textUnderline: false,
  shapeKind: 'rect',

  // NEW
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),

  undoStack: [],
  redoStack: [],

  setTool: (t) => set({ tool: t }),
  setColor: (c) => set({ color: c }),
  setWidth: (w) => set({ width: w }),
  setTextSize: (size) => set({ textSize: size }),
  setTextFontFamily: (family) => set({ textFontFamily: family }),
  setTextBold: (enabled) => set({ textBold: enabled }),
  setTextItalic: (enabled) => set({ textItalic: enabled }),
  setTextUnderline: (enabled) => set({ textUnderline: enabled }),
  setShapeKind: (k) => set({ shapeKind: k }),

  pushUndo: (snap) => {
    const next = [...get().undoStack, snap].slice(-MAX_STACK);
    set({ undoStack: next });
  },
  popUndo: () => {
    const stack = [...get().undoStack];
    const last = stack.pop();
    set({ undoStack: stack });
    return last;
  },
  pushRedo: (snap) => {
    const next = [...get().redoStack, snap].slice(-MAX_STACK);
    set({ redoStack: next });
  },
  popRedo: () => {
    const stack = [...get().redoStack];
    const last = stack.pop();
    set({ redoStack: stack });
    return last;
  },
  clearRedo: () => set({ redoStack: [] }),
  resetHistory: () => set({ undoStack: [], redoStack: [] }),
}));

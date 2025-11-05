'use client';

import Toolbar from './Toolbar';
import { useUI } from '../store/ui';

import {
  Stage,
  Layer,
  Line,
  Label,
  Tag,
  Text as KText,
  Rect,
  Ellipse,
  Arrow,
  Transformer,
  Circle,
} from 'react-konva';
import { useEffect, useRef, useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

type Stroke = {
  id: string;
  color: string;
  width: number;
  points: number[];
  mode?: 'draw' | 'erase';
};

type CursorState = {
  x: number | null;
  y: number | null;
  color: string;
  name: string;
};

type ShapeKind = 'rect' | 'ellipse' | 'arrow' | 'text';

type ShapeItem = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: number[];
  color: string;

  // text fields
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
};

type ChatMsg = {
  id: string;
  user: string;
  text: string;
  color: string;
  ts: number;
};

export default function Whiteboard({ roomId }: { roomId: string }) {
  const {
    tool, color, width, shapeKind,
    pushUndo, popUndo, pushRedo, popRedo, clearRedo, setTool,
  } = useUI();

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const [size, setSize] = useState({ w: 1200, h: 800 });

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState<Stroke | null>(null);

  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [draftShape, setDraftShape] = useState<ShapeItem | null>(null);

  // selection
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // live cursors
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});

  // name + modal
  const [name, setName] = useState<string>('');
  const [askName, setAskName] = useState<boolean>(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  /** Chat state */
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [chatInput, setChatInput] = useState<string>('');
  const [unread, setUnread] = useState<number>(0);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  const yRef = useRef<{
    doc: Y.Doc;
    yStrokes: Y.Array<Y.Map<any>>;
    provider: HocuspocusProvider;
    yMessages: Y.Array<Y.Map<any>>;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** Export chooser state */
  const [exportOpen, setExportOpen] = useState<boolean>(false);

  // --------- persistence helpers (NEW) ----------
  const encode = (obj: unknown) =>
    new TextEncoder().encode(JSON.stringify(obj));
  const decode = (ab: ArrayBuffer) =>
    JSON.parse(new TextDecoder().decode(new Uint8Array(ab)));
  // ---------------------------------------------

  // stable snapshot
  const snapshot = useCallback(() => ({ strokes, shapes }), [strokes, shapes]);

  // Fit canvas
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Yjs + presence + chat setup
  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000',
      name: roomId,
      document: doc,
    });

    const yStrokes = doc.getArray<Y.Map<any>>('strokes');
    const yShapes  = doc.getArray<Y.Map<any>>('shapes');
    const yMessages = doc.getArray<Y.Map<any>>('chat');

    const syncStrokes = () => {
      const list: Stroke[] = [];
      yStrokes.forEach((m: any) => {
        list.push({
          id: m.get('id'),
          color: m.get('color'),
          width: m.get('width'),
          points: (m.get('points') as Y.Array<number>).toArray(),
          mode: m.get('mode') || 'draw',
        });
      });
      setStrokes(list);
    };

    const syncShapes = () => {
      const list: ShapeItem[] = [];
      yShapes.forEach((m: any) => {
        const kind = m.get('kind') as ShapeKind;
        if (kind === 'arrow') {
          list.push({
            id: m.get('id'),
            kind,
            x: 0, y: 0,
            points: (m.get('points') as Y.Array<number>).toArray(),
            color: m.get('color'),
          });
        } else if (kind === 'text') {
          list.push({
            id: m.get('id'),
            kind,
            x: m.get('x'),
            y: m.get('y'),
            w: m.get('w') ?? 200,
            color: m.get('color'),
            text: m.get('text') ?? 'Text',
            fontSize: m.get('fontSize') ?? 18,
            fontFamily: m.get('fontFamily') ?? 'Inter, system-ui, sans-serif',
            align: m.get('align') ?? 'left',
          });
        } else {
          list.push({
            id: m.get('id'),
            kind,
            x: m.get('x'),
            y: m.get('y'),
            w: m.get('w'),
            h: m.get('h'),
            color: m.get('color'),
          });
        }
      });
      setShapes(list);
    };

    const syncMessages = () => {
      const list: ChatMsg[] = [];
      yMessages.forEach((m: any) => {
        list.push({
          id: m.get('id'),
          user: m.get('user'),
          text: m.get('text'),
          color: m.get('color'),
          ts: m.get('ts'),
        });
      });
      setMessages(list.slice(-200)); // keep last 200
    };

    syncStrokes(); syncShapes(); syncMessages();
    yStrokes.observeDeep(syncStrokes);
    yShapes.observeDeep(syncShapes);
    yMessages.observeDeep(syncMessages);

    // Always ask on window load, prefill from localStorage
    let stored = '';
    try { stored = localStorage.getItem('wb_name') || ''; } catch {}
    setName(stored);
    setAskName(!stored);

    provider.awareness.setLocalStateField('cursor', { x: null, y: null });
    provider.awareness.setLocalStateField('name', stored || 'Guest');
    provider.awareness.setLocalStateField('color', color);

    const handleAwarenessUpdate = () => {
      const map: Record<string, CursorState> = {};
      const states = provider.awareness.getStates() as Map<number, any>;
      states.forEach((st, id) => {
        const c = st?.cursor;
        if (!c || c.x == null || c.y == null) return;
        map[String(id)] = {
          x: c.x, y: c.y,
          color: st?.color || '#22d3ee',
          name: st?.name || 'Guest',
        };
      });
      setCursors(map);
    };

    provider.awareness.on('update', handleAwarenessUpdate);
    yRef.current = { doc, yStrokes, provider, yMessages };

    return () => {
      try { provider.awareness.setLocalStateField('cursor', { x: null, y: null }); } catch {}
      yStrokes.unobserveDeep(syncStrokes);
      yShapes.unobserveDeep(syncShapes);
      yMessages.unobserveDeep(syncMessages);
      provider.awareness.off('update', handleAwarenessUpdate);
      provider.destroy();
      doc.destroy();
      yRef.current = null;
    };
  }, [roomId, color]);

  // focus name modal input
  useEffect(() => {
    if (!askName) return;
    const id = requestAnimationFrame(() => {
      const el = nameInputRef.current;
      if (el) { el.focus(); el.select(); }
    });
    return () => cancelAnimationFrame(id);
  }, [askName]);

  // keep presence color/name
  useEffect(() => {
    const prov = yRef.current?.provider;
    if (prov) prov.awareness.setLocalStateField('color', color);
  }, [color]);
  useEffect(() => {
    const prov = yRef.current?.provider;
    if (prov && name) prov.awareness.setLocalStateField('name', name);
  }, [name]);

  const saveName = () => {
    const trimmed = name.trim();
    const finalName = trimmed || 'Guest';
    try { localStorage.setItem('wb_name', finalName); } catch {}
    setName(finalName);
    yRef.current?.provider?.awareness.setLocalStateField('name', finalName);
    setAskName(false);
  };

  // --- Y writers ---
  const commitStrokeToY = (s: Stroke) => {
    const ys = yRef.current?.yStrokes;
    if (!ys) return;
    const m = new Y.Map();
    m.set('id', s.id);
    m.set('color', s.color);
    m.set('width', s.width);
    const pts = new Y.Array<number>(); pts.push(s.points);
    m.set('points', pts);
    m.set('mode', s.mode || 'draw');
    ys.push([m]);
  };

  const commitShapeToY = (s: ShapeItem) => {
    const doc = yRef.current?.doc;
    if (!doc) return;
    const yShapes = doc.getArray<Y.Map<any>>('shapes');
    const m = new Y.Map();
    m.set('id', s.id);
    m.set('kind', s.kind);
    if (s.kind === 'arrow') {
      const arr = new Y.Array<number>(); arr.push(s.points || []);
      m.set('points', arr);
    } else if (s.kind === 'text') {
      m.set('x', s.x); m.set('y', s.y);
      m.set('w', s.w ?? 200);
      m.set('text', s.text ?? 'Text');
      m.set('fontSize', s.fontSize ?? 18);
      m.set('fontFamily', s.fontFamily ?? 'Inter, system-ui, sans-serif');
      m.set('align', s.align ?? 'left');
    } else {
      m.set('x', s.x); m.set('y', s.y);
      m.set('w', s.w); m.set('h', s.h);
    }
    m.set('color', s.color);
    yShapes.push([m]);
  };

  const writeAllToY = (next: { strokes: Stroke[]; shapes: ShapeItem[] }) => {
    const doc = yRef.current?.doc;
    if (!doc) return;
    const yStrokes = doc.getArray<Y.Map<any>>('strokes');
    const yShapes  = doc.getArray<Y.Map<any>>('shapes');

    doc.transact(() => {
      yStrokes.delete(0, yStrokes.length);
      yStrokes.push(next.strokes.map(s => {
        const m = new Y.Map();
        m.set('id', s.id);
        m.set('color', s.color);
        m.set('width', s.width);
        const pts = new Y.Array<number>(); pts.push(s.points);
        m.set('points', pts);
        m.set('mode', s.mode || 'draw');
        return m;
      }));

      yShapes.delete(0, yShapes.length);
      yShapes.push(next.shapes.map(s => {
        const m = new Y.Map();
        m.set('id', s.id);
        m.set('kind', s.kind);
        if (s.kind === 'arrow') {
          const arr = new Y.Array<number>(); arr.push(s.points || []);
          m.set('points', arr);
        } else if (s.kind === 'text') {
          m.set('x', s.x); m.set('y', s.y);
          m.set('w', s.w ?? 200);
          m.set('text', s.text ?? 'Text');
          m.set('fontSize', s.fontSize ?? 18);
          m.set('fontFamily', s.fontFamily ?? 'Inter, system-ui, sans-serif');
          m.set('align', s.align ?? 'left');
        } else {
          m.set('x', s.x); m.set('y', s.y);
          m.set('w', s.w); m.set('h', s.h);
        }
        m.set('color', s.color);
        return m;
      }));
    });
  };

  // --- helpers for selection actions (toolbar + keyboard) ---
  const deleteSelected = useCallback(() => {
    if (!selectedShapeId) return;
    const exists = shapes.some(s => s.id === selectedShapeId);
    if (!exists) return;

    pushUndo(snapshot()); clearRedo();
    const nextShapes = shapes.filter(s => s.id !== selectedShapeId);
    setShapes(nextShapes);
    setSelectedShapeId(null);
    writeAllToY({ strokes, shapes: nextShapes });
  }, [selectedShapeId, shapes, strokes, pushUndo, clearRedo, snapshot]);

  const duplicateSelected = useCallback(() => {
    if (!selectedShapeId) return;
    const original = shapes.find(s => s.id === selectedShapeId);
    if (!original) return;

    const OFFSET = 12;
    const clone: ShapeItem = original.kind === 'arrow'
      ? { ...original, id: nanoid(), points: (original.points || []).map((p, i) => p + (i % 2 === 0 ? OFFSET : OFFSET)) }
      : { ...original, id: nanoid(), x: original.x + OFFSET, y: original.y + OFFSET };

    pushUndo(snapshot()); clearRedo();
    const nextShapes = [...shapes, clone];
    setShapes(nextShapes);
    setSelectedShapeId(clone.id);
    writeAllToY({ strokes, shapes: nextShapes });
  }, [selectedShapeId, shapes, strokes, pushUndo, clearRedo, snapshot]);

  // --- interactions ---
  const onMouseDown = (e: any) => {
    if (e?.evt?.button === 2) return;

    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) setSelectedShapeId(null);

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (tool === 'shape') {
      if (shapeKind === 'arrow') {
        setDraftShape({ id: nanoid(), kind: 'arrow', x: 0, y: 0, points: [pos.x, pos.y, pos.x, pos.y], color });
      } else if (shapeKind === 'text') {
        pushUndo(snapshot()); clearRedo();
        const t: ShapeItem = {
          id: nanoid(),
          kind: 'text',
          x: pos.x,
          y: pos.y,
          w: 220,
          color,
          text: 'Text',
          fontSize: 18,
          fontFamily: 'Inter, system-ui, sans-serif',
          align: 'left',
        };
        setShapes(prev => [...prev, t]);
        setSelectedShapeId(t.id);
        commitShapeToY(t);
        requestAnimationFrame(() => startEditingText(t.id));
      } else {
        setDraftShape({ id: nanoid(), kind: shapeKind, x: pos.x, y: pos.y, w: 0, h: 0, color });
      }
      return;
    }

    if (tool === 'pen' || tool === 'eraser') {
      pushUndo(snapshot()); clearRedo();
      const stroke: Stroke = {
        id: nanoid(),
        color,
        width,
        points: [pos.x, pos.y],
        mode: tool === 'eraser' ? 'erase' : 'draw',
      };
      setDrawing(stroke);
      setStrokes(prev => [...prev, stroke]);
    }
  };

  const onMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    const prov = yRef.current?.provider;
    if (prov && pos) prov.awareness.setLocalStateField('cursor', { x: pos.x, y: pos.y });

    if (!pos) return;

    if (draftShape) {
      if (draftShape.kind === 'arrow') {
        setDraftShape({ ...draftShape, points: [draftShape.points![0], draftShape.points![1], pos.x, pos.y] });
      } else {
        setDraftShape({ ...draftShape, w: pos.x - draftShape.x, h: pos.y - draftShape.y });
      }
      return;
    }

    if (!drawing) return;
    const next = { ...drawing, points: [...drawing.points, pos.x, pos.y] };
    setDrawing(next);
    setStrokes(prev => prev.map(s => (s.id === next.id ? next : s)));
  };

  const onMouseUp = () => {
    if (draftShape) {
      pushUndo(snapshot()); clearRedo();
      let finalShape = draftShape;
      if (draftShape.kind === 'rect' || draftShape.kind === 'ellipse') {
        const x = Math.min(draftShape.x, draftShape.x + (draftShape.w ?? 0));
        const y = Math.min(draftShape.y, draftShape.y + (draftShape.h ?? 0));
        const w = Math.abs(draftShape.w ?? 0);
        const h = Math.abs(draftShape.h ?? 0);
        finalShape = { ...draftShape, x, y, w, h };
      }
      setDraftShape(null);
      setShapes(prev => [...prev, finalShape]);
      commitShapeToY(finalShape);
      return;
    }

    if (!drawing) return;
    commitStrokeToY(drawing);
    setDrawing(null);
  };

  const onMouseLeave = () => {
    const prov = yRef.current?.provider;
    if (prov) prov.awareness.setLocalStateField('cursor', { x: null, y: null });
  };

  // --- keyboard: Undo/Redo + Delete + Duplicate + Nudge ---
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      // Undo
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = popUndo();
        if (prev) {
          pushRedo(snapshot());
          setStrokes(prev.strokes);
          setShapes(prev.shapes);
          writeAllToY(prev);
        }
        return;
      }

      // Redo
      if (mod && key === 'z' && e.shiftKey) {
        e.preventDefault();
        const next = popRedo();
        if (next) {
          pushUndo(snapshot());
          setStrokes(next.strokes);
          setShapes(next.shapes);
          writeAllToY(next);
        }
        return;
      }

      // Delete shape
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // Duplicate shape (Cmd/Ctrl + D)
      if (mod && key === 'd' && selectedShapeId) {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Nudge with arrow keys
      if (selectedShapeId && ['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;

        const nextShapes = shapes.map(s => {
          if (s.id !== selectedShapeId) return s;
          if (s.kind === 'arrow') {
            const pts = (s.points || []).map((p, i) => p + (i % 2 === 0 ? dx : dy));
            return { ...s, points: pts };
          }
          return { ...s, x: s.x + dx, y: s.y + dy };
        });

        pushUndo(snapshot()); clearRedo();
        setShapes(nextShapes);
        writeAllToY({ strokes, shapes: nextShapes });
      }
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [shapes, strokes, selectedShapeId, popUndo, pushRedo, popRedo, pushUndo, snapshot, deleteSelected, duplicateSelected]);

  // Toolbar Undo/Redo + Duplicate/Delete events
  useEffect(() => {
    const doUndo = () => {
      const prev = popUndo();
      if (prev) {
        pushRedo(snapshot());
        setStrokes(prev.strokes);
        setShapes(prev.shapes);
        writeAllToY(prev);
      }
    };
    const doRedo = () => {
      const next = popRedo();
      if (next) {
        pushUndo(snapshot());
        setStrokes(next.strokes);
        setShapes(next.shapes);
        writeAllToY(next);
      }
    };

    const onUndo = () => doUndo();
    const onRedo = () => doRedo();

    const onDuplicate = () => duplicateSelected();
    const onDelete = () => deleteSelected();

    window.addEventListener('wb-undo', onUndo as any);
    window.addEventListener('wb-redo', onRedo as any);
    window.addEventListener('wb-duplicate', onDuplicate as any);
    window.addEventListener('wb-delete', onDelete as any);

    return () => {
      window.removeEventListener('wb-undo', onUndo as any);
      window.removeEventListener('wb-redo', onRedo as any);
      window.removeEventListener('wb-duplicate', onDuplicate as any);
      window.removeEventListener('wb-delete', onDelete as any);
    };
  }, [snapshot, popUndo, pushRedo, popRedo, pushUndo, duplicateSelected, deleteSelected]);

  // Clear + Export
  useEffect(() => {
    const onClear = () => {
      pushUndo(snapshot());
      clearRedo();

      setStrokes([]); setShapes([]);
      setDraftShape(null);
      setSelectedShapeId(null);

      const doc = yRef.current?.doc;
      if (!doc) return;
      const yStrokes = doc.getArray<Y.Map<any>>('strokes');
      const yShapes  = doc.getArray<Y.Map<any>>('shapes');
      doc.transact(() => {
        yStrokes.delete(0, yStrokes.length);
        yShapes.delete(0, yShapes.length);
      });
    };

    const onExport = () => {
      setExportOpen(true);
    };

    const hClear = () => onClear();
    const hExport = () => onExport();

    window.addEventListener('wb-clear', hClear as any);
    window.addEventListener('wb-export', hExport as any);
    return () => {
      window.removeEventListener('wb-clear', hClear as any);
      window.removeEventListener('wb-export', hExport as any);
    };
  }, [roomId, snapshot, pushUndo, clearRedo]);

  // Attach transformer to selected (rect/ellipse/text)
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (!selectedShapeId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const stage = stageRef.current as any;
    const node = stage.findOne(`#shape-${selectedShapeId}`);
    if (node) {
      const cls = node.getClassName();
      if (cls === 'Rect' || cls === 'Ellipse' || cls === 'Text') {
        tr.nodes([node]);
      } else {
        tr.nodes([]); // Arrow uses endpoint handles
      }
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedShapeId, shapes]);

  // Broadcast selection changes so Toolbar can show/hide buttons
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('wb-selection-changed', { detail: { id: selectedShapeId } }));
  }, [selectedShapeId]);

  // Helper: click handler to select a shape without starting a new one
  const selectShape = (e: any, id: string) => {
    e.cancelBubble = true;
    setSelectedShapeId(id);
  };

  // Drag handlers
  const onRectEllipseDragEnd = (id: string, pos: { x: number; y: number }) => {
    pushUndo(snapshot()); clearRedo();
    const next = shapes.map(s => (s.id === id ? { ...s, x: pos.x, y: pos.y } : s));
    setShapes(next); writeAllToY({ strokes, shapes: next });
  };

  const onArrowDragEnd = (id: string, dx: number, dy: number) => {
    pushUndo(snapshot()); clearRedo();
    const next = shapes.map(s => {
      if (s.id !== id) return s;
      const pts = (s.points || []).map((p, i) => p + (i % 2 === 0 ? dx : dy));
      return { ...s, points: pts };
    });
    setShapes(next); writeAllToY({ strokes, shapes: next });
  };

  // Arrow endpoint drag (handles)
  const onArrowHandleDrag = (id: string, handle: 'start' | 'end', x: number, y: number) => {
    setShapes(prev => prev.map(s => {
      if (s.id !== id) return s;
      const pts = [...(s.points || [])];
      if (handle === 'start') {
        pts[0] = x; pts[1] = y;
      } else {
        pts[2] = x; pts[3] = y;
      }
      return { ...s, points: pts };
    }));
  };
  const onArrowHandleDragEnd = () => {
    pushUndo(snapshot()); clearRedo();
    writeAllToY({ strokes, shapes });
  };

  /** Chat: auto-scroll & unread when collapsed */
  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
    if (!chatOpen && messages.length > 0) {
      const last = messages[messages.length - 1];
      if ((name || 'Guest') !== last.user) setUnread(u => u + 1);
    }
  }, [messages, chatOpen, name]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    const yMessages = yRef.current?.yMessages;
    if (!yMessages) return;
    const m = new Y.Map();
    m.set('id', nanoid());
    m.set('user', name || 'Guest');
    m.set('text', text);
    m.set('color', color);
    m.set('ts', Date.now());
    yMessages.push([m]);
    setChatInput('');
  };

  // Text editing helpers
  const startEditingText = (id: string) => {
    setSelectedShapeId(id);
    setEditingTextId(id);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const v = ta.value || '';
      try { ta.setSelectionRange(v.length, v.length); } catch {}
    });
  };

  const stopEditingText = (commit: boolean) => {
    const id = editingTextId;
    setEditingTextId(null);
    if (!commit || !id) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const val = (ta.value ?? '').trimEnd();
    const target = shapes.find(s => s.id === id && s.kind === 'text');
    if (!target) return;
    if (val === (target.text ?? '')) return;

    pushUndo(snapshot()); clearRedo();
    const next = shapes.map(s => s.id === id ? { ...s, text: val || 'Text' } : s);
    setShapes(next); writeAllToY({ strokes, shapes: next });
  };

  /** Export helpers (download) */
  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const exportPNG = () => {
    const stage: any = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', quality: 1, pixelRatio: 2 });
    downloadDataUrl(dataUrl, `whiteboard-${roomId}.png`);
    setExportOpen(false);
  };

  const exportJPEG = () => {
    const stage: any = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/jpeg', quality: 1, pixelRatio: 2 });
    downloadDataUrl(dataUrl, `whiteboard-${roomId}.jpg`);
    setExportOpen(false);
  };

  const exportJSON = () => {
    const stage: any = stageRef.current;
    if (!stage) return;
    const json = stage.toJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${roomId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  /** Upload/share helpers (to /api/boards/[roomId]) */
  const uploadBytes = async (bytes: ArrayBuffer, mime: string, filename: string) => {
    const res = await fetch(`/api/boards/${roomId}`, {
      method: 'POST',
      headers: {
        'Content-Type': mime,
        'X-Filename': filename,
      },
      body: bytes,
    });
    if (!res.ok) throw new Error('Upload failed');
    const link = `${location.origin}/api/boards/${roomId}`;
    alert(`Uploaded! Share this link:\n${link}`);
    setExportOpen(false);
  };

  const uploadPNG = async () => {
    const stage: any = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', quality: 1, pixelRatio: 2 });
    const buf = await (await fetch(dataUrl)).arrayBuffer();
    await uploadBytes(buf, 'image/png', `whiteboard-${roomId}.png`);
  };

  const uploadJPEG = async () => {
    const stage: any = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ mimeType: 'image/jpeg', quality: 1, pixelRatio: 2 });
    const buf = await (await fetch(dataUrl)).arrayBuffer();
    await uploadBytes(buf, 'image/jpeg', `whiteboard-${roomId}.jpg`);
  };

  const uploadJSON = async () => {
    const stage: any = stageRef.current;
    if (!stage) return;
    const json = stage.toJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const buf = await blob.arrayBuffer();
    await uploadBytes(buf, 'application/json', `whiteboard-${roomId}.json`);
  };

  // --------- PERSISTENCE: save + restore (NEW) ----------

  // Save the logical board (strokes + shapes) to API
  const saveBoard = async () => {
    try {
      const data = { version: 1, ...snapshot() };
      const bytes = encode(data);
      await fetch(`/api/boards/${roomId}`, { method: 'POST', body: bytes });
      // no UI toast; silent autosave
    } catch (e) {
      console.warn('Save failed', e);
    }
  };

  // Debounced autosave whenever content changes
  useEffect(() => {
    const id = setTimeout(() => { void saveBoard(); }, 800);
    return () => clearTimeout(id);
  }, [strokes, shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore board on mount if exists
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await fetch(`/api/boards/${roomId}?format=json`).then(r => r.json());
        if (!meta?.exists) return;
        const buf = await fetch(`/api/boards/${roomId}`).then(r => r.arrayBuffer());
        if (cancelled) return;
        const saved = decode(buf) as { version: number; strokes: Stroke[]; shapes: ShapeItem[] };
        if (saved?.version === 1 && Array.isArray(saved.strokes) && Array.isArray(saved.shapes)) {
          setStrokes(saved.strokes);
          setShapes(saved.shapes);
        }
      } catch (e) {
        console.warn('Load failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [roomId]);
  // ------------------------------------------------------

  // (Optional) manual save trigger from Toolbar
  useEffect(() => {
    const onSave = () => { void saveBoard(); };
    window.addEventListener('wb-save', onSave as any);
    return () => window.removeEventListener('wb-save', onSave as any);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-screen h-screen bg-neutral-900 text-neutral-100">
      <Toolbar />

      {/* username modal */}
      {askName && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="w-[min(90vw,420px)] rounded-2xl bg-neutral-800 p-5 text-white shadow-xl border border-white/10">
            <h2 className="text-lg font-semibold mb-3">Pick a display name</h2>
            <p className="text-sm opacity-80">This name will be shown next to your cursor to other collaborators.</p>
            <input
              ref={nameInputRef}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
              placeholder="e.g., Ada-42"
              className="mt-3 w-full rounded-md bg-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1 rounded bg-neutral-700" onClick={() => { setAskName(false); }}>Later</button>
              <button className="px-3 py-1 rounded bg-blue-600" onClick={saveName}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Export chooser modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="w-[min(90vw,360px)] rounded-2xl bg-neutral-800 p-5 text-white shadow-xl border border-white/10">
            <h2 className="text-lg font-semibold mb-3">Export board</h2>
            <p className="text-sm opacity-80 mb-4">Choose a format to download or upload to share.</p>

            {/* Download section */}
            <div className="text-xs uppercase tracking-wide opacity-70 mb-2">Download</div>
            <div className="grid gap-2 mb-4">
              <button
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-left"
                onClick={exportPNG}
              >
                PNG (high quality)
              </button>
              <button
                className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-left"
                onClick={exportJPEG}
              >
                JPEG
              </button>
              <button
                className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-left"
                onClick={exportJSON}
              >
                JSON (re-importable)
              </button>
            </div>

            {/* Upload/share section */}
            <div className="text-xs uppercase tracking-wide opacity-70 mb-2">Share (upload)</div>
            <div className="grid gap-2">
              <button
                className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-left"
                onClick={uploadPNG}
              >
                Upload PNG & get link
              </button>
              <button
                className="px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 text-left"
                onClick={uploadJPEG}
              >
                Upload JPEG & get link
              </button>
              <button
                className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-left"
                onClick={uploadJSON}
              >
                Upload JSON & get link
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button className="px-3 py-1 rounded bg-neutral-700" onClick={() => setExportOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board area wrapper */}
      <div ref={containerRef} className="relative w-full h-full">
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          style={{ cursor: tool === 'shape' ? 'crosshair' : 'default' }}
        >
          {/* strokes */}
          <Layer>
            {strokes.map((s) => (
              <Line
                key={s.id}
                points={s.points}
                stroke={s.color}
                strokeWidth={s.width}
                lineCap="round"
                lineJoin="round"
                tension={0.4}
                globalCompositeOperation={s.mode === 'erase' ? 'destination-out' : 'source-over'}
              />
            ))}
          </Layer>

          {/* shapes (committed) + draft preview */}
          <Layer>
            {shapes.map((s) => {
              const isSel = selectedShapeId === s.id;

              if (s.kind === 'rect') {
                const x = Math.min(s.x, s.x + (s.w ?? 0));
                const y = Math.min(s.y, s.y + (s.h ?? 0));
                const w = Math.abs(s.w ?? 0);
                const h = Math.abs(s.h ?? 0);
                return (
                  <Rect
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={s.color}
                    cornerRadius={6}
                    stroke={isSel ? '#ffffff' : undefined}
                    strokeWidth={isSel ? 1.5 : 0}
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={tool === 'select' && isSel}
                    onDragEnd={(e) => onRectEllipseDragEnd(s.id, e.target.position())}
                  />
                );
              }

              if (s.kind === 'ellipse') {
                const cx = s.x + (s.w! / 2);
                const cy = s.y + (s.h! / 2);
                const rx = Math.abs(s.w! / 2);
                const ry = Math.abs(s.h! / 2);
                return (
                  <Ellipse
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={cx}
                    y={cy}
                    radiusX={rx}
                    radiusY={ry}
                    fill={s.color}
                    stroke={isSel ? '#ffffff' : undefined}
                    strokeWidth={isSel ? 1.5 : 0}
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={tool === 'select' && isSel}
                    onDragEnd={(e) => {
                      const pos = e.target.position();
                      const newX = pos.x - rx;
                      const newY = pos.y - ry;
                      onRectEllipseDragEnd(s.id, { x: newX, y: newY });
                    }}
                  />
                );
              }

              if (s.kind === 'text') {
                return (
                  <KText
                    id={`shape-${s.id}`}
                    key={s.id}
                    x={s.x}
                    y={s.y}
                    width={s.w ?? 220}
                    text={s.text ?? 'Text'}
                    fontSize={s.fontSize ?? 18}
                    fontFamily={s.fontFamily ?? 'Inter, system-ui, sans-serif'}
                    fill={s.color}
                    align={s.align ?? 'left'}
                    listening
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={tool === 'select' && selectedShapeId === s.id}
                    onDblClick={() => startEditingText(s.id)}
                    onDblTap={() => startEditingText(s.id)}
                    onDragEnd={(e) => {
                      pushUndo(snapshot()); clearRedo();
                      const pos = e.target.position();
                      const next = shapes.map(sh => sh.id === s.id ? { ...sh, x: pos.x, y: pos.y } : sh);
                      setShapes(next); writeAllToY({ strokes, shapes: next });
                    }}
                  />
                );
              }

              // arrow
              const pts = s.points!;
              const isDraggable = tool === 'select' && isSel;
              return (
                <>
                  <Arrow
                    id={`shape-${s.id}`}
                    key={s.id}
                    points={pts}
                    stroke={s.color}
                    strokeWidth={Math.max(2, width)}
                    pointerLength={10}
                    pointerWidth={10}
                    dash={isSel ? [6, 4] : undefined}
                    onMouseDown={(e) => selectShape(e, s.id)}
                    draggable={isDraggable}
                    onDragEnd={(e) => {
                      const { x: dx, y: dy } = e.target._lastPos || { x: 0, y: 0 };
                      onArrowDragEnd(s.id, dx, dy);
                    }}
                    onDragMove={(e) => {
                      const { x: dx, y: dy } = e.target.position();
                      setShapes(prev => prev.map(sh => {
                        if (sh.id !== s.id) return sh;
                        const moved = (sh.points || []).map((p, i) => p + (i % 2 === 0 ? dx : dy));
                        return { ...sh, points: moved };
                      }));
                      e.target.position({ x: 0, y: 0 });
                    }}
                  />
                  {isSel && tool === 'select' && (
                    <>
                      {/* start handle */}
                      <Circle
                        x={pts[0]}
                        y={pts[1]}
                        radius={6}
                        fill="#fff"
                        stroke="#000"
                        strokeWidth={1}
                        draggable
                        onDragMove={(e) => onArrowHandleDrag(s.id, 'start', e.target.x(), e.target.y())}
                        onDragEnd={onArrowHandleDragEnd}
                      />
                      {/* end handle */}
                      <Circle
                        x={pts[2]}
                        y={pts[3]}
                        radius={6}
                        fill="#fff"
                        stroke="#000"
                        strokeWidth={1}
                        draggable
                        onDragMove={(e) => onArrowHandleDrag(s.id, 'end', e.target.x(), e.target.y())}
                        onDragEnd={onArrowHandleDragEnd}
                      />
                    </>
                  )}
                </>
              );
            })}

            {draftShape && (
              draftShape.kind === 'rect' ? (
                (() => {
                  const x = Math.min(draftShape.x, draftShape.x + (draftShape.w ?? 0));
                  const y = Math.min(draftShape.y, draftShape.y + (draftShape.h ?? 0));
                  const w = Math.abs(draftShape.w ?? 0);
                  const h = Math.abs(draftShape.h ?? 0);
                  return <Rect x={x} y={y} width={w} height={h} fill={draftShape.color} opacity={0.5} cornerRadius={6} />;
                })()
              ) : draftShape.kind === 'ellipse' ? (
                <Ellipse
                  x={draftShape.x + (draftShape.w! / 2)} y={draftShape.y + (draftShape.h! / 2)}
                  radiusX={Math.abs(draftShape.w! / 2)} radiusY={Math.abs(draftShape.h! / 2)}
                  fill={draftShape.color} opacity={0.5}
                />
              ) : (
                <Arrow
                  points={draftShape.points!}
                  stroke={draftShape.color}
                  strokeWidth={Math.max(2, width)}
                  opacity={0.6}
                  pointerLength={10}
                  pointerWidth={10}
                />
              )
            )}

            {/* Transformer for rect/ellipse/text selection */}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              enabledAnchors={['top-left','top-right','bottom-left','bottom-right','left','right','top','bottom']}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 4 || newBox.height < 4) return oldBox;
                return newBox;
              }}
              onTransformEnd={() => {
                const tr = trRef.current;
                const node = tr?.nodes?.()[0];
                if (!node) return;
                const id = (node as any).id().replace('shape-','');

                if (node.getClassName() === 'Rect') {
                  const nextX = node.x();
                  const nextY = node.y();
                  const nextW = node.width() * node.scaleX();
                  const nextH = node.height() * node.scaleY();
                  node.scaleX(1); node.scaleY(1);

                  pushUndo(snapshot()); clearRedo();
                  const next = shapes.map(s => s.id === id ? { ...s, x: nextX, y: nextY, w: nextW, h: nextH } : s);
                  setShapes(next); writeAllToY({ strokes, shapes: next });
                }

                if (node.getClassName() === 'Ellipse') {
                  const cx = node.x();
                  const cy = node.y();
                  const rx = node.radiusX() * node.scaleX();
                  const ry = node.radiusY() * node.scaleY();
                  node.scaleX(1); node.scaleY(1);

                  const nextX = cx - rx;
                  const nextY = cy - ry;
                  const nextW = rx * 2;
                  const nextH = ry * 2;

                  pushUndo(snapshot()); clearRedo();
                  const next = shapes.map(s => s.id === id ? { ...s, x: nextX, y: nextY, w: nextW, h: nextH } : s);
                  setShapes(next); writeAllToY({ strokes, shapes: next });
                }

                // Convert Text scale to width
                if (node.getClassName() === 'Text') {
                  const newWidth = Math.max(40, node.width() * node.scaleX());
                  node.scaleX(1); node.scaleY(1);

                  pushUndo(snapshot()); clearRedo();
                  const next = shapes.map(s => s.id === id ? { ...s, w: newWidth } : s);
                  setShapes(next); writeAllToY({ strokes, shapes: next });
                }
              }}
            />
          </Layer>

          {/* live cursors */}
          <Layer listening={false}>
            {Object.entries(cursors).map(([id, c]) => {
              if (c.x == null || c.y == null) return null;
              return (
                <Label key={id} x={c.x + 10} y={c.y + 10}>
                  <Tag fill="rgba(0,0,0,0.7)" lineJoin="round" cornerRadius={6} stroke="white" strokeWidth={0.5} />
                  <KText text={c.name} fontSize={12} padding={6} fill="#fff" />
                </Label>
              );
            })}
          </Layer>
        </Stage>

        {/* Text editor overlay */}
        {editingTextId && (() => {
          const s = shapes.find(x => x.id === editingTextId && x.kind === 'text');
          if (!s) return null;
          const left = s.x;
          const top = s.y;
          const width = s.w ?? 220;
          return (
            <textarea
              key={editingTextId}
              ref={textareaRef}
              defaultValue={s.text ?? ''}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                minHeight: '28px',
                color: s.color,
                background: 'transparent',
                outline: 'none',
                border: '1px dashed rgba(255,255,255,0.35)',
                padding: '4px 6px',
                fontSize: (s.fontSize ?? 18) + 'px',
                fontFamily: s.fontFamily ?? 'Inter, system-ui, sans-serif',
                lineHeight: '1.2',
                whiteSpace: 'pre-wrap',
                overflow: 'hidden',
                resize: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  stopEditingText(false);
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  stopEditingText(true);
                }
              }}
              onBlur={() => stopEditingText(true)}
              autoFocus
            />
          );
        })()}

        {/* Chat dock */}
        <div className="fixed bottom-4 right-4 z-[70]">
          {!chatOpen && (
            <button
              onClick={() => { setChatOpen(true); setUnread(0); }}
              className="relative rounded-full bg-neutral-800 text-white px-4 py-2 shadow-lg border border-white/10"
              title="Open chat"
            >
              Chat
              {unread > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
                  {unread}
                </span>
              )}
            </button>
          )}

          {chatOpen && (
            <div className="w-[min(360px,92vw)] h-[420px] rounded-xl bg-neutral-800/95 text-white shadow-2xl border border-white/10 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/60 border-b border-white/10">
                <div className="font-semibold text-sm">Room chat</div>
                <button
                  className="text-xs px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
                  onClick={() => { setChatOpen(false); setUnread(0); }}
                  title="Close chat"
                >
                  Close
                </button>
              </div>

              <div ref={chatListRef} className="flex-1 overflow-auto px-3 py-2 space-y-2">
                {messages.map(m => {
                  const mine = (name || 'Guest') === m.user;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${mine ? 'bg-blue-600/80' : 'bg-neutral-700/80'}`}
                        title={new Date(m.ts).toLocaleString()}
                      >
                        <div className="text-[11px] opacity-80 mb-1" style={{ color: mine ? '#e5f2ff' : m.color }}>
                          {m.user}
                        </div>
                        <div>{m.text}</div>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <div className="text-center text-xs opacity-60 mt-6">No messages yet. Say hi! 👋</div>
                )}
              </div>

              <div className="p-2 border-t border-white/10">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  className="w-full h-20 resize-none rounded-md bg-neutral-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex justify-end pt-2">
                  <button
                    onClick={sendChat}
                    className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* End chat dock */}
      </div>
    </div>
  );
}

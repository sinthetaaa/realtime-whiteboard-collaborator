export type Stroke = {
  id: string;
  color: string;
  width: number;
  points: number[];
  mode?: 'draw' | 'erase';
};

export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'hexagon'
  | 'pentagon';

export type ShapeItemKind =
  | ShapeKind
  | 'text';

export type ShapeItem = {
  id: string;
  kind: ShapeItemKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: number[];
  color: string;

  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?:
    | 'normal'
    | 'bold'
    | 'italic'
    | 'bold italic';
  textDecoration?:
    | 'none'
    | 'underline';
  align?:
    | 'left'
    | 'center'
    | 'right';
};

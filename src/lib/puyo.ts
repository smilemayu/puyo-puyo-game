// ─── Types ───────────────────────────────────────────────────────────────────

export type PuyoColor = "red" | "green" | "blue" | "yellow" | "purple";
export const COLORS: PuyoColor[] = ["red", "green", "blue", "yellow", "purple"];

export const COLS = 6;
export const ROWS = 12;

export type Cell = PuyoColor | null;
export type Board = Cell[][];

export interface Piece {
  mainColor: PuyoColor;
  subColor: PuyoColor;
  x: number;
  y: number;
  rotation: 0 | 1 | 2 | 3; // sub offset: 0=up, 1=right, 2=down, 3=left
}

export interface PiecePair {
  mainColor: PuyoColor;
  subColor: PuyoColor;
}

export type Phase = "idle" | "playing" | "clearing" | "gameover";

export interface GameState {
  board: Board;
  currentPiece: Piece | null;
  nextPiece: PiecePair;
  clearingMask: boolean[][];
  phase: Phase;
  score: number;
  level: number;
  totalCleared: number;
  currentChain: number;
  maxChain: number;
  displayChain: number;
}

// ─── Board helpers ────────────────────────────────────────────────────────────

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function createMask(): boolean[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(false));
}

// ─── Piece helpers ────────────────────────────────────────────────────────────

export function randomColor(): PuyoColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function randomPair(): PiecePair {
  return { mainColor: randomColor(), subColor: randomColor() };
}

export function spawnPiece(pair: PiecePair): Piece {
  return { ...pair, x: 2, y: 0, rotation: 0 };
}

/** Returns [x, y] of the sub (satellite) puyo relative to main */
export function getSubXY(piece: Piece): [number, number] {
  switch (piece.rotation) {
    case 0: return [piece.x, piece.y - 1];
    case 1: return [piece.x + 1, piece.y];
    case 2: return [piece.x, piece.y + 1];
    case 3: return [piece.x - 1, piece.y];
  }
}

function cellFree(board: Board, x: number, y: number): boolean {
  if (x < 0 || x >= COLS) return false;
  if (y >= ROWS) return false;
  if (y < 0) return true; // above board is valid
  return board[y][x] === null;
}

export function pieceFits(board: Board, piece: Piece): boolean {
  const [sx, sy] = getSubXY(piece);
  return cellFree(board, piece.x, piece.y) && cellFree(board, sx, sy);
}

export function rotatePiece(board: Board, piece: Piece): Piece {
  const rot = ((piece.rotation + 1) % 4) as 0 | 1 | 2 | 3;
  for (const dx of [0, 1, -1]) {
    const candidate: Piece = { ...piece, rotation: rot, x: piece.x + dx };
    if (pieceFits(board, candidate)) return candidate;
  }
  return piece;
}

export function movePiece(board: Board, piece: Piece, dx: number, dy: number): Piece {
  const moved: Piece = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return pieceFits(board, moved) ? moved : piece;
}

export function ghostPiece(board: Board, piece: Piece): Piece {
  let g = piece;
  for (;;) {
    const lower: Piece = { ...g, y: g.y + 1 };
    if (!pieceFits(board, lower)) break;
    g = lower;
  }
  return g;
}

export function placePiece(board: Board, piece: Piece): Board {
  const b = board.map((r) => [...r]);
  const [sx, sy] = getSubXY(piece);
  if (piece.y >= 0) b[piece.y][piece.x] = piece.mainColor;
  if (sy >= 0) b[sy][sx] = piece.subColor;
  return b;
}

// ─── Board physics ────────────────────────────────────────────────────────────

export function applyGravity(board: Board): Board {
  const b = createBoard();
  for (let col = 0; col < COLS; col++) {
    let w = ROWS - 1;
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] !== null) b[w--][col] = board[row][col];
    }
  }
  return b;
}

export function findMatches(board: Board): boolean[][] {
  const visited = createMask();
  const result = createMask();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!visited[r][c] && board[r][c]) {
        const color = board[r][c];
        const group: [number, number][] = [];
        const queue: [number, number][] = [[r, c]];
        visited[r][c] = true;

        while (queue.length) {
          const [cr, cc] = queue.shift()!;
          group.push([cr, cc]);
          for (const [nr, nc] of [
            [cr - 1, cc],
            [cr + 1, cc],
            [cr, cc - 1],
            [cr, cc + 1],
          ] as [number, number][]) {
            if (
              nr >= 0 && nr < ROWS &&
              nc >= 0 && nc < COLS &&
              !visited[nr][nc] &&
              board[nr][nc] === color
            ) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }

        if (group.length >= 4) {
          for (const [gr, gc] of group) result[gr][gc] = true;
        }
      }
    }
  }
  return result;
}

export function anyMatch(mask: boolean[][]): boolean {
  return mask.some((r) => r.some(Boolean));
}

export function countMatches(mask: boolean[][]): number {
  return mask.reduce((s, r) => s + r.filter(Boolean).length, 0);
}

export function clearMatches(board: Board, mask: boolean[][]): Board {
  return board.map((r, ri) => r.map((c, ci) => (mask[ri][ci] ? null : c)));
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function calcScore(puyos: number, chain: number): number {
  const multiplier = [1, 3, 6, 10, 15, 20][Math.min(chain - 1, 5)];
  return puyos * 10 * multiplier;
}

export function dropInterval(level: number): number {
  return Math.max(80, 900 - (level - 1) * 90);
}

export function levelFor(totalCleared: number): number {
  return Math.min(10, Math.floor(totalCleared / 20) + 1);
}

export function isGameOver(board: Board, nextPair: PiecePair): boolean {
  return !pieceFits(board, spawnPiece(nextPair));
}

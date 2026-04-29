"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  applyGravity,
  anyMatch,
  calcScore,
  clearMatches,
  COLS,
  countMatches,
  createBoard,
  createMask,
  dropInterval,
  findMatches,
  GameState,
  ghostPiece,
  getSubXY,
  isGameOver,
  levelFor,
  movePiece,
  Phase,
  Piece,
  PiecePair,
  PuyoColor,
  placePiece,
  pieceFits,
  randomPair,
  rotatePiece,
  ROWS,
  spawnPiece,
} from "@/lib/puyo";

// ─── Visual config ────────────────────────────────────────────────────────────

const PUYO: Record<PuyoColor, { grad: string; glow: string; light: string }> = {
  red:    { grad: "radial-gradient(circle at 38% 32%, #ff9090, #e53e3e 55%, #7b1a1a)", glow: "#e53e3e", light: "#ff9090" },
  green:  { grad: "radial-gradient(circle at 38% 32%, #86efac, #16a34a 55%, #0a3d1f)", glow: "#16a34a", light: "#86efac" },
  blue:   { grad: "radial-gradient(circle at 38% 32%, #93c5fd, #2563eb 55%, #1e3a8a)", glow: "#2563eb", light: "#93c5fd" },
  yellow: { grad: "radial-gradient(circle at 38% 32%, #fef08a, #ca8a04 55%, #713f12)", glow: "#ca8a04", light: "#fef08a" },
  purple: { grad: "radial-gradient(circle at 38% 32%, #d8b4fe, #9333ea 55%, #4c1d95)", glow: "#9333ea", light: "#d8b4fe" },
};

// ─── State management ─────────────────────────────────────────────────────────

function makeInitial(): GameState {
  return {
    board: createBoard(),
    currentPiece: null,
    nextPiece: randomPair(),
    clearingMask: createMask(),
    phase: "idle",
    score: 0,
    level: 1,
    totalCleared: 0,
    currentChain: 0,
    maxChain: 0,
    displayChain: 0,
  };
}

// ─── Display cell type ────────────────────────────────────────────────────────

interface DisplayCell {
  color: PuyoColor | null;
  clearing: boolean;
  ghost: boolean;
  active: boolean;
}

function buildDisplay(state: GameState): DisplayCell[][] {
  const grid: DisplayCell[][] = state.board.map((row, r) =>
    row.map((color, c) => ({
      color,
      clearing: state.clearingMask[r][c],
      ghost: false,
      active: false,
    }))
  );

  if (state.currentPiece && state.phase === "playing") {
    const p = state.currentPiece;
    const g = ghostPiece(state.board, p);
    const [gsx, gsy] = getSubXY(g);
    const [sx, sy] = getSubXY(p);

    const setGhost = (y: number, x: number, color: PuyoColor) => {
      if (y >= 0 && y < ROWS && !grid[y][x].color)
        grid[y][x] = { color, clearing: false, ghost: true, active: false };
    };
    setGhost(g.y, g.x, g.mainColor);
    setGhost(gsy, gsx, g.subColor);

    const setActive = (y: number, x: number, color: PuyoColor) => {
      if (y >= 0 && y < ROWS)
        grid[y][x] = { color, clearing: false, ghost: false, active: true };
    };
    setActive(p.y, p.x, p.mainColor);
    if (sy >= 0) setActive(sy, sx, p.subColor);
  }

  return grid;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PuyoGame() {
  const stateRef = useRef<GameState>(makeInitial());
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cellSize, setCellSize] = useState(46);

  useEffect(() => {
    const update = () => setCellSize(window.innerWidth < 640 ? 36 : 46);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  function get() { return stateRef.current; }

  function set(patch: Partial<GameState>) {
    stateRef.current = { ...stateRef.current, ...patch };
    rerender();
  }

  function clearTimers() {
    if (dropTimer.current)    { clearTimeout(dropTimer.current);    dropTimer.current = null; }
    if (chainTimer.current)   { clearTimeout(chainTimer.current);   chainTimer.current = null; }
    if (displayTimer.current) { clearTimeout(displayTimer.current); displayTimer.current = null; }
  }

  // ── Drop loop ──────────────────────────────────────────────────────────────

  function scheduleDrop() {
    if (dropTimer.current) clearTimeout(dropTimer.current);
    const s = get();
    dropTimer.current = setTimeout(() => {
      const cur = get();
      if (cur.phase !== "playing" || !cur.currentPiece) return;
      const dropped = movePiece(cur.board, cur.currentPiece, 0, 1);
      if (dropped.y !== cur.currentPiece.y) {
        set({ currentPiece: dropped });
        scheduleDrop();
      } else {
        const newBoard = placePiece(cur.board, cur.currentPiece);
        set({ currentPiece: null, phase: "clearing" });
        processChains(newBoard, 1);
      }
    }, dropInterval(s.level));
  }

  // ── Chain processing ───────────────────────────────────────────────────────

  function processChains(board: typeof stateRef.current.board, chain: number) {
    const afterGravity = applyGravity(board);
    const mask = findMatches(afterGravity);

    if (!anyMatch(mask)) {
      finishChains(afterGravity);
      return;
    }

    const cleared = countMatches(mask);
    const bonus = calcScore(cleared, chain);
    const totalCleared = get().totalCleared + cleared;
    const level = levelFor(totalCleared);
    const maxChain = Math.max(get().maxChain, chain);

    set({
      board: afterGravity,
      clearingMask: mask,
      phase: "clearing",
      score: get().score + bonus,
      totalCleared,
      level,
      currentChain: chain,
      maxChain,
      displayChain: chain,
    });

    if (displayTimer.current) clearTimeout(displayTimer.current);
    displayTimer.current = setTimeout(() => set({ displayChain: 0 }), 1500);

    chainTimer.current = setTimeout(() => {
      const s = get();
      const cleared = clearMatches(s.board, s.clearingMask);
      set({ board: cleared, clearingMask: createMask() });
      processChains(cleared, chain + 1);
    }, 480);
  }

  function finishChains(board: typeof stateRef.current.board) {
    const s = get();
    const next = s.nextPiece;
    if (isGameOver(board, next)) {
      set({ board, phase: "gameover", currentPiece: null });
      return;
    }
    const piece = spawnPiece(next);
    const newNext = randomPair();
    set({ board, phase: "playing", currentPiece: piece, nextPiece: newNext, currentChain: 0 });
    scheduleDrop();
  }

  // ── Game actions ───────────────────────────────────────────────────────────

  function startGame() {
    clearTimers();
    const next = randomPair();
    const piece = spawnPiece(next);
    const afterNext = randomPair();
    stateRef.current = {
      ...makeInitial(),
      phase: "playing",
      currentPiece: piece,
      nextPiece: afterNext,
    };
    rerender();
    scheduleDrop();
  }

  function hardDrop() {
    const s = get();
    if (!s.currentPiece || s.phase !== "playing") return;
    if (dropTimer.current) { clearTimeout(dropTimer.current); dropTimer.current = null; }
    const landed = ghostPiece(s.board, s.currentPiece);
    const newBoard = placePiece(s.board, landed);
    set({ currentPiece: null, phase: "clearing" });
    processChains(newBoard, 1);
  }

  function softDrop() {
    const s = get();
    if (!s.currentPiece || s.phase !== "playing") return;
    const dropped = movePiece(s.board, s.currentPiece, 0, 1);
    if (dropped.y !== s.currentPiece.y) {
      set({ currentPiece: dropped });
    } else {
      if (dropTimer.current) { clearTimeout(dropTimer.current); dropTimer.current = null; }
      const newBoard = placePiece(s.board, s.currentPiece);
      set({ currentPiece: null, phase: "clearing" });
      processChains(newBoard, 1);
    }
  }

  function moveLeft() {
    const s = get();
    if (!s.currentPiece || s.phase !== "playing") return;
    set({ currentPiece: movePiece(s.board, s.currentPiece, -1, 0) });
  }

  function moveRight() {
    const s = get();
    if (!s.currentPiece || s.phase !== "playing") return;
    set({ currentPiece: movePiece(s.board, s.currentPiece, 1, 0) });
  }

  function rotateAction() {
    const s = get();
    if (!s.currentPiece || s.phase !== "playing") return;
    set({ currentPiece: rotatePiece(s.board, s.currentPiece) });
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = get();

      if (s.phase !== "playing") {
        if (e.key === "Enter" || e.key === " ") startGame();
        return;
      }
      if (!s.currentPiece) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          moveLeft();
          break;
        case "ArrowRight":
          e.preventDefault();
          moveRight();
          break;
        case "ArrowDown":
          e.preventDefault();
          softDrop();
          break;
        case "ArrowUp":
        case "z":
        case "Z":
          e.preventDefault();
          rotateAction();
          break;
        case " ":
          e.preventDefault();
          hardDrop();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const s = get();
  const display = buildDisplay(s);
  const boardWidth = COLS * cellSize + 24;

  function PuyoCell({ cell, size = cellSize }: { cell: DisplayCell; size?: number }) {
    if (!cell.color) {
      return (
        <div
          style={{ width: size, height: size }}
          className="rounded-lg bg-white/3 border border-white/5"
        />
      );
    }
    const cfg = PUYO[cell.color];
    const opacity = cell.ghost ? 0.22 : 1;
    const scale = cell.clearing ? "scale(0)" : "scale(1)";
    return (
      <div
        style={{
          width: size,
          height: size,
          opacity,
          transform: scale,
          transition: cell.clearing ? "transform 0.4s ease-in, opacity 0.4s ease-in" : "transform 0.06s",
          borderRadius: "50%",
          background: cfg.grad,
          boxShadow: cell.ghost
            ? "none"
            : `0 0 ${size * 0.35}px ${cfg.glow}88, inset 0 -3px 6px rgba(0,0,0,0.4), inset 0 3px 6px rgba(255,255,255,0.15)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Shine highlight */}
        <div
          style={{
            position: "absolute",
            top: "18%",
            left: "22%",
            width: "28%",
            height: "22%",
            background: "rgba(255,255,255,0.65)",
            borderRadius: "50%",
            transform: "rotate(-30deg)",
          }}
        />
        {/* Eyes */}
        {!cell.ghost && (
          <>
            <div style={{ position: "absolute", top: "42%", left: "28%", width: "14%", height: "16%", background: "#1a1a2e", borderRadius: "50%" }} />
            <div style={{ position: "absolute", top: "42%", left: "54%", width: "14%", height: "16%", background: "#1a1a2e", borderRadius: "50%" }} />
          </>
        )}
      </div>
    );
  }

  function MiniPuyo({ color, size = 32 }: { color: PuyoColor; size?: number }) {
    const cfg = PUYO[color];
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: cfg.grad,
          boxShadow: `0 0 12px ${cfg.glow}88, inset 0 -2px 4px rgba(0,0,0,0.4)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: "18%", left: "22%", width: "28%", height: "22%", background: "rgba(255,255,255,0.6)", borderRadius: "50%", transform: "rotate(-30deg)" }} />
      </div>
    );
  }

  function CtrlBtn({ label, onPress, className = "" }: { label: string; onPress: () => void; className?: string }) {
    return (
      <button
        onPointerDown={(e) => { e.preventDefault(); onPress(); }}
        className={`h-16 rounded-2xl text-white text-2xl font-bold select-none cursor-pointer transition-transform active:scale-90 ${className}`}
        style={{
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        {label}
      </button>
    );
  }

  // Board overlays (chain, idle, gameover) — shared
  const boardOverlays = (
    <>
      {s.displayChain >= 2 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ animation: "chainAppear 0.35s cubic-bezier(0.175,0.885,0.32,1.275) forwards" }}
        >
          <div
            className="text-center"
            style={{
              background: "linear-gradient(135deg, rgba(124,58,237,0.9), rgba(236,72,153,0.9))",
              backdropFilter: "blur(8px)",
              borderRadius: 16,
              padding: "12px 28px",
              border: "1px solid rgba(255,255,255,0.3)",
              boxShadow: "0 0 40px rgba(124,58,237,0.6)",
            }}
          >
            <div className="text-white/70 text-sm font-semibold tracking-widest uppercase">Chain</div>
            <div className="text-white font-black text-5xl leading-none" style={{ textShadow: "0 0 20px rgba(255,255,255,0.8)" }}>
              ×{s.displayChain}
            </div>
          </div>
        </div>
      )}

      {s.phase === "idle" && (
        <div
          className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer"
          style={{ background: "rgba(6,0,26,0.85)", backdropFilter: "blur(8px)" }}
          onClick={startGame}
        >
          <div className="text-white font-black text-4xl tracking-tight">ぷよぷよ</div>
          <div className="text-white/50 text-sm sm:hidden">タップしてスタート</div>
          <div className="text-white/50 text-sm hidden sm:block">Press Enter or Space to start</div>
          <div className="text-white/30 text-xs mt-2 text-center leading-6 hidden sm:block">
            ← → Move &nbsp;|&nbsp; ↑ / Z Rotate<br />
            ↓ Soft drop &nbsp;|&nbsp; Space Hard drop
          </div>
        </div>
      )}

      {s.phase === "gameover" && (
        <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-4"
          style={{ background: "rgba(6,0,26,0.88)", backdropFilter: "blur(8px)" }}>
          <div className="text-white/60 font-semibold text-sm tracking-widest uppercase">Game Over</div>
          <div className="text-white font-black text-3xl">{s.score.toLocaleString()}</div>
          <div className="text-white/40 text-sm">Best chain ×{s.maxChain}</div>
          <button
            onClick={startGame}
            className="mt-2 px-6 py-2.5 rounded-xl font-bold text-white text-sm cursor-pointer transition-all hover:scale-105 active:scale-95"
            style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)", boxShadow: "0 0 20px rgba(124,58,237,0.5)" }}
          >
            もう一度
          </button>
        </div>
      )}
    </>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-[#06001a] overflow-hidden flex items-center justify-center select-none">
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        {[
          { color: "#7c3aed", size: 400, top: "10%", left: "5%", delay: "0s" },
          { color: "#1d4ed8", size: 300, top: "60%", left: "70%", delay: "2s" },
          { color: "#be185d", size: 250, top: "80%", left: "10%", delay: "4s" },
          { color: "#065f46", size: 200, top: "20%", left: "80%", delay: "1s" },
        ].map((orb, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: orb.size,
              height: orb.size,
              top: orb.top,
              left: orb.left,
              background: orb.color,
              opacity: 0.08,
              filter: "blur(80px)",
              animation: `floatOrb ${6 + i * 2}s ease-in-out infinite`,
              animationDelay: orb.delay,
            }}
          />
        ))}
      </div>

      {/* ══════════════════════════════════════════
          Desktop layout (sm and above)
      ══════════════════════════════════════════ */}
      <div className="relative z-10 hidden sm:flex items-start gap-6">

        {/* Left panel: stats */}
        <div className="flex flex-col gap-4 w-36">
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
            <div className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">Score</div>
            <div className="text-white font-bold text-2xl tabular-nums leading-tight">{s.score.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
            <div className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">Level</div>
            <div className="text-white font-bold text-2xl">{s.level}</div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${((s.totalCleared % 20) / 20) * 100}%`,
                  background: "linear-gradient(90deg, #7c3aed, #ec4899)",
                }}
              />
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
            <div className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">Best Chain</div>
            <div className="text-white font-bold text-2xl">{s.maxChain > 0 ? `×${s.maxChain}` : "—"}</div>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
            <div className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">Cleared</div>
            <div className="text-white font-bold text-2xl">{s.totalCleared}</div>
          </div>
        </div>

        {/* Center: game board */}
        <div className="relative">
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              width: boardWidth,
              padding: 12,
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 0 60px rgba(124,58,237,0.15), 0 25px 50px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${ROWS}, ${cellSize}px)`,
                gap: 2,
              }}
            >
              {display.map((row, r) =>
                row.map((cell, c) => (
                  <PuyoCell key={`${r}-${c}`} cell={cell} />
                ))
              )}
            </div>
            {boardOverlays}
          </div>
        </div>

        {/* Right panel: next piece + controls */}
        <div className="flex flex-col gap-4 w-36">
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
            <div className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-3">Next</div>
            <div className="flex flex-col items-center gap-1.5">
              <MiniPuyo color={s.nextPiece.subColor} />
              <MiniPuyo color={s.nextPiece.mainColor} />
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
            <div className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-3">Controls</div>
            <div className="space-y-2">
              {[
                { key: "← →", label: "Move" },
                { key: "↑ / Z", label: "Rotate" },
                { key: "↓", label: "Soft drop" },
                { key: "Space", label: "Hard drop" },
              ].map(({ key, label }) => (
                <div key={key} className="flex flex-col">
                  <span className="text-white/70 text-xs font-mono font-bold">{key}</span>
                  <span className="text-white/30 text-xs">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          Mobile layout (below sm)
      ══════════════════════════════════════════ */}
      <div className="relative z-10 flex sm:hidden flex-col items-center gap-3 w-full px-3 py-4">

        {/* Top stats row */}
        <div className="flex gap-2 w-full" style={{ maxWidth: boardWidth + 68 }}>
          {[
            { label: "スコア", value: s.score.toLocaleString() },
            { label: "レベル", value: String(s.level) },
            { label: "チェーン", value: s.maxChain > 0 ? `×${s.maxChain}` : "—" },
            { label: "消した数", value: String(s.totalCleared) },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 rounded-xl bg-white/5 border border-white/10 p-2 text-center">
              <div className="text-white/40 text-[9px] font-semibold uppercase tracking-wider leading-none mb-1">{label}</div>
              <div className="text-white font-bold text-sm tabular-nums leading-tight">{value}</div>
            </div>
          ))}
        </div>

        {/* Board + Next side panel */}
        <div className="flex items-start gap-3">
          {/* Game board */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              width: boardWidth,
              padding: 12,
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 0 60px rgba(124,58,237,0.15), 0 25px 50px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${ROWS}, ${cellSize}px)`,
                gap: 2,
              }}
            >
              {display.map((row, r) =>
                row.map((cell, c) => (
                  <PuyoCell key={`m-${r}-${c}`} cell={cell} />
                ))
              )}
            </div>
            {boardOverlays}
          </div>

          {/* Next piece */}
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="text-white/40 text-[9px] font-semibold uppercase tracking-wider mb-2 text-center">次</div>
              <div className="flex flex-col items-center gap-1.5">
                <MiniPuyo color={s.nextPiece.subColor} size={26} />
                <MiniPuyo color={s.nextPiece.mainColor} size={26} />
              </div>
            </div>
            {/* Level progress */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-white/40 text-[9px] font-semibold uppercase tracking-wider mb-1">Lv</div>
              <div className="text-white font-bold text-base">{s.level}</div>
              <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${((s.totalCleared % 20) / 20) * 100}%`,
                    background: "linear-gradient(90deg, #7c3aed, #ec4899)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Touch control buttons */}
        <div className="flex flex-col gap-2" style={{ width: boardWidth }}>
          <div className="flex gap-2">
            <CtrlBtn label="←" onPress={moveLeft} className="flex-1" />
            <CtrlBtn label="↻" onPress={rotateAction} className="flex-1" />
            <CtrlBtn label="→" onPress={moveRight} className="flex-1" />
          </div>
          <CtrlBtn label="↓" onPress={softDrop} className="w-full" />
        </div>
      </div>
    </div>
  );
}

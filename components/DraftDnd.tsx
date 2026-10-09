"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";

export function ZonaSoltar({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className ?? ""} ${isOver ? "ring-2 ring-turf-400" : ""}`}>
      {children}
    </div>
  );
}

export function FichaArrastrable({
  id,
  nombre,
  disabled,
  onClick,
}: {
  id: string;
  nombre: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 30, opacity: isDragging ? 0.85 : 1 }
    : undefined;
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      disabled={disabled}
      className="touch-none rounded-pill bg-pitch-800 px-3 py-2 text-xs disabled:opacity-100"
    >
      {nombre}
    </button>
  );
}

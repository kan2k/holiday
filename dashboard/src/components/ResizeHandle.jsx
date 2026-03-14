import { useCallback, useEffect, useRef } from 'react';

export default function ResizeHandle({ onResize, direction = 'horizontal' }) {
  const isDragging = useRef(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const current = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = current - startPos.current;
      startPos.current = current;
      onResize(delta);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize, direction]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`flex-shrink-0 group relative z-20 ${
        direction === 'horizontal'
          ? 'w-[5px] cursor-col-resize hover:bg-terminal-accent/20 active:bg-terminal-accent/30'
          : 'h-[5px] cursor-row-resize hover:bg-terminal-accent/20 active:bg-terminal-accent/30'
      } transition-colors`}
    >
      {/* Visible line */}
      <div className={`absolute ${
        direction === 'horizontal'
          ? 'top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-terminal-border group-hover:bg-terminal-accent/50'
          : 'left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-terminal-border group-hover:bg-terminal-accent/50'
      } transition-colors`} />
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";

interface UseResizableOptions {
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  direction?: "horizontal" | "vertical";
  anchor?: "start" | "end"; // start: left/top, end: right/bottom
  onResize?: (size: number) => void;
  storageKey?: string;
}

export const useResizable = ({
  initialSize,
  minSize = 100,
  maxSize = 800,
  direction = "horizontal",
  anchor = "start",
  onResize,
  storageKey,
}: UseResizableOptions) => {
  const [size, setSize] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) return parseInt(saved, 10);
    }
    return initialSize;
  });

  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<number>(size);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (storageKey) {
      localStorage.setItem(storageKey, resizeRef.current.toString());
    }
  }, [storageKey]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      
      let newSize: number;
      if (direction === "horizontal") {
        if (anchor === "start") {
          newSize = e.clientX;
        } else {
          newSize = window.innerWidth - e.clientX;
        }
      } else {
        if (anchor === "start") {
          newSize = e.clientY;
        } else {
          newSize = window.innerHeight - e.clientY;
        }
      }
      
      if (newSize >= minSize && newSize <= maxSize) {
        setSize(newSize);
        resizeRef.current = newSize;
        if (onResize) onResize(newSize);
      }
    },
    [isResizing, minSize, maxSize, direction, anchor, onResize]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", stopResizing);
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleMouseMove, stopResizing, direction]);

  return { size, isResizing, startResizing, setSize };
};

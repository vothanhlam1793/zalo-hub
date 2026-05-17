import { useState, useEffect, useCallback, useRef } from "react";
import { XIcon, ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon, DownloadIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface LightboxImage {
  url: string;
  senderName?: string;
}

interface LightboxProps {
  images: LightboxImage[];
  index: number;
  open: boolean;
  onClose: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

function Lightbox({ images, index, open, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(index);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const total = images.length;
  const item = images[currentIndex];

  useEffect(() => {
    if (open) {
      setCurrentIndex(index);
      setLoaded(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [open, index]);

  const go = useCallback((dir: number) => {
    setLoaded(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCurrentIndex((prev) => (prev + dir + total) % total);
  }, [total]);

  const toggleZoom = useCallback(() => {
    setZoom((z) => {
      if (z > 1.1) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      return 2;
    });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(z - ZOOM_STEP, MIN_ZOOM);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z - e.deltaY * 0.005)));
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    const container = containerRef.current;
    container?.addEventListener("wheel", onWheel, { passive: false });
    return () => container?.removeEventListener("wheel", onWheel);
  }, [open]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (zoom > 1) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onClose, zoom]);

  const handleDownload = useCallback(() => {
    if (!item?.url) return;
    const a = document.createElement("a");
    a.href = item.url;
    a.download = "image";
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }, [item?.url]);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 gap-0 bg-black/98 border-0 rounded-none shadow-none [&>button:first-child]:hidden select-none"
        onPointerDownOutside={onClose}
      >
        <button
          type="button"
          className="absolute top-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
          onClick={onClose}
        >
          <XIcon className="h-5 w-5" />
        </button>

        <div className="absolute top-4 left-4 z-30 flex items-center gap-1.5">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
            onClick={zoomOut}
            title="Thu nhỏ"
          >
            <ZoomOutIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 px-3 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition text-xs font-medium min-w-[52px]"
            onClick={toggleZoom}
            title="Bấm để khớp màn hình / phóng to"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
            onClick={zoomIn}
            title="Phóng to"
          >
            <ZoomInIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
            onClick={handleDownload}
            title="Tải xuống"
          >
            <DownloadIcon className="h-4 w-4" />
          </button>
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
              onClick={() => go(-1)}
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
              onClick={() => go(1)}
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
          </>
        )}

        <div
          ref={containerRef}
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden",
            zoom > 1 && dragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-default"
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={toggleZoom}
        >
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            </div>
          )}
          {item && (
            <img
              src={item.url}
              alt=""
              className={cn(
                "transition-opacity duration-300",
                zoom <= 1 ? "max-w-full max-h-full w-auto h-auto object-contain" : "max-w-none max-h-none",
                loaded ? "opacity-100" : "opacity-0"
              )}
              style={zoom > 1 ? {
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
              } : undefined}
              onLoad={() => setLoaded(true)}
              draggable={false}
            />
          )}
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4">
          {total > 1 && (
            <span className="text-sm text-white/50 bg-black/60 px-3 py-1.5 rounded-full">
              {currentIndex + 1} / {total}
            </span>
          )}
          {item?.senderName && (
            <span className="text-sm text-white/80 bg-black/60 px-3 py-1.5 rounded-full">
              {item.senderName}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default Lightbox;

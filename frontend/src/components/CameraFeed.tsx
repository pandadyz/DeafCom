"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";
const SEND_FPS = 15;
const SEND_INTERVAL_MS = 1000 / SEND_FPS;
const FRAME_SIZE = 224;

interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface CameraFeedProps {
  onDetection: (detectionData: {
    detections: any[];
    fps: number;
    event?: string;
    stableWord?: string | null;
    candidateSigns?: string[];
  }) => void;
  onConnectionChange: (isConnected: boolean) => void;
}

export default function CameraFeed({ onDetection, onConnectionChange }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const startRequestIdRef = useRef(0);
  const wsSessionIdRef = useRef(0);
  const onDetectionRef = useRef(onDetection);
  const onConnectionChangeRef = useRef(onConnectionChange);

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onDetectionRef.current = onDetection;
  }, [onDetection]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const drawOverlay = useCallback((detections: Detection[]) => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const width = video.clientWidth;
    const height = video.clientHeight;
    if (!width || !height) return;

    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;

    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#00ff88";
    ctx.fillStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.font = "12px sans-serif";

    const scaleX = width / FRAME_SIZE;
    const scaleY = height / FRAME_SIZE;

    for (const det of detections) {
      const [x1, y1, x2, y2] = det.bbox;
      const dx = x1 * scaleX;
      const dy = y1 * scaleY;
      const dw = (x2 - x1) * scaleX;
      const dh = (y2 - y1) * scaleY;

      ctx.strokeRect(dx, dy, dw, dh);
      const label = `${det.class} ${(det.confidence * 100).toFixed(1)}%`;
      const textY = Math.max(14, dy - 4);
      ctx.fillText(label, dx + 2, textY);
    }
  }, []);

  const stopSendingFrames = useCallback(() => {
    if (sendTimerRef.current) {
      clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
    }
  }, []);

  const sendFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;

    if (!video || !canvas || !ws) return;
    if (video.readyState < video.HAVE_ENOUGH_DATA) return;
    if (ws.readyState !== WebSocket.OPEN) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = FRAME_SIZE;
    canvas.height = FRAME_SIZE;
    ctx.drawImage(video, 0, 0, FRAME_SIZE, FRAME_SIZE);

    const base64 = canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
    ws.send(base64);
  }, []);

  const startSendingFrames = useCallback(() => {
    stopSendingFrames();
    sendTimerRef.current = setInterval(sendFrame, SEND_INTERVAL_MS);
  }, [sendFrame, stopSendingFrames]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!shouldReconnectRef.current) return;

    const sessionId = ++wsSessionIdRef.current;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (sessionId !== wsSessionIdRef.current) return;
      onConnectionChangeRef.current(true);
      setError("");
      startSendingFrames();
    };

    ws.onmessage = (event) => {
      if (sessionId !== wsSessionIdRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        const detections = Array.isArray(msg?.detections) ? msg.detections : [];
        drawOverlay(detections);
        onDetectionRef.current({
          detections,
          fps: typeof msg?.server_fps === "number" ? msg.server_fps : SEND_FPS,
          event: msg?.event,
          stableWord: msg?.stable_word,
          candidateSigns: Array.isArray(msg?.candidate_signs) ? msg.candidate_signs : [],
        });
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    ws.onclose = () => {
      if (sessionId !== wsSessionIdRef.current) return;
      onConnectionChangeRef.current(false);
      stopSendingFrames();

      if (!shouldReconnectRef.current) return;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
      if (sessionId !== wsSessionIdRef.current) return;
      onConnectionChangeRef.current(false);
      setError("Không thể kết nối tới server. Đang thử lại...");
    };
  }, [drawOverlay, startSendingFrames, stopSendingFrames]);

  const startCamera = useCallback(async () => {
    const requestId = ++startRequestIdRef.current;
    shouldReconnectRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      if (!videoRef.current || requestId !== startRequestIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const videoEl = videoRef.current;
      videoEl.srcObject = stream;
      await videoEl.play();

      if (requestId !== startRequestIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        videoEl.srcObject = null;
        return;
      }

      setIsStreaming(true);
      setError("");

      connectWebSocket();
    } catch (err: any) {
      // Race condition (StrictMode/reload/start-stop nhanh) có thể gây AbortError.
      // Trường hợp này không phải lỗi camera thật.
      if (err?.name === "AbortError") {
        return;
      }
      const msg =
        err.name === "NotAllowedError"
          ? "Hãy cho phép truy cập camera trong trình duyệt."
          : "Failed to access camera. Please ensure camera permissions are granted.";
      setError(msg);
      onConnectionChangeRef.current(false);
      console.error("Camera error:", err);
    }
  }, [connectWebSocket]);

  const stopCamera = useCallback(() => {
    startRequestIdRef.current += 1;
    wsSessionIdRef.current += 1;
    shouldReconnectRef.current = false;
    stopSendingFrames();

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    onConnectionChangeRef.current(false);

    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [stopSendingFrames]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return (
    <div className="relative">
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500 text-white p-3 rounded-lg z-10">
          {error}
        </div>
      )}

      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-auto"
          style={{ maxHeight: "480px" }}
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {!isStreaming && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
              <p>Initializing camera...</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isStreaming ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {isStreaming ? "Camera Active" : "Camera Inactive"}
          </span>
          {isStreaming && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · send {SEND_FPS}fps · {FRAME_SIZE}x{FRAME_SIZE}
            </span>
          )}
        </div>

        <button
          onClick={isStreaming ? stopCamera : startCamera}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          {isStreaming ? "Stop Camera" : "Start Camera"}
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

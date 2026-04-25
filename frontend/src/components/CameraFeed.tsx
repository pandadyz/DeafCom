"use client";

import { useRef, useEffect, useState } from "react";

interface CameraFeedProps {
  onDetection: (detectionData: { detections: any[]; fps: number }) => void;
  onConnectionChange: (isConnected: boolean) => void;
}

export default function CameraFeed({ onDetection, onConnectionChange }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        setError("");
        
        // Connect to WebSocket after camera starts
        connectWebSocket();
      }
    } catch (err) {
      setError("Failed to access camera. Please ensure camera permissions are granted.");
      console.error("Camera error:", err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const connectWebSocket = () => {
    try {
      // Connect to backend WebSocket
      const wsUrl = "ws://localhost:8000/ws";
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected");
        onConnectionChange(true);
        startFrameCapture();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const detections = JSON.parse(event.data);
          // Backend sends detection results directly as array
          onDetection({ detections, fps: 30 });
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket disconnected");
        onConnectionChange(false);
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        onConnectionChange(false);
        setError("Failed to connect to detection server");
      };

    } catch (err) {
      console.error("Failed to connect to WebSocket:", err);
      setError("Failed to connect to detection server");
      onConnectionChange(false);
    }
  };

  const startFrameCapture = () => {
    const captureFrame = () => {
      if (videoRef.current && canvasRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
          // Set canvas size to match video
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Draw video frame to canvas
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Convert canvas to base64 and send to backend
          const imageData = canvas.toDataURL("image/jpeg", 0.8);
          
          // Send just the base64 data (backend expects raw base64 string)
          wsRef.current.send(imageData);
        }
      }

      animationFrameRef.current = requestAnimationFrame(captureFrame);
    };

    captureFrame();
  };

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
          ref={canvasRef}
          className="hidden"
        />
        
        {!isStreaming && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p>Initializing camera...</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isStreaming ? "bg-green-500" : "bg-red-500"}`}></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {isStreaming ? "Camera Active" : "Camera Inactive"}
          </span>
        </div>
        
        <button
          onClick={isStreaming ? stopCamera : startCamera}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          {isStreaming ? "Stop Camera" : "Start Camera"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import CameraFeed, { CameraFeedRef } from "./CameraFeed";

interface DetectionData {
  detections: any[];
  fps: number;
  event?: string;
  stableWord?: string | null;
  candidateSigns?: string[];
}

interface SignLanguageCameraProps {
  onDetection: (detectionData: DetectionData) => void;
  onConnectionChange: (isConnected: boolean) => void;
}

export default function SignLanguageCamera({ onDetection, onConnectionChange }: SignLanguageCameraProps) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const cameraRef = useRef<CameraFeedRef>(null);

  const handleStartCamera = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.startCamera();
      setIsCameraOn(true);
    }
  }, []);

  const handleStopCamera = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stopCamera();
      setIsCameraOn(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cameraRef.current) {
        cameraRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="w-full aspect-video bg-surface-dim rounded-xl overflow-hidden relative shadow-sm border border-surface-variant">
      <CameraFeed
        ref={cameraRef}
        onDetection={onDetection}
        onConnectionChange={onConnectionChange}
        autoStart={false}
      />
      
      {/* Camera off overlay */}
      {!isCameraOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 text-white z-10">
          <div className="mb-4">
            <span className="material-symbols-outlined text-6xl text-gray-400">
              video_camera_front
            </span>
          </div>
          <p className="text-gray-300 mb-4">Camera is off</p>
          <button
            onClick={handleStartCamera}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined">videocam</span>
            Start Camera
          </button>
        </div>
      )}
      
      {/* Stop camera button when camera is on */}
      {isCameraOn && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleStopCamera}
            className="w-10 h-10 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center justify-center shadow-lg"
            title="Stop Camera"
          >
            <span className="material-symbols-outlined text-[20px]">
              videocam_off
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

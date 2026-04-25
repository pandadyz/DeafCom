"use client";

import { useState, useRef, useEffect } from "react";
import CameraFeed from "@/components/CameraFeed";
import DetectionResults from "@/components/DetectionResults";
import ConnectionStatus from "@/components/ConnectionStatus";

export default function Home() {
  const [detections, setDetections] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [fps, setFps] = useState(0);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            SignDETR Real-time Detection
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            AI-powered sign language detection in your browser
          </p>
        </header>

        <ConnectionStatus isConnected={isConnected} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              Camera Feed
            </h2>
            <CameraFeed
              onDetection={(detectionData: { detections: any[]; fps: number }) => {
                setDetections(detectionData.detections);
                setFps(detectionData.fps);
              }}
              onConnectionChange={setIsConnected}
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              Detection Results
            </h2>
            <DetectionResults detections={detections} fps={fps} />
          </div>
        </div>

        <footer className="mt-8 text-center text-gray-600 dark:text-gray-400">
          <p>
            Powered by DETR (Detection Transformer) for real-time sign language detection
          </p>
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import CameraFeed from "@/components/CameraFeed";
import DetectionResults from "@/components/DetectionResults";
import ConnectionStatus from "@/components/ConnectionStatus";

interface DetectionData {
  detections: any[];
  fps: number;
  stableWord?: string | null;
  candidateSigns?: string[];
}

export default function Home() {
  const [detections, setDetections] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const [stableWord, setStableWord] = useState<string | null>(null);
  const [candidateSigns, setCandidateSigns] = useState<string[]>([]);

  const handleDetection = (data: DetectionData) => {
    setDetections(Array.isArray(data.detections) ? data.detections : []);
    setFps(typeof data.fps === "number" ? data.fps : 0);
    setStableWord(data.stableWord ?? null);
    setCandidateSigns(Array.isArray(data.candidateSigns) ? data.candidateSigns : []);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            SignDETR Real-time Detection
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Simple and stable realtime detection pipeline
          </p>
        </header>

        <ConnectionStatus isConnected={isConnected} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              Camera Feed
            </h2>
            <CameraFeed onDetection={handleDetection} onConnectionChange={setIsConnected} />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              Detection Results
            </h2>
            <DetectionResults
              detections={detections}
              fps={fps}
              stableWord={stableWord}
              candidateSigns={candidateSigns}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

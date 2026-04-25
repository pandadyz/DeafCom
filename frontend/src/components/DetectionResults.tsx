"use client";

interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface DetectionResultsProps {
  detections: Detection[];
  fps: number;
}

export default function DetectionResults({ detections, fps }: DetectionResultsProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-600";
    if (confidence >= 0.8) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 0.9) return "bg-green-100";
    if (confidence >= 0.8) return "bg-yellow-100";
    return "bg-red-100";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
          Live Detection
        </h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {fps > 0 ? `${fps.toFixed(1)} FPS` : "Processing..."}
          </span>
        </div>
      </div>

      {detections.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <svg
              className="w-16 h-16 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            No signs detected yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Position your hands in front of the camera
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {detections.map((detection, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${getConfidenceBg(
                detection.confidence
              )} border-gray-200 dark:border-gray-700`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-white">
                    {detection.class}
                  </h4>
                  <p className={`text-sm font-medium ${getConfidenceColor(
                    detection.confidence
                  )}`}>
                    {(detection.confidence * 100).toFixed(1)}% confidence
                  </p>
                </div>
                
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Bounding Box
                  </div>
                  <div className="text-xs font-mono text-gray-600 dark:text-gray-300">
                    <div>X: {detection.bbox[0].toFixed(0)}</div>
                    <div>Y: {detection.bbox[1].toFixed(0)}</div>
                    <div>W: {(detection.bbox[2] - detection.bbox[0]).toFixed(0)}</div>
                    <div>H: {(detection.bbox[3] - detection.bbox[1]).toFixed(0)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Detection Info
        </h4>
        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
          <div>Active detections: {detections.length}</div>
          <div>Confidence threshold: 80%</div>
          <div>Model: DETR (Detection Transformer)</div>
        </div>
      </div>
    </div>
  );
}

"use client";

interface ConnectionStatusProps {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-center space-x-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="flex items-center space-x-2">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          ></div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Backend Status:
          </span>
        </div>
        
        <span
          className={`text-sm font-semibold ${
            isConnected ? "text-green-600" : "text-red-600"
          }`}
        >
          {isConnected ? "Connected" : "Disconnected"}
        </span>
        
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {isConnected ? "WebSocket connection active" : "Waiting for backend connection..."}
        </div>
      </div>
      
      {!isConnected && (
        <div className="mt-2 text-center text-sm text-amber-600 dark:text-amber-400">
          <p>Make sure the backend server is running on localhost:8000</p>
          <p className="text-xs mt-1">Run: uv run python app.py (from backend directory)</p>
        </div>
      )}
    </div>
  );
}

# SignDETR Web Application

A web-based real-time sign language detection application using FastAPI backend and Next.js frontend.

## Features

- **Real-time Detection**: Live camera feed with AI-powered sign language detection
- **WebSocket Communication**: Low-latency streaming between frontend and backend
- **Modern UI**: Responsive design with Tailwind CSS
- **Detection Visualization**: Bounding boxes and confidence scores
- **Performance Monitoring**: FPS counter and connection status

## Setup Instructions

### Prerequisites

- Python 3.13+
- Node.js 18+
- UV package manager
- Camera permissions in browser

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
uv sync
```

3. Ensure the model checkpoint exists:
```bash
# Make sure you have checkpoints/99_model.pt
# If not, train the model first or download a pretrained model
```

4. Start the backend server:
```bash
uv run python app.py
```

The backend will start on `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will start on `http://localhost:3000`

## Usage

1. **Start Backend**: Run the FastAPI server first
2. **Start Frontend**: Run the Next.js development server
3. **Open Browser**: Navigate to `http://localhost:3000`
4. **Allow Camera**: Grant camera permissions when prompted
5. **Start Detection**: The app will automatically start capturing and detecting signs

## Architecture

### Backend (FastAPI)
- `app.py`: Main FastAPI application with WebSocket support
- WebSocket endpoint: `/ws`
- Processes frames from frontend and returns detection results
- Uses the existing DETR model from `src/realtime.py`

### Frontend (Next.js)
- `src/app/page.tsx`: Main application page
- `src/components/CameraFeed.tsx`: Camera capture and WebSocket client
- `src/components/DetectionResults.tsx`: Detection results display
- `src/components/ConnectionStatus.tsx`: Connection status indicator

### Communication Flow
1. Frontend captures video frames from camera
2. Frames are sent to backend via WebSocket
3. Backend processes frames using DETR model
4. Detection results are sent back to frontend
5. Frontend displays results with bounding boxes and confidence scores

## Troubleshooting

### Common Issues

1. **Camera not working**
   - Check browser camera permissions
   - Ensure no other app is using the camera
   - Try refreshing the page

2. **Backend connection failed**
   - Ensure backend server is running on localhost:8000
   - Check for port conflicts
   - Verify WebSocket endpoint is accessible

3. **Model loading errors**
   - Ensure `checkpoints/99_model.pt` exists
   - Check model file permissions
   - Verify all dependencies are installed

4. **Low performance**
   - Close unnecessary browser tabs
   - Ensure good lighting conditions
   - Check system resources

### Development Tips

- Use browser developer tools to monitor WebSocket messages
- Check backend logs for detection errors
- Adjust confidence threshold in backend if needed
- Modify UI components in frontend for custom styling

## Configuration

### Backend Settings
- Host: `0.0.0.0` (configurable in `app.py`)
- Port: `8000` (configurable in `app.py`)
- Confidence threshold: `0.8` (configurable in `app.py`)

### Frontend Settings
- WebSocket URL: `ws://localhost:8000/ws` (configurable in `CameraFeed.tsx`)
- Video resolution: `640x480` (configurable in `CameraFeed.tsx`)
- Frame rate: Browser-dependent

## Next Steps

- Add support for multiple sign language classes
- Implement recording functionality
- Add model training interface
- Create mobile-responsive design
- Add user authentication and session management

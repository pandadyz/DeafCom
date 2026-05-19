/** Model input / WebSocket frame size (must match backend CFG.input_size). */
export const MODEL_FRAME_SIZE = 224;

export interface CenterSquareCrop {
  sourceX: number;
  sourceY: number;
  sourceSize: number;
  sourceWidth: number;
  sourceHeight: number;
}

/** Center square region of the camera frame (matches model crop, no stretch). */
export function getCenterSquareCrop(
  sourceWidth: number,
  sourceHeight: number,
): CenterSquareCrop | null {
  if (!sourceWidth || !sourceHeight) return null;
  const sourceSize = Math.min(sourceWidth, sourceHeight);
  return {
    sourceX: (sourceWidth - sourceSize) / 2,
    sourceY: (sourceHeight - sourceSize) / 2,
    sourceSize,
    sourceWidth,
    sourceHeight,
  };
}

/** Draw center-cropped square from video into a square canvas for inference. */
export function drawCenterCroppedFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetSize: number,
): boolean {
  const crop = getCenterSquareCrop(video.videoWidth, video.videoHeight);
  if (!crop) return false;

  ctx.drawImage(
    video,
    crop.sourceX,
    crop.sourceY,
    crop.sourceSize,
    crop.sourceSize,
    0,
    0,
    targetSize,
    targetSize,
  );
  return true;
}

/**
 * Map bbox from model space (square crop) to video element display pixels.
 * Assumes the video uses uniform scaling (object-fit: cover/contain with matching aspect).
 */
export function mapBboxToVideoElement(
  bbox: [number, number, number, number],
  video: HTMLVideoElement,
  modelFrameSize: number = MODEL_FRAME_SIZE,
): [number, number, number, number] | null {
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    return null;
  }

  const crop = getCenterSquareCrop(video.videoWidth, video.videoHeight);
  if (!crop || !video.clientWidth || !video.clientHeight) return null;

  const scale = video.clientWidth / crop.sourceWidth;
  const cropDisplayX = crop.sourceX * scale;
  const cropDisplayY = crop.sourceY * scale;
  const cropDisplaySize = crop.sourceSize * scale;
  const bboxScale = cropDisplaySize / modelFrameSize;

  const [x1, y1, x2, y2] = bbox;
  return [
    cropDisplayX + x1 * bboxScale,
    cropDisplayY + y1 * bboxScale,
    cropDisplayX + x2 * bboxScale,
    cropDisplayY + y2 * bboxScale,
  ];
}

/** Built-in laptop webcam: 16:9, front-facing. Browsers may pick nearest supported mode. */
export const LAPTOP_CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "user",
  width: { ideal: 1280 },
  height: { ideal: 720 },
  aspectRatio: { ideal: 16 / 9 },
};

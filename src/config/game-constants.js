const rect = OpenCvSharp.OpenCvSharp.Rect
/** 游戏相关常量 */
export const COMMISSION_TYPE = {
  BASIC: "BASIC",
  NPC: "NPC",
};

export const COMMISSION_DETAIL_BUTTONS = [
  { id: 1, x: 1550, y: 320, checkX: 1450, checkWidth: 150 },
  { id: 2, x: 1550, y: 440, checkX: 1450, checkWidth: 150 },
  { id: 3, x: 1550, y: 530, checkX: 1500, checkWidth: 100 },
  { id: 4, x: 1550, y: 560, checkX: 1450, checkWidth: 150 },
];

/**
 * 委托统一配置（OCR区域 + 状态检查区域）
 * 每个配置项包含委托名OCR识别区域和完成状态检测区域
 */
export const COMMISSION_CONFIG = [
  {
    index: 0,
    ocrRegion: new rect(796, 293, 440, 40),
    statusRegion: { x: 1550, y: 320, checkX: 1450, checkWidth: 150 },
  },
  {
    index: 1,
    ocrRegion: new rect(796, 401, 440, 40),
    statusRegion: { x: 1550, y: 440, checkX: 1450, checkWidth: 150 },
  },
  {
    index: 2,
    ocrRegion: new rect(796, 509, 440, 40),
    statusRegion: { x: 1550, y: 530, checkX: 1500, checkWidth: 100 },
  },
  {
    index: 3,
    ocrRegion: new rect(796, 544, 440, 40),
    statusRegion: { x: 1550, y: 560, checkX: 1450, checkWidth: 150 },
  },
];

export const MIN_TEXT_LENGTH = 3;

export const MAX_COMMISSION_RETRY_COUNT = 1;

export const POSITION_COORDINATES = [
  [460, 538],
  [792, 538],
  [1130, 538],
  [1462, 538],
];
/**
 * 委托完成状态的检测区域
 * 
 * 需要在冒险之证-委托页面进行检测
 */
export const COMMISSION_STATUS_REGIONS = [
[1510, 270, 80, 100],
[1510, 370, 80, 100],
[1510, 470, 80, 100],
[1510, 520, 80, 100], 
];

export const COMMISSION_POSITIONING_BUTTONS = [
  {x: 1550, y: 320 },
  {x: 1550, y: 440 },
  {x: 1550, y: 530 },
  {x: 1550, y: 560 },
];

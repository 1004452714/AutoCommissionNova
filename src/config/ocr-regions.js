const rect = OpenCvSharp.OpenCvSharp.Rect
/** OCR 识别区域坐标常量 */
export const OCR_REGIONS = {
  /** 冒险之证 - 委托界面 - 委托名称 */
  COMMISSION_NAME: [
    new rect(810, 293, 440, 40),
    new rect(810, 401, 440, 40),
    new rect(810, 509, 440, 40),
    new rect(810, 544, 440, 40),
  ],
  MAIN: new rect(750, 250, 450, 400),
  LOCATION_IN_OTHER_COUNTRY: new rect(1530, 100, 250, 30),
  LOCATION_IN_NOD_KRAI: new rect(1580, 100, 250, 30),
  DETAIL_COUNTRY: new rect(1480, 100, 55, 30),
  COMMISSION_TRIGGER: new rect(885, 200, 165, 50),
  COMMISSION_COMPLETE: new rect(880, 165, 170, 45),
  /** 大地图- 选中委托后 - 取消追踪按钮 */
  COMMISSION_TRACKING: new rect(1626, 987, 127, 40),
  COMMISSION_DETAIL: new rect(76, 239, 280, 43),
};

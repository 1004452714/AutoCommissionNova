/** OCR 识别区域坐标常量 */
export const OCR_REGIONS = {
  /** 委托名称OCR识别区域（4个委托，用于BvPage OCR） */
  COMMISSION_NAME: [
    new OpenCvSharp.OpenCvSharp.Rect(796, 293, 440, 40),
    new OpenCvSharp.OpenCvSharp.Rect(796, 401, 440, 40),
    new OpenCvSharp.OpenCvSharp.Rect(796, 509, 440, 40),
    new OpenCvSharp.OpenCvSharp.Rect(796, 544, 440, 40),
  ],
  MAIN: new OpenCvSharp.OpenCvSharp.Rect(750, 250, 450, 400),
  LOCATION: new OpenCvSharp.OpenCvSharp.Rect(1530, 100, 250, 30),
  DETAIL_COUNTRY: new OpenCvSharp.OpenCvSharp.Rect(1480, 100, 55, 30),
  COMMISSION_TRIGGER: new OpenCvSharp.OpenCvSharp.Rect(885, 200, 165, 50),
  COMMISSION_COMPLETE: new OpenCvSharp.OpenCvSharp.Rect(880, 165, 170, 45),
  COMMISSION_TRACKING: new OpenCvSharp.OpenCvSharp.Rect(1622, 987, 137, 35),
  COMMISSION_DETAIL: new OpenCvSharp.OpenCvSharp.Rect(76, 239, 280, 43),
};

const ocrRegionConfig = {
    longTermTrainingPoints: {x: 765, y: 823, width: 254, height: 38},//长期训练点识别区域坐标和尺寸
}
const xyConfig = {
    dailyCommission: {x: 266, y: 318},//委托坐标 x=266, y=318, width=69, height=44
}
/**
 * OCR识别长期训练点数函数
 * @param ocrRegion
 * @returns {Promise<{pointNumber: number, expireTime: number, expireTimeText: string}>}
 */
export async function OcrLongTermTrainingPoints(ocrRegion = ocrRegionConfig.longTermTrainingPoints){

    let json={
        pointNumber:0,//长期训练点数
        // expireTime:0,//长期训练点过期时间
        // expireTimeText:'',//长期训练点过期时间
    }
    let ms=200
    let captureRegion = captureGameRegion(); // 获取游戏区域截图
    await sleep(ms*2)
    await drawBox(true,ocrRegion,200,new Pen(Color.FromArgb(255,0,255,178), 2))
    try {
        const ocrObject = RecognitionObject.Ocr(ocrRegion.x, ocrRegion.y, ocrRegion.width, ocrRegion.height); // 创建OCR识别对象
        let res = captureRegion.find(ocrObject); // 在指定区域进行OCR识别
        // 先判断识别结果是否存在，避免空对象报错
        if (!res.isExist()) {
            log.warn('未识别到长效训练点文本');
            return json;
        }
        // 仅保留数字和小数点，并转为数值
        const filteredText = res.text.replace(/[^0-9.]/g, '');
        json.pointNumber = parseFloat(filteredText) || 0;
    } finally {
        captureRegion.dispose(); // 释放截图资源
    }
    return json;
}

/**
 * 检查长效历练点 是否充足
 * @param minPointNumber
 * @param key
 * @returns {Promise<boolean>}
 * @constructor
 */
export async function LongTermTrainingPointsMain(minPointNumber=4,key='F1'){
    const ms=200
    await genshin.returnMainUi();
    await sleep(ms*2)
    //打开书
    await keyPress(key)
    await sleep(ms * 2)
    // 点击秘境入口坐标
    await click(xyConfig.dailyCommission.x, xyConfig.dailyCommission.y)
    await sleep(ms * 2)
    try {
        const { pointNumber } = await OcrLongTermTrainingPoints();
        log.info(`当前长效训练点数: {pointNumber}`,pointNumber);
        return  pointNumber >= minPointNumber
    }finally {
        await genshin.returnMainUi();
    }

}
export async function drawBox(show,result, delay = 200, pen ){
    if (show){
        await  drawAndClearBox(result, delay, pen)
    }
}

export async function drawAndClearBox(result, delay = 200, pen ) {
    const ro1 = captureGameRegion();
    try {
        const drawRegion = ro1.DeriveCrop(result.x, result.y, result.width, result.height);
        if (pen){
            drawRegion.DrawSelf("icon", pen);
        }else {
            drawRegion.DrawSelf("icon",new Pen(Color.Red, 2));
        }
        await sleep(delay);
        drawRegion.dispose()
    } finally {
        ro1.dispose();
    }
}

// (async function () {
//     await LongTermTrainingPointsMain()
// })()
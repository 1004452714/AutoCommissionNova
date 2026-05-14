/**
        * NPC 自动导航模块（BvPage 重写）
        * 自动导航到 NPC 对话位置
        * 
        * 导航流程：
        * 1. 打开地图并定位目标NPC图标
        * 2. 通过模板匹配检测NPC图标位置
        * 3. 调整视角使图标居中
        * 4. 前进一段距离
        * 5. 检测是否到达目标位置（OCR识别文字）
        * 6. 重复2-5直到到达或超时
        */
import { PATHS } from "../config/index.js";
import { isInMainUI } from "../vision/ui-detector.js";

/**
        * 自动导航到 NPC 对话位置
        * 
        * 通过地图图标匹配和前进检测，自动导航到目标NPC位置
        * 支持多种图标类型和到达后自动对话功能
        * 
        * 坐标说明（基于1920×1080分辨率）：
        * - 屏幕中心约在 (960, 540)
        * - 图标在 (920-980, <540) 范围内认为视角已调正
        * - 图标Y坐标 >= 520 时需要重新调整视角
        * 
        * @param {Object} options - 配置选项
        * @param {string} [options.npcName] - 目标 NPC 名称
        * @param {string} [options.iconType] - 图标类型 "Bigmap"|"Question"|"Task"
        * @param {boolean} [options.autoTalk] - 到达后是否自动对话
        * @returns {Promise<void>}
        */
export async function autoNavigateToTalk(options = {}) {
        const { npcName = "", iconType = "", autoTalk = false } = options;
  
        // 目标NPC名称（用于到达检测）
        const targetText = npcName;
        let iconTemplateRO;

        // 加载图标模板并创建识别对象
        const iconMat = loadIconMat(iconType);
        try {
                iconTemplateRO = RecognitionObject.TemplateMatch(iconMat);
        } finally {
                iconMat.Dispose();
        }

        // 前进次数计数器（用于超时检测）
        let forwardAttemptCount = 0;
  
        // 打开大地图
        middleButtonClick();
        await sleep(800);

        while (true) {
                await sleep(500);
                const captureRegion = captureGameRegion();
                try {
                        // 裁剪右侧文字区域进行OCR识别
                        const rewardTextArea = captureRegion.DeriveCrop(1210, 515, 200, 50);
                        try {
                                const rewardResult = rewardTextArea.find(RecognitionObject.ocrThis);
                                log.debug("检测到文字: " + rewardResult.text);
        
                                // 检测到目标文字，说明已到达
                                if (rewardResult.text === targetText) {
                                        log.info("已到达指定位置，检测到文字: " + rewardResult.text);
                                        if (autoTalk) keyPress("VK_F");
                                        return;
                                } else if (forwardAttemptCount > 80) {
                                        // 前进超时（80次×200ms=16秒），抛出异常
                                        throw new Error("前进时间超时");
                                }
                        } finally {
                                rewardTextArea.Dispose();
                        }
                } finally {
                        captureRegion.Dispose();
                }

                // 视角调整循环：将图标移动到屏幕中心区域
                for (let i = 0; i < 100; i++) {
                        const cap = captureGameRegion();
                        try {
                                const iconRes = cap.Find(iconTemplateRO);
                                log.info("检测到委托图标位置 ({x}, {y})", iconRes.x, iconRes.y);
        
                                // 图标在中心区域（X: 920-980, Y: <540），视角已调正
                                if (iconRes.x >= 920 && iconRes.x <= 980 && iconRes.y <= 540) {
                                        forwardAttemptCount++;
                                        log.info("视野已调正，前进第{num}次", forwardAttemptCount);
                                        break;
                                } else {
                                        // 图标偏下，先向上调整视角
                                        if (iconRes.y >= 520) moveMouseBy(0, 920);
          
                                        // 计算水平调整量：图标偏离中心的距离越大，调整幅度越大
                                        const adjustAmount = iconRes.x < 920 ? -20 : 20;
                                        const distanceToCenter = Math.abs(iconRes.x - 920);
                                        // 缩放因子：每偏离50像素，调整量增加1倍
                                        const scaleFactor = Math.max(1, Math.floor(distanceToCenter / 50));
                                        // 垂直调整量：图标在上方时按缩放因子调整，在下方时固定调整10
                                        const adjustAmount2 = iconRes.y < 540 ? scaleFactor : 10;
                                        moveMouseBy(adjustAmount * adjustAmount2, 0);
                                        await sleep(100);
                                }
        
                                // 视角调整超时（50次×100ms=5秒）
                                if (i > 50) throw new Error("视野调整超时");
                        } finally {
                                cap.Dispose();
                        }
                }

                // 前进操作：W键+空格跳跃
                keyDown("w");
                await sleep(200);
                keyPress("VK_SPACE");
                await sleep(200);
                keyPress("VK_SPACE");
                await sleep(200);
                keyUp("w");
                await sleep(200);
        }
}

/**
        * 根据图标类型加载对应的模板图片
        * 
        * 支持三种图标类型：
        * - bigmap: 大地图委托图标（蓝色菱形）
        * - question: 问号任务图标
        * - 其他: 普通任务图标
        * 
        * @param {string} iconType - 图标类型
        * @returns {Mat} 模板图片Mat对象，调用者负责释放
        */
function loadIconMat(iconType) {
        const type = (iconType || "").toLowerCase();
        if (type === "bigmap") {
                log.info("使用大地图图标");
                return file.ReadImageMatSync(PATHS.ICON_BIGMAP_COMMISSION);
        } else if (type === "question") {
                log.info("使用问号任务图标");
                return file.ReadImageMatSync(PATHS.ICON_QUESTION_COMMISSION);
        }
        log.info("使用任务图标");
        return file.ReadImageMatSync(PATHS.ICON_TASK_COMMISSION);
}

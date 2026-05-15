/**
 * 切换角色步骤处理器
 */
import { PATHS, POSITION_COORDINATES } from "../config/index.js";
import { defineStep } from "./define-step.js";

/**
 * 读取角色别名映射表
 * @returns {Object} 别名到标准名称的映射对象
 */
function readAliases() {
    try {
        const combatText = file.readTextSync(PATHS.AVATAR_DATA);
        const combatData = JSON.parse(combatText);
        const aliases = {};
        for (let i = 0; i < combatData.length; i++) {
            const character = combatData[i];
            if (character.alias && character.name) {
                for (let j = 0; j < character.alias.length; j++) {
                    aliases[character.alias[j]] = character.name;
                }
            }
        }
        return aliases;
    } catch (error) {
        log.error("读取角色别名文件失败：{error}", error.message);
        return {};
    }
}

export default defineStep({
    type: "切换角色",
    run: async (step, context) => {
        try {
            log.info("执行切换角色操作");
            if (!step.data) { log.warn("切换角色步骤缺少数据"); return; }

            let characterName, position;
            if (typeof step.data === "string") { characterName = step.data; }
            else if (typeof step.data === "object") {
                characterName = step.data.character || step.data.name;
                position = step.data.position;
            }

            if (!characterName && !position) { log.warn("切换角色步骤缺少角色信息"); return; }

            const aliases = readAliases();
            const actualName = aliases[characterName] || characterName;
            log.info("设置对应号位为【{character}】，切换角色为【{actualName}】", characterName, actualName);

            const teamConfigMat = file.ReadImageMatSync(PATHS.TEAM_CONFIG_IMAGE);
            const replaceMat = file.ReadImageMatSync(PATHS.REPLACE_IMAGE);
            const joinMat = file.ReadImageMatSync(PATHS.JOIN_IMAGE);
            try {
                const roTeamConfig = RecognitionObject.TemplateMatch(teamConfigMat, 0, 0, 1920, 1080);
                const roReplace = RecognitionObject.TemplateMatch(replaceMat, 0, 0, 1920, 1080);
                const roJoin = RecognitionObject.TemplateMatch(joinMat, 0, 0, 1920, 1080);

                let openPairingTries = 0;
                let totalOpenPairingTries = 0;

                const openPairingInterface = async function() {
                    while (openPairingTries < 3) {
                        keyPress("l");
                        await sleep(3500);
                        const ro1 = captureGameRegion();
                        try {
                            const teamConfigResult = ro1.find(roTeamConfig);
                            if (teamConfigResult.isExist()) { openPairingTries = 0; return true; }
                        } finally { ro1.Dispose(); }
                        openPairingTries++;
                        totalOpenPairingTries++;
                    }
                    if (totalOpenPairingTries < 6) {
                        await genshin.tp(2297.6, -824.5);
                        openPairingTries = 0;
                        return openPairingInterface();
                    }
                    log.error("无法打开配对界面，任务结束");
                    return false;
                };

                if (!(await openPairingInterface())) return false;

                const coords = POSITION_COORDINATES[position - 1];
                click(coords[0], coords[1]);
                log.info("开始设置{position}号位角色", position);
                await sleep(1000);

                let characterFound = false;
                let pageTries = 0;

                while (pageTries < 20) {
                    for (let num = 1; ; num++) {
                        const paddedNum = num.toString().padStart(2, "0");
                        const characterFileName = actualName + paddedNum;
                        try {
                            const characterMat = file.ReadImageMatSync(PATHS.CHARACTER_IMAGE_DIR + characterFileName + ".png");
                            try {
                                const characterRo = RecognitionObject.TemplateMatch(characterMat, 0, 0, 1920, 1080);
                                const ro2 = captureGameRegion();
                                try {
                                    const characterResult = ro2.find(characterRo);
                                    if (characterResult.isExist()) {
                                        log.info("已找到角色{character}", actualName);
                                        const targetX = Math.min(Math.max(characterResult.x + 35, 0), 1920);
                                        const targetY = Math.min(Math.max(characterResult.y + 35, 0), 1080);
                                        click(targetX, targetY);
                                        await sleep(500);
                                        characterFound = true;
                                        break;
                                    }
                                } finally { ro2.Dispose(); }
                            } finally { characterMat.Dispose(); }
                        } catch (error) { break; }
                    }
                    if (characterFound) break;
                    if (pageTries < 15) {
                        log.info("当前页面没有目标角色，滚动页面");
                        await scrollPage(200);
                    }
                    pageTries++;
                }

                if (!characterFound) { log.error("未找到【{character}】", actualName); return false; }

                const ro3 = captureGameRegion();
                try {
                    const replaceResult = ro3.find(roReplace);
                    const joinResult = ro3.find(roJoin);
                    if (replaceResult.isExist() || joinResult.isExist()) {
                        await sleep(300);
                        click(68, 1020);
                        keyPress("VK_LBUTTON");
                        await sleep(500);
                        log.info("角色切换完成：{character} -> {actualName}", characterName, actualName);
                        return true;
                    } else {
                        log.error("该角色已在队伍中，无需切换");
                        await sleep(300);
                        keyPress("VK_ESCAPE");
                        await sleep(500);
                        return false;
                    }
                } finally { ro3.Dispose(); }
            } finally {
                teamConfigMat.Dispose();
                replaceMat.Dispose();
                joinMat.Dispose();
            }
        } catch (error) {
            log.error("执行切换角色步骤时出错: {error}", error.message);
            throw error;
        }
    },
});

async function scrollPage(totalDistance, stepDistance, delayMs) {
    stepDistance = stepDistance || 10;
    delayMs = delayMs || 5;
    try {
        moveMouseTo(400, 750);
        await sleep(50);
        leftButtonDown();
        const steps = Math.ceil(totalDistance / stepDistance);
        for (let j = 0; j < steps; j++) {
            const remainingDistance = totalDistance - j * stepDistance;
            const moveDistance = remainingDistance < stepDistance ? remainingDistance : stepDistance;
            moveMouseBy(0, -moveDistance);
            await sleep(delayMs);
        }
        await sleep(700);
        leftButtonUp();
        await sleep(100);
        return true;
    } catch (error) {
        log.error("角色选择界面滚动操作时发生错误：{error}", error.message);
        return false;
    }
}

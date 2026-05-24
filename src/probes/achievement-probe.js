/**
 * 成就解锁探针
 *
 * conditions[branchKey] 形如 { type: "achievement", name: "成就·..." }
 * 由 成就检测 step 在分支流程内部显式调用 runExplicit
 */
import { defineProbe } from "./define-probe.js";
import { PATHS } from "../config/index.js";
export default defineProbe({
    type: "achievement",
    label: "成就解锁",
    validate(cond) {
        if (typeof cond.name !== "string" || cond.name.length === 0) {
            return { ok: false, error: "需要非空 name: string" };
        }
        return { ok: true };
    },
    async runExplicit(context, stepData) {
        const name = (stepData && stepData.name) || (context.branchCondition && context.branchCondition.name);
        if (!name) {
            log.warn("成就检测未提供成就名（step.data.name 与 context.branchCondition.name 均为空）");
            return;
        }
        log.info("成就检测：{name}", name);
        const page = new BvPage();
        const Rect = OpenCvSharp.OpenCvSharp.Rect
        //打开派蒙菜单
        await page.locator("世界等级", new Rect(304, 241, 120, 34))
            .WithRetryAction(async () => {
                keyPress("escape");
                await sleep(500);
            })
            .waitFor();
        //进入成就界面
        await page.locator("成就", new Rect(139, 32, 62, 34))
            .WithRetryAction(async () => {
                click(665, 420);
                await sleep(1500);
            })
            .waitFor();
        //打开成就搜索界面
        await page.locator("搜索成就", new Rect(105, 116, 104, 37))
            .WithRetryAction(async () => {
                click(196, 289);
                await sleep(500);
            })
            .waitFor();
        const mat = file.readImageMatSync(PATHS.HAS_NO_RESULT_IMAGE);
        const Ro = RecognitionObject.TemplateMatch(mat, 1221, 415, 115, 157);
        for (let i = 0; i < 3; i++) {
            //清除和激活输入框
            click(476, 137);
            await sleep(100);
            click(476, 137);
            await sleep(500);

            //输入成就名
            inputText(name);
            await sleep(500);
            //点击搜索按钮
            click(625, 137);
            await sleep(1000)

            const hasResult = await page.locator("相关", new Rect(735, 153, 57, 31)).isExist();
            if (hasResult) {
                const regions = page.ocr(new Rect(866, 268, 500, 40));
                log.info("搜索到相关成就：{regions}", regions[0].text);
                log.info("name成就：{name}", name);
                const hasUnlocked = await page.locator("达成", new Rect(1715, 291, 48, 28)).isExist();
                if (regions.count > 0) {
                    //todo:需要对OCR结果标准化，处理空白字符、特殊字符、OCR抖动等，参考对委托名称和地区名的标准化
                    log.info("对比结果：{bool}", regions[0].text === name);
                    if (regions[0].text === name && hasUnlocked) {
                        context.branchConditionMet = true;
                        genshin.returnMainUi();
                        return;
                    }
                }
            }
            //没有搜到对应name的成就
            const hasNoResult = await page.locator(Ro).isExist();
            if (hasNoResult) {
                context.branchConditionMet = false;
                genshin.returnMainUi();
                return;
            }
        }

    },
});

/**
 * 使用道具 step 处理器
 *
 * 打开背包 → 切到指定分页 → 在候选道具列表里挑第一个存在的 → 使用一次
 *
 * data:
 *   tab:   string   — 背包分页名称（武器 / 圣遗物 / 材料 / 任务 / 小道具 / 食物 / ...）
 *   items: string[] — 候选道具名数组；按声明顺序找第一个背包里实际拥有的，使用一次即返回。
 *                     用于"有 A 用 A，否则用 B"的灵活兜底，不会把列表里所有道具都用一遍
 *
 * 失败处理：swallow=true，UI 异常 / 一个候选都找不到时只 log，不阻断后续 step；
 * 调用方（流程作者）若需要严格失败语义，可以在 step 上配 retry / 配 retryOn 显式覆盖
 */
import { defineStep } from "./define-step.js";

export default defineStep({
    type: "使用道具",
    schema: {
        tab: "string",
        items: "array",   // string[]；元素是否非空字符串在 run 里自查
    },
    swallow: true,
    run: async (step, context) => {
        const { tab, items } = step.data;
        if (!Array.isArray(items) || items.length === 0 || !items.every(i => typeof i === "string" && i.length > 0)) {
            log.warn("使用道具：items 必须是非空字符串数组");
            return;
        }
        log.info("使用道具：{tab} 页 → 候选 {items}", tab, items.join(" / "));
        const page = new BvPage();
        const Rect = OpenCvSharp.OpenCvSharp.Rect;

        const inBagMat = file.readImageMatSync("Data/RecognitionObject/bag/inBag.png");
        const inBagRo = RecognitionObject.TemplateMatch(inBagMat, 39, 975, 76, 84)

        const uiMap = {
            "武器": { x: 570, y: 50 },
            "圣遗物": { x: 665, y: 50 },
            "养成道具": { x: 760, y: 50 },
            "食物": { x: 855, y: 50 },
            "材料": { x: 950, y: 50 },
            "小道具": { x: 1045, y: 50 },
            "任务": { x: 1140, y: 50 },
            "贵重道具": { x: 1235, y: 50 },
            "摆设": { x: 1330, y: 50 }
        }

        try {
            // TODO 1: 打开背包（B 键背包）
            await page.locator(inBagRo).WithRetryInterval(1000).withRetryAction(() => keyPress("B")).waitFor();

            // TODO 2: 切到 tab 指定的分页
            await page.locator("任务", new Rect(139, 32, 106, 34)).withRetryAction(() => {
                const { x, y } = uiMap[tab];
                page.click(x, y);
            }).waitFor();

            // TODO 3: 按 items 顺序在道具网格里找第一个命中的
            //   - for (const item of items) { 检测是否存在 → 命中即 break 进入 TODO 4 }
            //   - 都没命中 → log.warn 并直接 return
            //   - 必要时分页/滚动加载
            // SIFT 在头像网格里找角色（templatePaths 已在主流程预校验，必非空）
            let found = false;
            for (let attempt = 0; attempt < 3 && !found; attempt++) {
                if (attempt > 0) {
                    log.debug("道具 {tab} SIFT 第 {n}/{max} 轮尝试", tab, attempt + 1, 3);
                }

                for (const item of items) {
                    let itemMat;
                    try {
                        itemMat = file.readImageMatSync(`Data/RecognitionObject/bag/items/${tab}/${item}.png`);
                        const itemRo = RecognitionObject.TemplateMatch(itemMat, 112, 118, 1158, 839);
                        const result = page.locator(itemRo).findAll();
                        if (result.count > 0) {
                            result[0].click();
                            await page.locator("使用", new Rect(1662, 994, 77, 42))
                                .withRetryAction(() => result[0].click())
                                .click();
                            
                            log.info("在 {tab} 页使用道具 {name} ", tab, item);
                            found = true;
                            break;
                        }

                    } finally {
                        itemMat.dispose();
                    }
                }
            }
            if (!found) {
                throw new Error(`道具：${items} 在 ${attempt} 轮尝试后仍未找到`);
            }


        } finally {
            await genshin.returnMainUi();
        }
    },
});

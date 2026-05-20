/**
 * SIFT 多实例抗缩放匹配
 *
 * 在游戏截图(或指定区域)内,使用 SIFT 特征点 + KnnMatch + Lowe 比率筛选 +
 * RANSAC 单应矩阵,迭代地查找模板图的所有出现位置。相比 TemplateMatch
 * (CCoeffNormed),SIFT 对缩放/旋转/局部遮挡更鲁棒,但更慢且需要纹理足够丰富。
 */

const cv = OpenCvSharp.OpenCvSharp;
const KeyPointType = cv.KeyPoint;

/**
 * matchSift 默认参数
 *
 * @property {number} maxInstances    最多返回多少个实例
 * @property {number} minMatches      Lowe ratio 通过数下限,低于此值不再尝试
 * @property {number} ratioThreshold  Lowe 比率测试阈值,越小越严格(0~1)
 * @property {number} ransacThreshold RANSAC 重投影像素阈值
 * @property {number} minInliers      RANSAC 内点数下限,低于此值丢弃该实例
 * @property {number} minInlierRatio  内点占比下限(inliers/matchCount),低于此值丢弃,
 *                                    主要相似度过滤指标,真匹配通常 ≥0.6
 * @property {number} nfeatures       SIFT 最多保留的关键点数,0 表示不限制
 * @property {number} scale           下采样比例,<1 时模板和场景都先 resize 再检测,
 *                                    1.0 表示不下采样;典型 0.5 可换约 4x 提速
 */
const DEFAULTS = {
    maxInstances: 5,
    minMatches: 8,
    ratioThreshold: 0.75,
    ransacThreshold: 3.0,
    minInliers: 8,
    minInlierRatio: 0.5,
    nfeatures: 800,
    scale: 1,
};

/**
 * SIFT 多实例匹配
 *
 * @param {Mat} templateMat - 模板图(彩色或灰度均可,4 通道会用 Alpha 作掩码)
 * @param {OpenCvSharp.OpenCvSharp.Rect} [rect=null] - 搜索区域,缺省=全屏
 * @param {Partial<typeof DEFAULTS>} [options] - 各字段说明详见 DEFAULTS
 * @returns {Promise<Array<Instance>>} 按发现顺序返回的实例数组,坐标已还原到原始游戏画面
 *
 * @typedef {Object} Instance
 * @property {{x:number, y:number}} center - 模板中心投影坐标,常用作点击坐标
 * @property {{x:number, y:number, width:number, height:number}} rect - 匹配区域外接矩形
 * @property {number} score - 相似度 (RANSAC inlier 占比, 0~1),推荐用于排序
 */
export async function matchSift(templateMat, rect = null, options = null) {
    if (!templateMat) {
        log.warn("matchSift: 模板 Mat 为空");
        return [];
    }
    const opts = { ...DEFAULTS, ...(options || {}) };
    const resources = [];

    try {
        const inputs = prepareInputs(templateMat, rect, opts.scale, resources);
        const sift = own(cv.Features2D.SIFT.Create(opts.nfeatures, 3, 0.04, 10, 1.6), resources);
        const matcher = buildFlannMatcher(resources);

        const tpl = detectFeatures(sift, inputs.tplMat, /*useAlpha=*/true, resources);
        const scn = detectFeatures(sift, inputs.sceneMat, /*useAlpha=*/false, resources);

        if (tpl.kp.length < opts.minMatches || scn.kp.length < opts.minMatches) {
            log.debug("matchSift: 关键点不足 (template={0}, scene={1})", tpl.kp.length, scn.kp.length);
            return [];
        }

        const instances = findAllInstances({ matcher, opts, tpl, scn });
        return instances.map(i => toOriginalCoords(i, inputs));
    } catch (err) {
        log.error("matchSift 执行出错: {error}", err.message);
        return [];
    } finally {
        disposeAll(resources);
    }
}

// ---------- 资源管理 ----------

function own(obj, resources) {
    if (obj) resources.push(obj);
    return obj;
}

function disposeAll(resources) {
    for (let i = resources.length - 1; i >= 0; i--) {
        try { resources[i].dispose(); } catch (e) { }
    }
}

// ---------- 输入准备 ----------

/**
 * 裁剪 rect → 可选下采样,返回最终用于检测的 tplMat 和 sceneMat,以及还原信息
 * @returns {{tplMat:Mat, sceneMat:Mat, invScale:number, offset:{x:number,y:number}}}
 */
function prepareInputs(templateMat, rect, scale, resources) {
    const captureRegion = own(captureGameRegion(), resources);
    const sceneRaw = captureRegion.srcMat;

    let workMat = sceneRaw;
    let offset = { x: 0, y: 0 };
    if (rect) {
        workMat = own(new Mat(sceneRaw, rect), resources);
        offset = { x: rect.x, y: rect.y };
    }

    if (scale > 0 && scale < 1.0) {
        const tplMat = own(new Mat(), resources);
        const sceneMat = own(new Mat(), resources);
        cv.Cv2.Resize(templateMat, tplMat, new cv.Size(0, 0), scale, scale, cv.InterpolationFlags.Area);
        cv.Cv2.Resize(workMat, sceneMat, new cv.Size(0, 0), scale, scale, cv.InterpolationFlags.Area);
        return { tplMat, sceneMat, invScale: 1.0 / scale, offset };
    }

    return { tplMat: templateMat, sceneMat: workMat, invScale: 1.0, offset };
}

function buildFlannMatcher(resources) {
    const indexParams = own(new cv.Flann.KDTreeIndexParams(5), resources);
    const searchParams = own(new cv.Flann.SearchParams(50), resources);
    return own(new cv.FlannBasedMatcher(indexParams, searchParams), resources);
}

/**
 * 在 mat 上检测 SIFT 特征点和描述子
 * @param {boolean} useAlpha - 4 通道时是否用 Alpha 做掩码屏蔽透明区域
 */
function detectFeatures(sift, mat, useAlpha, resources) {
    let mask = null;
    if (useAlpha && mat.channels() === 4) {
        mask = own(new Mat(), resources);
        cv.Cv2.ExtractChannel(mat, mask, 3);
    }
    const desc = own(new Mat(), resources);
    const kpVar = host.newVarOfArr(KeyPointType, 1);
    sift.detectAndCompute(mat, mask, kpVar.out, desc);
    return { kp: Array.from(kpVar.value), desc, mat };
}

// ---------- 实例查找 ----------

function findAllInstances(ctx) {
    let availableIndices = new Array(ctx.scn.kp.length);
    for (let i = 0; i < availableIndices.length; i++) availableIndices[i] = i;

    const results = [];
    for (let iter = 0; iter < ctx.opts.maxInstances; iter++) {
        if (availableIndices.length < ctx.opts.minMatches) break;
        const instance = findOneInstance(ctx, availableIndices);
        if (!instance) break;
        results.push(instance);
        availableIndices = filterIndicesOutsideRect(ctx.scn.kp, availableIndices, instance.rect);
    }
    return results;
}

function findOneInstance(ctx, availableIndices) {
    const subDesc = buildSubDescriptors(ctx.scn.desc, availableIndices);
    let knnMatches;
    try {
        knnMatches = ctx.matcher.knnMatch(ctx.tpl.desc, subDesc, 2);
    } finally {
        try { subDesc.dispose(); } catch (e) { }
    }

    const good = loweRatioTest(knnMatches, ctx, availableIndices);
    if (good.count < ctx.opts.minMatches) return null;

    const mask = new Mat();
    const hMat = cv.Cv2.FindHomography(good.tplPts, good.scnPts,
        cv.HomographyMethods.Ransac, ctx.opts.ransacThreshold, mask);
    try {
        if (!hMat || hMat.empty()) return null;

        const inliers = cv.Cv2.CountNonZero(mask);
        const inlierRatio = inliers / good.count;
        if (inliers < ctx.opts.minInliers || inlierRatio < ctx.opts.minInlierRatio) {
            log.debug("matchSift: 实例被丢弃 (inliers={0}/{1}, ratio={2})",
                inliers, good.count, inlierRatio.toFixed(3));
            return null;
        }

        return projectInstance(hMat, ctx.tpl.mat.cols, ctx.tpl.mat.rows, inlierRatio);
    } finally {
        try { mask.dispose(); } catch (e) { }
        try { if (hMat) hMat.dispose(); } catch (e) { }
    }
}

/**
 * Lowe 比率测试 — 收集通过的点对并构造 C# Point2d 数组
 * 注意:必须先收集再分配,否则未填充的槽位会是 Point2d(0,0),把 FindHomography 拉偏到原点
 */
function loweRatioTest(knnMatches, ctx, availableIndices) {
    const outerLen = arrLen(knnMatches);
    const goodTpl = [];
    const goodScn = [];
    for (let i = 0; i < outerLen; i++) {
        const pair = knnMatches[i];
        if (arrLen(pair) < 2) continue;
        const m = pair[0];
        const n = pair[1];
        if (m.distance >= ctx.opts.ratioThreshold * n.distance) continue;

        const tKp = ctx.tpl.kp[m.queryIdx];
        const sKp = ctx.scn.kp[availableIndices[m.trainIdx]];
        goodTpl.push(tKp.pt);
        goodScn.push(sKp.pt);
    }

    const count = goodTpl.length;
    const tplPts = host.newArr(cv.Point2d, count);
    const scnPts = host.newArr(cv.Point2d, count);
    for (let i = 0; i < count; i++) {
        tplPts[i] = new cv.Point2d(goodTpl[i].x, goodTpl[i].y);
        scnPts[i] = new cv.Point2d(goodScn[i].x, goodScn[i].y);
    }
    return { count, tplPts, scnPts };
}

/**
 * 把模板四角和中心通过 homography 投影到场景,返回 Instance(workMat 下采样后局部坐标系)
 */
function projectInstance(hMat, w, h, inlierRatio) {
    const cornersIn = host.newArr(cv.Point2f, 4);
    cornersIn[0] = new cv.Point2f(0, 0);
    cornersIn[1] = new cv.Point2f(w, 0);
    cornersIn[2] = new cv.Point2f(w, h);
    cornersIn[3] = new cv.Point2f(0, h);
    const projected = Array.from(cv.Cv2.PerspectiveTransform(cornersIn, hMat));

    const centerIn = host.newArr(cv.Point2f, 1);
    centerIn[0] = new cv.Point2f(w / 2, h / 2);
    const centerOut = Array.from(cv.Cv2.PerspectiveTransform(centerIn, hMat));

    let minX = projected[0].x, maxX = minX;
    let minY = projected[0].y, maxY = minY;
    for (let i = 1; i < 4; i++) {
        const p = projected[i];
        if (p.x < minX) minX = p.x; else if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; else if (p.y > maxY) maxY = p.y;
    }

    return {
        center: { x: centerOut[0].x, y: centerOut[0].y },
        rect: {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY),
        },
        score: inlierRatio,
    };
}

// ---------- 工具函数 ----------

/** C# 数组用 .Length,JS 数组用 .length;兼容两者 */
function arrLen(x) {
    return x.Length != null ? x.Length : x.length;
}

/**
 * 把下采样空间的实例还原到原画面坐标系: 先 ×invScale 回到 workMat 局部,再加 offset
 */
function toOriginalCoords(instance, inputs) {
    const s = inputs.invScale;
    const dx = inputs.offset.x;
    const dy = inputs.offset.y;
    if (s === 1.0 && dx === 0 && dy === 0) return instance;
    return {
        center: { x: instance.center.x * s + dx, y: instance.center.y * s + dy },
        rect: {
            x: Math.round(instance.rect.x * s + dx),
            y: Math.round(instance.rect.y * s + dy),
            width: Math.round(instance.rect.width * s),
            height: Math.round(instance.rect.height * s),
        },
        score: instance.score,
    };
}

function buildSubDescriptors(sceneDesc, indices) {
    const sub = new Mat(indices.length, sceneDesc.cols, sceneDesc.type());
    for (let i = 0; i < indices.length; i++) {
        const srcRow = sceneDesc.row(indices[i]);
        const dstRow = sub.row(i);
        try {
            srcRow.copyTo(dstRow);
        } finally {
            try { srcRow.dispose(); } catch (e) { }
            try { dstRow.dispose(); } catch (e) { }
        }
    }
    return sub;
}

function filterIndicesOutsideRect(sceneKp, indices, rect) {
    const x2 = rect.x + rect.width;
    const y2 = rect.y + rect.height;
    const remaining = [];
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const pt = sceneKp[idx].pt;
        if (pt.x < rect.x || pt.x >= x2 || pt.y < rect.y || pt.y >= y2) {
            remaining.push(idx);
        }
    }
    return remaining;
}

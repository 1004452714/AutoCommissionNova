/**
 * 位置工具模块
 * 距离计算、投票定位等位置相关工具
 */

/**
 * 计算两点之间的距离
 * @param {Object} point1 - 点1 { X, Y } 或 { x, y }
 * @param {Object} point2 - 点2 { x, y }
 * @returns {number} 距离，无效数据返回 Infinity
 */
export function calculateDistance(point1, point2) {
  if (!point1 || !point2) return Infinity;
  const x1 = point1.X || point1.x;
  const y1 = point1.Y || point1.y;
  const x2 = point2.X || point2.x;
  const y2 = point2.Y || point2.y;
  if (typeof x1 !== "number" || typeof y1 !== "number" || typeof x2 !== "number" || typeof y2 !== "number") {
    return Infinity;
  }
  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

/**
 * 使用投票机制获取最可靠的地图位置
 * @returns {Promise<Object>} 位置对象 { x, y }
 */
export async function getPositionWithVoting() {
  let scale = 2.0;
  const positions = [];
  let recognitionCount = 0;

  while (scale <= 5.0 && recognitionCount < 6) {
    try {
      await genshin.setBigMapZoomLevel(scale);
      await sleep(100);
      const position = genshin.getPositionFromBigMap();
      positions.push(position);
      recognitionCount++;
    } catch (error) {
      log.debug('缩放:{0}, error:{1}', scale, error.message);
    }
    scale += 0.3;
  }

  if (positions.length > 0) {
    const clusters = [];
    for (const pos of positions) {
      let added = false;
      for (const cluster of clusters) {
        const distance = Math.sqrt(Math.pow(cluster[0].x - pos.x, 2) + Math.pow(cluster[0].y - pos.y, 2));
        if (distance < 5) { cluster.push(pos); added = true; break; }
      }
      if (!added) clusters.push([pos]);
    }
    clusters.sort((a, b) => b.length - a.length);
    if (clusters.length > 0) {
      const bestPosition = clusters[0][0];
      log.info('位置识别成功: ({x}, {y})', bestPosition.x, bestPosition.y);
      return bestPosition;
    }
  }
  throw new Error('无法从大地图中识别位置');
}

/**
 * 从路径追踪文件获取目标坐标
 * @param {string} scriptPath - 路径追踪文件路径
 * @returns {Promise<Object|null>} 目标坐标 { x, y }
 */
export async function getCommissionTargetPosition(scriptPath) {
  try {
    const scriptContent = await file.readText(scriptPath);
    const pathData = JSON.parse(scriptContent);
    if (!pathData.positions || pathData.positions.length === 0) {
      log.warn("路径追踪文件 {path} 中没有有效的坐标数据", scriptPath);
      return null;
    }
    const lastPosition = pathData.positions[pathData.positions.length - 1];
    if (!lastPosition.x || !lastPosition.y) {
      log.warn("路径追踪文件 {path} 的最后一个路径点缺少坐标数据", scriptPath);
      return null;
    }
    log.debug("从脚本路径 {path} 获取到目标坐标: ({x}, {y})", scriptPath, lastPosition.x, lastPosition.y);
    return { x: lastPosition.x, y: lastPosition.y };
  } catch (error) {
    log.error("获取委托目标坐标时出错: {error}", error.message);
    return null;
  }
}

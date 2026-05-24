/**
 * 分支配置加载器
 *
 * 磁盘存储：每个委托一个文件 process/config/branches/{委托名}.json
 * 内存视图：合并后的 composite { 委托名: config } —— 与历史单文件结构兼容，
 *           因此 branchConfigCache / commission-config-mask.html 等消费方不需要感知拆分
 *
 * 新增委托：在 BRANCHES_DIR 下扔一个 {委托名}.json 即可，无需改任何代码
 */
import { PATHS } from "../config/index.js";

function baseName(path) {
    return path.split("/").pop().split("\\").pop();
}

function commissionNameFromFile(filename) {
    return filename.replace(/\.json$/i, "");
}

function branchFilePath(commissionName) {
    return PATHS.BRANCHES_DIR + "/" + commissionName + ".json";
}

/**
 * 遍历 BRANCHES_DIR 加载所有委托的分支配置，合并成 composite 对象
 *
 * 单个文件解析失败只 log.error 并跳过，不阻断其它委托加载
 *
 * @returns {Object} { commissionName: config, ... }
 */
export function loadAllBranchConfigs() {
    let paths;
    try {
        paths = Array.from(file.readPathSync(PATHS.BRANCHES_DIR));
    } catch (error) {
        log.warn("分支配置目录不可读，使用空配置: {dir}（{err}）", PATHS.BRANCHES_DIR, error.message);
        return {};
    }

    const composite = {};
    for (const p of paths) {
        if (file.isFolder(p)) continue;
        const filename = baseName(p);
        if (!filename.toLowerCase().endsWith(".json")) continue;

        const commissionName = commissionNameFromFile(filename);
        try {
            const raw = file.readTextSync(p);
            composite[commissionName] = JSON.parse(raw);
        } catch (error) {
            log.error("分支配置文件解析失败 [{path}]: {err}", p, error.message);
        }
    }
    return composite;
}

/**
 * 写入单个委托的分支配置
 * 调用方负责传完整对象，本函数原子覆盖该文件
 *
 * @param {string} commissionName
 * @param {Object} config
 */
export function writeBranchConfig(commissionName, config) {
    const path = branchFilePath(commissionName);
    file.writeTextSync(path, JSON.stringify(config, null, 4));
}

/**
 * 把 composite 对象按委托名拆分写回各自文件
 * UI 编辑器保存 / 整体导入时使用
 *
 * 注意：本函数不会删除磁盘上 composite 中不存在的委托文件 —— 编辑器删委托的语义
 * 应该单独走"删除文件"接口，避免一次误保存清空所有别人没编辑的委托
 *
 * @param {Object} composite { commissionName: config, ... }
 */
export function writeAllBranchConfigs(composite) {
    if (!composite || typeof composite !== "object") return;
    for (const commissionName of Object.keys(composite)) {
        try {
            writeBranchConfig(commissionName, composite[commissionName]);
        } catch (error) {
            log.error("写入分支配置失败 [{name}]: {err}", commissionName, error.message);
        }
    }
}

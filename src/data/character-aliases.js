/**
 * 角色别名加载模块
 * 从 combat_avatar.json 读取角色别名映射
 */
import { PATHS } from "../config/index.js";

/**
 * 读取角色别名映射表
 * @returns {Object} 别名到标准名称的映射对象
 */
export function readAliases() {
  try {
    const combatText = file.ReadTextSync(PATHS.AVATAR_DATA);
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
    log.error("读取角色别名文件失败: {error}", error.message);
    return {};
  }
}

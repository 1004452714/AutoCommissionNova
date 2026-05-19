"""
原神角色信息提取脚本

功能：
    遍历 Avatar 目录下的所有 JSON 文件，提取角色信息并合并为一个 JSON 文件。
    提取字段：Name、Weapon（转换）、VisionBefore（添加"元素"后缀）
    输出格式：{"角色名称": {"Weapon": "武器类型", "VisionBefore": "元素类型"}}

资源文件来源：
    https://github.com/wangdage12/Snap.Metadata
    https://gitee.com/JWJUN233233/Snap.Metadata

武器类型映射：
    1 -> 单手剑
    10 -> 法器
    11 -> 双手剑
    12 -> 弓
    13 -> 长柄武器
"""

import json
import os


def main():
    """主函数：遍历角色JSON文件并提取信息"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    avatar_dir = os.path.join(script_dir, "Snap.Metadata", "Genshin", "CHS", "Avatar")
    output_path = os.path.join(script_dir, "avatar_info.json")

    weapon_map = {
        1: "单手剑",
        10: "法器",
        11: "双手剑",
        12: "弓",
        13: "长柄武器",
    }

    result = {}

    for filename in os.listdir(avatar_dir):
        if not filename.endswith(".json"):
            continue

        filepath = os.path.join(avatar_dir, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        name = data.get("Name")
        if not name:
            continue

        weapon_raw = data.get("Weapon")
        weapon = weapon_map.get(weapon_raw, str(weapon_raw))

        fetter_info = data.get("FetterInfo", {})
        vision_before = fetter_info.get("VisionBefore", "")
        if vision_before:
            vision_before = vision_before + "元素"

        result[name] = {
            "Weapon": weapon,
            "VisionBefore": vision_before,
        }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"提取完成，共 {len(result)} 个角色，已保存至: {output_path}")


if __name__ == "__main__":
    main()

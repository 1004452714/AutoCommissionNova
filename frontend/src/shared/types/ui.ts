/**
 * 遮罩页面共享选择控件类型。
 *
 * 本文件只描述前端展示选项和宽度策略，不承载业务协议字段。
 */

// 选择项保留稳定值，并可附带分组和禁用状态。
export interface UiSelectOption {
    value: string;
    label: string;
    group?: string;
    disabled?: boolean;
}

// 宽度策略区分短枚举、内容适配、表单字段和表格单元格。
export type UiSelectWidth = "compact" | "content" | "field" | "table";

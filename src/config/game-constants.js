const rect = OpenCvSharp.OpenCvSharp.Rect
/** 游戏相关常量 */
export const COMMISSION_TYPE = {
    BASIC: "BASIC",
    NPC: "NPC",
};

/**
 * 委托状态（detectCommissionStatusByImage 返回值 + 持久化到委托对象的 status 字段）
 * UNKNOWN 表示无法判定（图标识别不出 / 地点 OCR 失败 / 处理过程抛错），下游统一不执行
 */
export const COMMISSION_STATUS = {
    /** 当日已完成，跳过执行 */
    COMPLETED: "已完成",
    /** 未完成且具备执行条件（有地点） */
    UNCOMPLETED: "未完成",
    /** 状态无法判定，跳过执行 */
    UNKNOWN: "未知",
};

/**
 * 委托统一配置（OCR 区域 + 状态检查区域）
 * 每个配置项包含委托名 OCR 识别区域和完成状态检测区域
 */
export const COMMISSION_CONFIG = [
    {
        index: 0,
        ocrRegion: new rect(796, 293, 440, 40),
        statusRegion: { x: 1550, y: 320, checkX: 1450, checkWidth: 150 },
    },
    {
        index: 1,
        ocrRegion: new rect(796, 401, 440, 40),
        statusRegion: { x: 1550, y: 440, checkX: 1450, checkWidth: 150 },
    },
    {
        index: 2,
        ocrRegion: new rect(796, 509, 440, 40),
        statusRegion: { x: 1550, y: 530, checkX: 1500, checkWidth: 100 },
    },
    {
        index: 3,
        ocrRegion: new rect(796, 544, 440, 40),
        statusRegion: { x: 1550, y: 560, checkX: 1450, checkWidth: 150 },
    },
];

export const MIN_TEXT_LENGTH = 3;

export const MAX_COMMISSION_RETRY_COUNT = 1;

export const POSITION_COORDINATES = [
    [460, 538],
    [792, 538],
    [1130, 538],
    [1462, 538],
];
/**
 * 委托完成状态的检测区域
 * 
 * 需要在冒险之证-委托页面进行检测
 */
export const COMMISSION_STATUS_REGIONS = [
[1510, 270, 80, 100],
[1510, 370, 80, 100],
[1510, 470, 80, 100],
[1510, 520, 80, 100], 
];

export const COMMISSION_POSITIONING_BUTTONS = [
    {x: 1550, y: 320 },
    {x: 1550, y: 440 },
    {x: 1550, y: 530 },
    {x: 1550, y: 560 },
];


export const THRESHOLDS = {
    /** 委托名称标准化阈值，用于将 OCR 识别错的委托名称标准化为正确的委托名称 */
    COMMISSION_NAME: 0.6,
    /** 地区名称标准化阈值，用于将 OCR 识别错的地区名称标准化为正确的地区名称 */
    LOCATION: 0.6,
    /** 委托描述匹配阈值，用于将 OCR 识别的委托描述与期望描述比较（cleanText 去标点后做编辑距离） */
    COMMISSION_DESC: 0.8,
};

/** 文件路径常量 */
export const PATHS = {
    SUPPORT_LIST: "name.json",
    BASIC_SCRIPT_BASE: "process/Basic",
    NPC_PROCESS_BASE: "process/NPC",
    COMMISSIONS_DATA: "Data/commissions_data.json",
    COMPLETED_IMAGE: "Data/RecognitionObject/Completed.png",
    UNCOMPLETED_IMAGE: "Data/RecognitionObject/UnCompleted.png",
    TALK_EXIT_IMAGE: "Data/RecognitionObject/TalkExit.png",
    TALK_ICON_IMAGE: "Data/RecognitionObject/TalkIcon.png",
    F_ICON_IMAGE: "Data/RecognitionObject/F.png",
    PAIMON_MENU_IMAGE: "Data/RecognitionObject/paimon_menu.png",
    TEAM_IMAGE: "Data/RecognitionObject/team.png",
    REPLACE_IMAGE: "Data/RecognitionObject/更换.png",
    JOIN_IMAGE: "Data/RecognitionObject/加入.png",
    TEAM_CONFIG_IMAGE: "Data/RecognitionObject/队伍配置.png",
    DISABLED_UI_IMAGE: "Data/RecognitionObject/disabled_ui.png",
    ICON_BIGMAP_COMMISSION: "Data/RecognitionObject/IconBigmapCommission.jpg",
    ICON_QUESTION_COMMISSION: "Data/RecognitionObject/IconQuestionCommission.png",
    ICON_TASK_COMMISSION: "Data/RecognitionObject/IconTaskCommission.png",
    TRACK_IMAGE: "Data/RecognitionObject/TrackButton.png",
    CHARACTER_IMAGE_DIR: "Data/characterimage/",
    AVATAR_DATA: "Data/avatar/combat_avatar.json",
    CONFIG_BASE: "process/config",
};

/** 对话相关区域常量 */
export const DIALOG_REGIONS = {
    /** 对话NPC名称识别区域 */
    NPC_NAME: new rect(75, 240, 225, 60),
    /** 对话选项列表识别区域 */
    DIALOG_OPTIONS: new rect(1150, 300, 350, 400),
    /** 对话气泡图标模板匹配区域 [x, y, width, height] */
    TALK_ICON: [1260, 300, 90, 550],
    /** 对话选项OCR识别区域 */
    DIALOG_OPTIONS_OCR: new rect(1250, 250, 550, 600),
};

/** UI界面相关区域常量 */
export const UI_REGIONS = {
    /** 冒险之证-委托标签区域 */
    COMMISSION_TAB: new rect(260, 317, 89, 47),
    /** 每日委托奖励区域 */
    DAILY_COMMISSION_REWARD: new rect(427, 345, 142, 36),
    /** 追踪按钮模板匹配区域 [x, y, width, height] */
    TRACK_BUTTON: [1428, 965, 87, 86],
    /** 剧情图标识别区域 [x, y, width, height] */
    STORY_ICON: [265, 37, 30, 22],
    /** F图标识别区域 [x, y, width, height] */
    F_ICON: [1207, 0, 43, 850],
    /** 主界面派蒙菜单搜索区域 [x, y, width, height] */
    PAIMON_MENU_SEARCH: [0, 0, 500, 500],
};

/** OCR 识别区域坐标常量 */
export const OCR_REGIONS = {
    /** 冒险之证 - 委托界面 - 委托名称 */
    COMMISSION_NAME: [
        new rect(810, 293, 440, 40),
        new rect(810, 401, 440, 40),
        new rect(810, 509, 440, 40),
        new rect(810, 544, 440, 40),
    ],
    LOCATION_IN_OTHER_COUNTRY: new rect(1530, 100, 250, 30),
    LOCATION_IN_NOD_KRAI: new rect(1580, 100, 250, 30),
    DETAIL_COUNTRY: new rect(1480, 100, 55, 30),
    /** 大地图 - 选中委托后 - 取消追踪按钮 */
    COMMISSION_TRACKING: new rect(1626, 987, 127, 40),
    COMMISSION_DETAIL: new rect(76, 239, 280, 43),
};

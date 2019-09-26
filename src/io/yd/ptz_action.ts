export enum PTZAction {
    /** 0(无指令状态) */
    none = 0,         // 0(无指令状态)
    /** 1（上） */
    mv_up = 1,        // 1（上）
    /** 2（左） */
    mv_left = 2,          // 2（左）
    /** 3（下） */
    mv_down = 3,          // 3（下）
    /** 4（右） */
    mv_right = 4,         // 4（右）
    /** 5（巡航左右） */
    cruise_lr = 5,        // 5（巡航左右）
    /** 6(停止巡航) */
    cruise_stop = 6,      // 6(停止巡航)
    /** 7(聚焦) */
    focus_in = 7,         // 7(聚焦)
    /** 8(散焦) */
    focus_out = 8,        // 8(散焦)
    /** 9(放大) */
    zoom_out = 9,         // 9(放大)
    /** 10(缩小) */
    zoom_in = 10,          // 10(缩小)
    aperture_small = 11,   // 11(光圈小)
    aperture_large = 12,   // 12(光圈大)
    light_on = 13,         // 13(灯光开)
    light_off = 14,        // 14(灯光关)
    /** 15(转至预置位) */
    prepoint_moveto = 15,  // 15(转至预置位)
    /** 16(设置预置位) */
    prepoint_set = 16,     // 16(设置预置位)
    /** 17(删除预置位) */
    prepoint_del = 17,     // 17(删除预置位)
    /** 18(停止) */
    stop = 18,             // 18(停止)
    /** 19(巡航上下左右) */
    cruise_lfud = 19,      // 19(巡航上下左右)
    /** 20(巡航上下) */
    cruise_ud = 20,        // 20(巡航上下)
    /** 21(预置位轨迹巡航 开启/关闭) */
    cruise_prepoint = 21,  // 21(预置位轨迹巡航 开启/关闭)
    ptzhold_set = 22,
    ptzhold_cancel = 23,
    prepoint_get = 0x80,
    cruise_prepoint_set = 0x81,
    prepoint_buff_get = 0x82,
    menu = 0x83,
    cancel = 0x84,
    sure = 0x85
}
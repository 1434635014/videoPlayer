/// <reference types="node" />

export declare enum PTZAction {
    /** 0(无指令状态) */
    none = 0,
    /** 1（上） */
    mv_up = 1,
    /** 2（左） */
    mv_left = 2,
    /** 3（下） */
    mv_down = 3,
    /** 4（右） */
    mv_right = 4,
    /** 5（巡航左右） */
    cruise_lr = 5,
    /** 6(停止巡航) */
    cruise_stop = 6,
    /** 7(聚焦) */
    focus_in = 7,
    /** 8(散焦) */
    focus_out = 8,
    /** 9(放大) */
    zoom_out = 9,
    /** 10(缩小) */
    zoom_in = 10,
    aperture_small = 11,
    aperture_large = 12,
    light_on = 13,
    light_off = 14,
    /** 15(转至预置位) */
    prepoint_moveto = 15,
    /** 16(设置预置位) */
    prepoint_set = 16,
    /** 17(删除预置位) */
    prepoint_del = 17,
    /** 18(停止) */
    stop = 18,
    /** 19(巡航上下左右) */
    cruise_lfud = 19,
    /** 20(巡航上下) */
    cruise_ud = 20,
    /** 21(预置位轨迹巡航 开启/关闭) */
    cruise_prepoint = 21,
    ptzhold_set = 22,
    ptzhold_cancel = 23,
    prepoint_get = 128,
    cruise_prepoint_set = 129,
    prepoint_buff_get = 130,
    menu = 131,
    cancel = 132,
    sure = 133
}

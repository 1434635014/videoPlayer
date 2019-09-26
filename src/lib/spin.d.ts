
declare interface SpinnerOptions {
    lines?: number,
    length?: number,
    width?: number,
    radius?: number,
    scale?: number,
    corners?: number,
    color?: string,
    fadeColor?: string,
    animation?: string,
    rotate?: number,
    direction?: number,
    speed?: number,
    zIndex?: number,
    className?: string,
    top?: string,
    left?: string,
    shadow?: string,
    position?: string,
}

declare class Spinner {
    readonly el: HTMLElement;

    constructor(opts: SpinnerOptions);

    spin(element?: HTMLElement): Spinner;
    stop(): Spinner;
}

export { Spinner }
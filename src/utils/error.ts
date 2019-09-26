export class ArgumentNullError extends Error {
    constructor(message?: string) {
        if (message)
            super(message);
        else
            super('参数为空');
    }
}
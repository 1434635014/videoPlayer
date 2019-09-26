export class DateUtils {
    public static parseDate(str: string | null): Date {
        if (str == null) {
            return new Date(0);
        }
        else {
            return (new Date(str));
        }
    }

    public static toDateTimeString(inDate: Date, formatString: string = "yyyy-MM-dd hh:mm:ss") {
        let dateObject: { [index: string]: number } = {
            M: inDate.getMonth() + 1,
            d: inDate.getDate(),
            D: inDate.getDate(),
            H: inDate.getHours(),
            h: inDate.getHours(),
            m: inDate.getMinutes(),
            s: inDate.getSeconds(),
            Y: inDate.getFullYear(),
            y: inDate.getFullYear()
        };
        return formatString.replace(/([Yy]+|M+|[Dd]+|[Hh]+|m+|s+)/g, function (formatToken) {
            let datePart = dateObject[formatToken.slice(-1)];
            let value = datePart.toString();
            let tokenLength = Math.max(formatToken.length, value.length);
            return value.length == tokenLength ? value : ("0000" + datePart).slice(-tokenLength);
        });
    }

    public static addHours(date: Date, hours: number): Date {
        return new Date(date.getTime() + hours * 60 * 60 * 1000);
    }
}

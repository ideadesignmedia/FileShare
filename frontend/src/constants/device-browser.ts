export type DeviceType = 'Mobile' | 'Tablet' | 'Desktop' | 'Other';
export type Browser = 'Chrome' | 'Edge' | 'Opera' | 'Firefox' | 'Safari' | 'Internet Explorer' | 'Other';
export type OS = 'iOS' | 'Android' | 'Windows' | 'MacOS' | 'Unknown';
const app = 'updates' in window

export const deviceTypes: {
    Mobile: DeviceType;
    Tablet: DeviceType;
    Desktop: DeviceType;
    Other: DeviceType;
} = {
    Mobile: 'Mobile',
    Tablet: 'Tablet',
    Desktop: 'Desktop',
    Other: 'Other',
} as const

export const browsers: {
    Chrome: Browser,
    Edge: Browser,
    Opera: Browser,
    Firefox: Browser,
    Safari: Browser,
    InternetExplorer: Browser,
    Other: Browser
} = {
    Chrome: 'Chrome',
    Edge: 'Edge',
    Opera: 'Opera',
    Firefox: 'Firefox',
    Safari: 'Safari',
    InternetExplorer: 'Internet Explorer',
    Other: 'Other',
} as const

export const operatingSystems: {
    iOS: OS,
    Android: OS,
    Windows: OS,
    MacOS: OS,
    Unknown: OS
} = {
    iOS: 'iOS',
    Android: 'Android',
    Windows: 'Windows',
    MacOS: 'MacOS',
    Unknown: 'Unknown',
} as const

function checkDeviceAndBrowser(): {
    deviceType: DeviceType,
    isStandalone: boolean,
    browser: Browser,
    os: OS,
    app: boolean,
    foreground: boolean
} {
    const userAgent = navigator.userAgent;
    let deviceType: DeviceType;
    let browser: Browser;
    let os: OS;

    // Check for device type
    if (/iPhone|iPad|iPod/.test(userAgent)) {
        deviceType = /iPad/.test(userAgent) ? deviceTypes.Tablet : deviceTypes.Mobile;
        os = operatingSystems.iOS;
    } else if (/Android/.test(userAgent)) {
        deviceType = /Mobile/.test(userAgent) ? 'Mobile' : 'Tablet';
        os = operatingSystems.Android;
    } else if (/Windows NT|Macintosh/.test(userAgent)) {
        deviceType = deviceTypes.Desktop;
        os = /Windows/.test(userAgent) ? operatingSystems.Windows : operatingSystems.MacOS;
    } else {
        deviceType = deviceTypes.Other;
        os = operatingSystems.Unknown;
    }

    // Check for standalone mode using matchMedia
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    // Check for browser
    if (/CriOS/.test(userAgent)) {
        browser = browsers.Chrome;
    } else if (/EdgA|Edg/.test(userAgent)) {
        browser = browsers.Edge;
    } else if (/OPR/.test(userAgent) || /Opera/.test(userAgent)) {
        browser = browsers.Opera;
    } else if (/Firefox/.test(userAgent)) {
        browser = browsers.Firefox;
    } else if (/(Chrome|CriOS\/)/.test(userAgent)) {
        browser = browsers.Chrome;
    } else if (/Safari/.test(userAgent) && !/GSA\//.test(userAgent) && !/Chrome/.test(userAgent)) {
        browser = browsers.Safari;
    } else if (/MSIE|Trident/.test(userAgent)) {
        browser = browsers.InternetExplorer;
    } else {
        browser = browsers.Other;
    }

    return {
        deviceType: deviceType,
        isStandalone: isStandalone || app,
        browser: browser,
        os: os,
        app,
        foreground: true
    } as const
}

export const device = checkDeviceAndBrowser()

export default device
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then(() => {
        navigator.serviceWorker.addEventListener("message", async (event) => {
            if ('reload' === event.data) {
                //if (window.updateTriggerReload !== true) return window.dispatchEvent(new Event('reload'))
                window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'The app has been updated, reloading...' } }))
                window.location.reload()
            } else if ('cacheVersionUpdate' === event.data) {
                navigator.serviceWorker.getRegistrations().then(regi => {
                    const registration = regi[0]
                    if (!registration) return
                    const finishedLoading = () => {
                        if (document.readyState === 'complete') return navigator.serviceWorker.controller?.postMessage('finished-loading')
                        document.addEventListener('DOMContentLoaded', () => {
                            navigator.serviceWorker.controller?.postMessage('finished-loading')
                        })
                    }
                    let newWorker = registration.waiting || registration.installing || registration.active
                    if (newWorker?.state !== 'activated') {
                        newWorker?.postMessage('activate')
                        newWorker?.addEventListener('statechange', (e) => {
                            if (e.target?.state === 'activated') finishedLoading()
                        })
                    } else {
                        finishedLoading()
                    }
                })
            } else {
                const { type, data } = event.data
                switch (type) {
                    case 'notification': {
                        window.dispatchEvent(new CustomEvent('server-notification', { detail: data }))
                        break
                    }
                    default: {
                        console.error('Unknown message type: ', event.data)
                    }
                }
            }
        });
    }).catch(error => {
        console.error("Error registering the Service Worker: ", error);
    });
}
const cacheNumber = 178 // Always increment this number when you make changes to the frontend bundle
const cachePrefix = 'Cache-v'
const toCacheName = (cacheNumber) => `${cachePrefix}${cacheNumber}`
const cacheName = toCacheName(cacheNumber)
const exp1 = new RegExp(/\.[a-z]{2,3}\.[a-z]{2}$/i)
const exp2 = new RegExp(/\.[a-z]{2,4}$/i)
const urlProtocol = new RegExp(/^(s?ftp|wss?|https?):\/\//i);
const everythingBeforeDot = new RegExp(/\/(.*)/)
const removeLeading = new RegExp(/\\/g)
const subdomainTest = new RegExp(/\./g)
const localHost = /localhost/
const fileTest = /(\.[\w]+)+$/;
const cachedAssets = [
    '/'
].map(a => `${self.location.origin}${a}`)
const cachableUris = localHost.test(self.location.origin) ? [] : []
var manifestPromise
const startManifestPromise = () => manifestPromise = fetch('/app-file-manifest.json').then(async (response) => {
    if (!response.ok) return null
    const manifest = await response.json()
    if (manifest && manifest.version == cacheNumber && 'files' in manifest && typeof manifest.files.length === 'number') {
        for (let i = 0; i < manifest.files.length; i++) {
            const asset = manifest.files[i].uri
            if (asset && !cachedAssets.includes(asset)) {
                cachedAssets.push(asset)
            }
        }
    }
    return manifest
}).catch(e => {
    console.error('Failed to get manifest:', e)
    return null
})
function toSubdomain(url = '') {
    url = baseDomainName(url)
    if (url.match(exp1)) {
        url = url.replace(exp1, "");
    } else if (url.match(exp2)) {
        url = url.replace(exp2, "");
    }
    return url;
}
function isSubdomain(url = '') {
    url = toSubdomain(url)
    return (url.match(subdomainTest)) ? true : false;
}
function sameSubdomain(url1, url2) {
    return toSubdomain(url1) === toSubdomain(url2);
}
function baseDomainName(url = '') {
    return url.trim().replace(removeLeading, "/").replace(urlProtocol, "").replace(everythingBeforeDot, "")
}
function sameDomain(url1, url2) {
    return baseDomainName(url1) === baseDomainName(url2);
}
const domainMatch = (location, url) => {
    return sameDomain(location, url) || sameSubdomain(location, url)
}
const cachableUrl = (url) => {
    return cachableUris.some(uri => domainMatch(uri, url))
}
const reload = async () => await self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
}).then((clients) => {
    if (clients && clients.length) {
        for (let i = 0; i < clients.length; i++) {
            clients[i].postMessage('reload');
        }
    }
});
const cacheResponse = (request, response) => {
    caches.open(cacheName).then(cache => {
        cache.put(request, response)
    }).catch(e => {
        console.error('Could not cache response', e)
    })
}

const cacheAssets = async () => {
    if (manifestPromise) {
        await manifestPromise
    } else {
        startManifestPromise()
        await manifestPromise
    }
    return caches.open(cacheName).then(async (cache) => {
        const promises = []
        for (let i = 0; i < cachedAssets.length; i++) {
            const isCached = await cache.match(cachedAssets[i]).catch(e => {
                console.error('Could not check if asset is cached', e)
                return false
            })
            if (isCached) {
                continue
            }
            const url = cachedAssets[i]
            promises.push(fetch(url).then(resp => {
                if (resp.status === 200) {
                    cache.put(url, resp)
                }
            }).catch(e => {
                console.error('Could not fetch asset', url, e)
            }))
        }
        return Promise.allSettled(promises)
    })
}
self.addEventListener('install', (e) => {
    self.skipWaiting()
    e.waitUntil((() => {
        const reg = new RegExp(cachePrefix)
        let versionUpdated = true
        return caches.keys().then(async keys => {
            const cacheKeys = keys.filter(key => reg.test(key))
            const result = () => {
                const finish = () => self.clients.matchAll({
                    includeUncontrolled: true,
                    type: 'window',
                }).then((clients) => {
                    if (clients && clients.length) clients[0].postMessage('cacheVersionUpdate');
                }).catch(e => {
                    console.error('Could not send cacheVersionUpdate message to client', e)
                })
                return cacheAssets().catch(e => {
                    console.error('Could not cache assets', e)
                }).finally(() => {
                    if (versionUpdated) {
                        finish()
                    }
                })
            }
            if (!cacheKeys.length || (cacheKeys.length === 1 && cacheKeys[0] === cacheName)) {
                versionUpdated = false
                return result()
            }
            for (let i = 0; i < cacheKeys.length; i++) {
                const key = cacheKeys[i]
                if (key === cacheName) {
                    versionUpdated = false
                    continue
                }
                // optionally recache previously cached assets if not in our cachedAssets array, as those assets will be updated to a new version.
                /* await caches.open(key).then(cache => {
                    return cache.keys().then(async keys => {
                        const newCache = await caches.open(cacheName)
                        for (let i = 0; i < keys.length; i++) {
                            const req = keys[i]
                            if (cachedAssets.includes(req.url)) continue
                            newCache.put(req, await cache.match(req))
                        }
                    }).catch(e => {
                        console.error('Could not delete old cache', e)
                    })
                }) */
                caches.delete(key).catch(e => console.error('Could not delete old cache', e))
            }
            return result()
        }).catch(er => { console.error(er); return [] })
    })())
})
self.addEventListener('activate', (e) => {
    startManifestPromise()
    return e.waitUntil(self.clients.claim())
})

self.addEventListener('message', (e) => {
    const { data } = e
    if (data === 'finished-loading') reload()
    if (data === 'activate') return self.skipWaiting().catch(e => console.error(cacheNumber, 'Could not skip waiting', e))
})

self.addEventListener('fetch', (e) => {
    const { method, url, headers } = e.request
    const isCacheable = cachableUrl(url)
    if (method === 'POST' && /share.html$/.test(url)) {
        return e.respondWith(
            caches.match('/share.html').then(cached => {
                if (cached) return cached;
                return fetch('/share.html').then(resp => {
                    if (resp.ok) {
                        caches.open(CACHE_NAME).then(cache => cache.put('/share.html', resp.clone()));
                    }
                    return resp;
                });
            })
        );
    }
    if ((method === 'GET' && (cachedAssets.includes(url) || isCacheable))) {
        return e.respondWith(caches.match(e.request).then(res => {
            if (res) return res
            return fetch(self.location.origin + '/share.html').then(resp => {
                if (resp.status === 200) cacheResponse(e.request, resp.clone())
                return resp
            })
        }))
    }
    if ((method !== 'GET') || (!isCacheable && !localHost.test(self.location.origin) && !sameDomain(self.location.origin, url)) || headers.get('Force')) {
        return e.respondWith(fetch(e.request))
    }
    const respondWithFetchAndCache = () => {
        return e.respondWith(fetch(e.request).then(resp => {
            if (resp.status >= 300 && resp.status < 400) return resp
            else if (resp.status > 400) {
                return caches.open(cacheName).then(cache => {
                    return cache.match(e.request).then(res => {
                        if (res) return res
                        return resp
                    })
                }).catch((e) => {
                    console.error(e)
                    return resp
                })
            } else {
                const clone = resp.clone()
                setTimeout(() => cacheResponse(e.request, clone))
                return resp
            }
        }).catch(e => {
            return caches.open(cacheName).then(cache => {
                return cache.match(e.request).then(res => {
                    if (res) return res
                    console.error(e)
                    return null
                })
            }).catch(() => {
                console.error(e)
                return null
            })
        }))
    }
    if (method === 'GET' && sameDomain(self.location.origin, url) && !fileTest.test(new URL(url).pathname)) {
        //automatically redirect to the homepage from service worker when they request a route other than home.
        //The SPA should load and send them to the correct path within the SPA.
        //i.e if they go to /providers/payments the SPA should be responsible for routing them there via the app state logic.
        // Otherwise they will need to navigate back to where they were if they reload the current pathname and it isn't the homepage.
        return e.respondWith(Response.redirect(self.location.origin, 302));
    }
    return respondWithFetchAndCache()
})

self.addEventListener('push', function (event) {
    const data = event.data.json();
    if (!data) return;
    const { type, title, body, icon = `https://${self.location.origin}/assets/logo.png`, requireInteraction = false, silent = false, data: payload = {} } = data
    if (!type) return;
    switch (type) {
        case 'notification': {
            event.waitUntil(self.clients.matchAll({
                includeUncontrolled: true,
                type: 'window',
            }).then((clients) => {
                if (clients && clients.length) {
                    for (let i = 0; i < clients.length; i++) {
                        clients[i].postMessage({ type: 'notification', data: payload });
                    }
                } else {
                    if (Notification.permission === 'granted') {
                        self.registration.showNotification(title, {
                            body,
                            icon,
                            badge: icon,
                            requireInteraction,
                            silent,
                            data: {
                                url: '/'
                            }
                        }).catch(e => {
                            console.error('Error showing notification: ', e);
                        });
                    } else {
                        console.error('Notifications are not allowed by the user');
                    }
                }
            }).catch(e => {
                console.error('Could not send notification message to client', e)
            }));
            break
        }
        default: {
            if (Notification.permission === 'granted') event.waitUntil(
                self.registration.showNotification(title, {
                    body,
                    icon,
                    badge: icon,
                    requireInteraction,
                    silent,
                    data: {
                        url: '/'
                    }
                })
            );
            break
        }
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    if (event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});


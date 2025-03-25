require('@ideadesignmedia/config.js')
const http = require('http')
const https = require('https')
const fs = require('fs')
const {URL} = require('url')
const path = require('path')
const dist = path.join(process.cwd(), 'dist')
const sendFile = (pathname) => {
    return new Promise((resolve, reject) => {
        const {protocol} = new URL(process.env.DIST_UPDATER)
        const provider = protocol === 'https:' ? https : http
        const request = provider.request(process.env.DIST_UPDATER + pathname.replace(dist, ''), {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${process.env.AUTH}`
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                console.error('Failed request')
                return reject('Request failed')
            }
            let data = ''
            res.on('data', d => data += d.toString())
            res.on('end', () => {
                console.log('Request Success:', data)
                resolve()
            })
        })
        fs.createReadStream(pathname).pipe(request)
    })
}

!(async () => {
    const sendDir = async (pathname) => {
        if (!fs.existsSync(pathname)) throw new Error('Invalid file path')
        if (fs.statSync(pathname).isDirectory()) {
            const files = fs.readdirSync(pathname)
            for (let i = 0; i < files.length; i++) {
                await sendDir(path.join(pathname, files[i]))
            }
        } else {
            return sendFile(pathname)
        }
    }
    await sendDir(dist).catch(e => {
        console.error(e)
    })
})();
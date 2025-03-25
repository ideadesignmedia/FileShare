require('@ideadesignmedia/config.js')
const http = require('http')
const fs = require('fs')
const path = require('path')
const provider = new URL(process.env.DIST_UPDATER).protocol === 'https:' ? https : http
const request = provider.request(process.env.DIST_UPDATER + path.baseName(__filename), {
    method: 'POST',
    headers: {
        'authorization': `Bearer ${process.env.AUTH}`
    }
}, (res) => {
    if (res.statusCode !== 200) {
        console.error('Failed request')
        process.exit(1)
    }
    let data = ''
    res.on('data', d => data += d.toString())
    res.on('end', () => {
        console.log('Request Success:', data)
        process.exit(0)
    })
})
fs.createReadStream(__filename).pipe(request)
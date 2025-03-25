require('@ideadesignmedia/config.js')
const http = require('http')
const fs = require('fs')

const request = http.request({
    host: 'localhost',
    path: '/test-dist.js',
    method: 'POST',
    headers: {
        'authorization': `Bearer ${process.env.AUTH}`
    },
    port: process.env.PORT
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
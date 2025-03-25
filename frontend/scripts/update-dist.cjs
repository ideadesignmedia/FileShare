require('@ideadesignmedia/config.js')
const fs = require('fs')
const path = require('path')
const http = require('http')
const dist = path.join(process.cwd(), 'dist')

const server = http.createServer((req, res) => {
    const { headers, url: pathName } = req
    const { authorization } = headers
    if (!authorization || authorization.split('Bearer ')[1] !== process.env.AUTH) {
        res.writeHead(401, 'Unauthorized')
        res.end()
        return
    }
    const destination = path.join(dist, pathName)
    fs.mkdirSync(path.dirname(destination), {recursive: true})
    const writer = fs.createWriteStream(destination)
    req.pipe(writer)
    req.on('end', () => {
        res.writeHead(200, '', {'Content-Type': 'text/plain'})
        res.write(`Successfully updated ${pathName}`)
        res.end()
    })
})

server.listen(process.env.PORT)

console.log("Server open on port: ", process.env.PORT)
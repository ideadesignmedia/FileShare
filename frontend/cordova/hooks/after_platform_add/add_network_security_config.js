#!/usr/bin/env node


const fs = require('fs')
const path = require('path')

const cordova = path.dirname(path.dirname(__dirname))
module.exports = () => {
    fs.writeFileSync(path.join(cordova, 'platforms', 'android', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>
    <network-security-config>
        <domain-config cleartextTrafficPermitted="true">
            <domain includeSubdomains="true">localhost</domain>
        </domain-config>
    </network-security-config>`)
    console.log("Added network security config.")
}
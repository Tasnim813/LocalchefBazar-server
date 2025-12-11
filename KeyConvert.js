const fs = require('fs');
const key = fs.readFileSync('./Service-key.json')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)
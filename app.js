var express = require('express')
var config = require('config')
var bodyParser = require('body-parser')
var request = require('request')

var app = express()
var port = process.env.PORT || 3000
app.listen(port)
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === validationToken) {
        res.status(200).send(req.query['hub.challenge'])
    } else {
        res.sendStatus(403)
    }
})
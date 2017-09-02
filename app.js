var express = require('express')
var config = require('config')
var bodyParser = require('body-parser')
var request = require('request')

var app = express()
var port = process.env.PORT || 3000
app.listen(port)
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

var appSecret = process.env.MESSENGER_APP_SECRET ? process.env.MESSENGER_APP_SECRET : config.get('appSecret')
var validationToken = process.env.MESSENGER_VALIDATION_TOKEN ? (process.env.MESSENGER_VALIDATION_TOKEN) : config.get('validationToken')
var pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN ? (process.env.MESSENGER_PAGE_ACCESS_TOKEN) : config.get('pageAccessToken')
var serverUrl = process.env.MESSENGER_SERVER_URL ? process.env.MESSENGER_SERVER_URL : config.get('serverUrl')

app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === validationToken) {
        res.status(200).send(req.query['hub.challenge'])
    } else {
        res.sendStatus(403)
    }
})
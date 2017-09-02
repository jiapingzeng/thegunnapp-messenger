var express = require('express')
var config = require('config')
var bodyParser = require('body-parser')
var request = require('request')
var moment = require('moment')

var app = express()
var port = process.env.PORT || 3000
app.listen(port)
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

var appSecret = process.env.MESSENGER_APP_SECRET ? process.env.MESSENGER_APP_SECRET : config.get('appSecret')
var validationToken = process.env.MESSENGER_VALIDATION_TOKEN ? (process.env.MESSENGER_VALIDATION_TOKEN) : config.get('validationToken')
var pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN ? (process.env.MESSENGER_PAGE_ACCESS_TOKEN) : config.get('pageAccessToken')
var apiUrl = process.env.MESSENGER_API_URL ? process.env.MESSENGER_API_URL : config.get('apiUrl')

app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === validationToken) {
        res.status(200).send(req.query['hub.challenge'])
    } else {
        res.sendStatus(403)
    }
})

app.post('/webhook', (req, res) => {
    var data = req.body
    if (data.object === 'page') {
        data.entry.forEach((entry) => {
            entry.messaging.forEach((event) => {
                if (event.message) {
                    receivedMessage(event)
                } else if (event.postback) {
                    receivedPayload(event)
                } else {
                    console.log('received unknown event: ' + event)
                }
            })
        })
        res.status(200).send()
    }
})

var receivedMessage = (event) => {
    var senderId = event.sender.id
    var message = event.message
    var messageText = message.text
    if(messageText) {
        console.log('received message "' + messageText + '" from ' + senderId)
        switch(messageText) {
            default:
                sendGenericMessage(senderId)
        }
    }
}

var receivedPayload = (event) => {
    var senderId = event.sender.Id
    var payload = event.postback.payload
    switch(payload) {
        case 'SCHEDULE_TODAY':
            sendTextMessage(senderId, getSchedule(moment().format()))
            break
        case 'SCHEDULE_TOMORROW':
            sendTextMessage(senderId, getSchedule(moment().add(1, 'days').format()))
            break
    }
}

var getSchedule = (time) => {
    var regular = true
    var day = moment(time).format('dddd')
    if (regular) {
        switch(day) {
            case 'Saturday':
            case 'Sunday':
                return 'There\'s no school, silly'
                break
            default:
                return 'It\'s a regular schedule day!'
        }
    }    
}

var sendGenericMessage = (recipientId) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: 'What would you like to do?',
                    buttons: [
                        {
                            type: 'postback',
                            title: 'Today\'s schedule',
                            payload: 'SCHEDULE_TODAY'
                        }, {
                            type: 'postback',
                            title: 'Tomorrow\'s schedule',
                            payload: 'SCHEDULE_TOMORROW'
                        }
                    ]
                }
            }
        }
    }
    callSendAPI(messageData)
}

var sendTextMessage = (recipientId, messageText) => {
    var messageData = {
        recipient: { id: recipientId },
        message: { text: messageText }
    }
    callSendAPI(messageData)
}

var callSendAPI = (messageData) => {
    request({
        uri: apiUrl,
        qs: { access_token: pageAccessToken },
        method: 'POST',
        json: messageData
    }, (err, res, body) => {
        if (!err && res.statusCode == 200) {
            var recipientId = body.recipient_id
            var messageId = body.message_id
        }
    })
}
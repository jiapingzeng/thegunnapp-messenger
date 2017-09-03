var express = require('express')
var config = require('config')
var bodyParser = require('body-parser')
var request = require('request')
var moment = require('moment-timezone')

var app = express()
var port = process.env.PORT || 3000
app.listen(port)
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

var appSecret = process.env.MESSENGER_APP_SECRET ? process.env.MESSENGER_APP_SECRET : config.get('appSecret')
var validationToken = process.env.MESSENGER_VALIDATION_TOKEN ? (process.env.MESSENGER_VALIDATION_TOKEN) : config.get('validationToken')
var pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN ? (process.env.MESSENGER_PAGE_ACCESS_TOKEN) : config.get('pageAccessToken')
var messengerUrl = process.env.MESSENGER_API_URL ? process.env.MESSENGER_API_URL : config.get('messengerUrl')
var googleApiKey = process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY : config.get('googleApiKey')
var calendarId = process.env.GOOGLE_CALENDAR_ID ? process.env.GOOGLE_CALENDAR_ID : config.get('calendarId')
var calendarUrl = process.env.GOOGLE_CALENDAR_API_URL ? process.env.GOOGLE_CALENDAR_API_URL : config.get('calendarUrl')

var regularSchedule = require('./schedule')

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
        var match = messageText.toLowerCase()
        // this is terrible but im too dum to fix
        if (match.includes('monday')) {
            sendTextMessage(senderId, 'A regular schedule Monday looks like: \n' + getRegularSchedule('Monday'))
        } else if (match.includes('tuesday')) {
            sendTextMessage(senderId, 'A regular schedule Tuesday looks like: \n' + getRegularSchedule('Tuesday'))
        } else if (match.includes('wednesday')) {
            sendTextMessage(senderId, 'A regular schedule Wednesday looks like: \n' + getRegularSchedule('Wednesday'))
        } else if (match.includes('thursday')) {
            sendTextMessage(senderId, 'A regular schedule Thursday looks like: \n' + getRegularSchedule('Thursday'))
        } else if (match.includes('friday')) {
            sendTextMessage(senderId, 'A regular schedule Friday looks like: \n' + getRegularSchedule('Friday'))
        } else {
            sendGenericMessage(senderId)
        }
    }
}

var receivedPayload = (event) => {
    var senderId = event.sender.id
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
    var alternateSchedule = callCalendarApi(moment(time).format())
    if (alternateSchedule) {
        return alternateSchedule
    } else {
        var day = moment(time).tz('America/Los_Angeles').format('dddd')
        switch(day) {
            case 'Saturday':
            case 'Sunday':
                return 'There\'s no school, silly!'
                break
            default:
                return 'It\'s a regular schedule ' + day + '! The schedule looks like: \n' + getRegularSchedule(day)
        }
    }    
}

var getRegularSchedule = (day) => {
    return regularSchedule[day]
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
                    text: 'What would you like to see?',
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
    console.log(messageData)
    callSendApi(messageData)
}

var sendTextMessage = (recipientId, messageText) => {
    var messageData = {
        recipient: { id: recipientId },
        message: { text: messageText }
    }
    console.log(messageData)
    callSendApi(messageData)
}

var callSendApi = (messageData) => {
    request({
        uri: messengerUrl,
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

var callCalendarApi = (time) => {
    request({
        uri: calendarUrl.replace('calendarId', calendarId),
        qs: {
            key: googleApiKey,
            singleEvents: true,
            timeMin: moment(time).tz('America/Los_Angeles').startOf('day').format(),
            timeMax: moment(time).tz('America/Los_Angeles').add(1, 'day').startOf('day').format()
        },
        method: 'GET'
    }, (err, res, data) => {
        if (!err && res.statusCode == 200) {
            data = JSON.parse(data.trim())
            for (var i = 0; i < data.items.length; i++) {
                var event = data.items[i]
                if (event.summary && event.summary.toLowerCase().includes('schedule')) {
                    return 'Seems like there is an alternate schedule! Here it is: \n' + event.description
                }                                
            }
            return false
        }
    })
}
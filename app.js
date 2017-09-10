var express = require('express')
var config = require('config')
var bodyParser = require('body-parser')
var request = require('request')
var moment = require('moment-timezone')
var path = require('path')

var app = express()
var port = process.env.PORT || 3000
app.listen(port)
app.use(express.static(path.join(__dirname, 'public')))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

var appUrl = process.env.APP_URL ? process.env.APP_URL : config.get('appUrl')
var appSecret = process.env.MESSENGER_APP_SECRET ? process.env.MESSENGER_APP_SECRET : config.get('appSecret')
var validationToken = process.env.MESSENGER_VALIDATION_TOKEN ? (process.env.MESSENGER_VALIDATION_TOKEN) : config.get('validationToken')
var pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN ? (process.env.MESSENGER_PAGE_ACCESS_TOKEN) : config.get('pageAccessToken')
var messengerUrl = process.env.MESSENGER_API_URL ? process.env.MESSENGER_API_URL : config.get('messengerUrl')
var googleApiKey = process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY : config.get('googleApiKey')
var calendarId = process.env.GOOGLE_CALENDAR_ID ? process.env.GOOGLE_CALENDAR_ID : config.get('calendarId')
var calendarUrl = process.env.GOOGLE_CALENDAR_API_URL ? process.env.GOOGLE_CALENDAR_API_URL : config.get('calendarUrl')

console.log('server started')

var regularSchedule = require('./schedule')

app.get('/', (req, res) => {
    res.redirect('https://www.facebook.com/TheGunnApp-510499992673080/')
})

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
    var messageAttachments = message.attachments
    if (messageText) {
        console.log('received message "' + messageText + '" from ' + senderId)
        if (matchDateStr(messageText)) {
            var m = moment(messageText, 'MM/DD/YYYY')
            if (m.isValid()) {
                getSchedule(senderId, m.format())
            } else {
                sendTextMessage(senderId, 'That doesn\'t look like a valid date. Please try again.')
            }
            return
        }
        var match = messageText.toLowerCase()
        switch (match) {
            case 'monday':
            case 'tuesday':
            case 'wednesday':
            case 'thursday':
            case 'frday':
                sendTextMessage(senderId, 'A regular ' + capFirstChar(match) + ' schedule looks like: \n' + getRegularSchedule(match))
                break
            case 'today':
                getSchedule(senderId, moment().format())
                break
            case 'tomorrow':
                getSchedule(senderId, moment().add(1, 'days').format())
                break
            case 'download':
                sendDownloadLinks(senderId)
                break
            case 'map':
                sendImage(senderId, appUrl + 'campusmap.jpg')
                break
            case 'help':
                sendHelpMessage(senderId)
                break
            default:
                sendGenericMessage(senderId)
        }
    } else if (messageAttachments) {
        sendGenericMessage(senderId, 'We can\'t tell what that is. Would you like to try one of these options?')
    }
}

var receivedPayload = (event) => {
    var senderId = event.sender.id
    var payload = event.postback.payload
    switch (payload) {
        case 'SCHEDULE_TODAY':
            getSchedule(senderId, moment().format())
            break
        case 'SCHEDULE_TOMORROW':
            getSchedule(senderId, moment().add(1, 'days').format())
            break
        case 'DOWNLOAD':
            sendDownloadLinks(senderId)
            break
        case 'START':
            sendTextMessage(senderId, 'Welcome! Text "Today" to see today\'s bell schedule, or text "Help" to see (some of) all available options')
            break
        case 'HELP':
            sendHelpMessage(senderId)
            break
        case 'HELP_GET_SCHEDULE':
            sendTextMessage(senderId, 'Text "Today", "Tomorrow", or a specific date (in MM/DD/YYYY format) to see the day\'s schedule')
            break
        case 'HELP_DOWNLOAD_APP':
            sendTextMessage(senderId, 'Use "Download" to download TheGunnApp for iOS or Android')
            break
        case 'HELP_VIEW_MAP':
            sendTextMessage(senderId, 'Type "Map" to view the campus map (more map features are in the works!)')
            break
    }
}

var getSchedule = (senderId, time) => {
    callCalendarApi(moment(time).format(), (res) => {
        if (res) {
            sendTextMessage(senderId, res)
        } else {
            var day = moment(time).tz('America/Los_Angeles').format('dddd')
            switch (day) {
                case 'Saturday':
                case 'Sunday':
                    sendTextMessage(senderId, 'There\'s no school, silly!')
                    break
                default:
                    sendTextMessage(senderId, 'It\'s a regular schedule ' + day + '! The schedule looks like: \n' + getRegularSchedule(day))
            }
        }
    })
}

var getRegularSchedule = (day) => {
    return regularSchedule[capFirstChar(day)]
}

var sendTextMessage = (recipientId, messageText) => {
    var messageData = {
        recipient: { id: recipientId },
        message: { text: messageText }
    }
    console.log(messageData)
    callSendApi(messageData)
}

var sendGenericMessage = (recipientId, text) => {
    var messageData = {
        recipient: { id: recipientId },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: text ? text : 'What would you like to see?',
                    buttons: [
                        {
                            type: 'postback',
                            title: 'Today\'s schedule',
                            payload: 'SCHEDULE_TODAY'
                        }, {
                            type: 'postback',
                            title: 'Tomorrow\'s schedule',
                            payload: 'SCHEDULE_TOMORROW'
                        }, {
                            type: 'postback',
                            title: 'More options',
                            payload: 'HELP'
                        }
                    ]
                }
            }
        }
    }
    console.log(messageData)
    callSendApi(messageData)
}

var sendDownloadLinks = (recipientId, text) => {
    var messageData = {
        recipient: { id: recipientId },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: text ? text : 'Which platform would you like to download the app for?',
                    buttons: [
                        {
                            type: 'web_url',
                            url: 'https://itunes.apple.com/app/thegunnapp/id1141159201',
                            title: 'iOS'
                        },
                        {
                            type: 'web_url',
                            url: 'https://play.google.com/store/apps/details?id=xyz.dchen.thegunnapp',
                            title: 'Android'
                        }
                    ]
                }
            }
        }
    }
    console.log(messageData)
    callSendApi(messageData)
}

var sendImage = (recipientId, image) => {
    var messageData = {
        recipient: { id: recipientId },
        message: {
            attachment: {
                type: 'image',
                payload: { url: image }
            }
        }
    }
    console.log(messageData)
    callSendApi(messageData)
}

var sendHelpMessage = (recipientId) => {
    var messageData = {
        recipient: { id: recipientId },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: 'Thanks for trying TheGunnApp Messenger botᵇᵉᵗᵃ! Here are some things you can do:',
                    buttons: [
                        {
                            type: 'postback',
                            title: 'Get schedule',
                            payload: 'HELP_GET_SCHEDULE'
                        }, {
                            type: 'postback',
                            title: 'Download app',
                            payload: 'HELP_DOWNLOAD_APP'
                        }, {
                            type: 'postback',
                            title: 'View campus map',
                            payload: 'HELP_VIEW_MAP'
                        }
                    ]
                }
            }
        }
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

var callCalendarApi = (time, cb) => {
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
                var summary = event.summary.toLowerCase()
                if (summary && summary.includes('schedule')) {
                    cb && cb('Seems like there is an alternate schedule! Here it is: \n' + event.description)
                } else if (summary && (summary.includes('holiday') ||
                    summary.includes('break') ||
                    summary.includes('no school') ||
                    summary.includes('no students'))) {
                    cb && cb('There\'s no school! Enjoy your day off!')
                }
            }
        }
    })
}

var capFirstChar = (s) => {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

var matchDateStr = (s) => {
    // MM/DD/YYYY
    var regex = /(0?[1-9]|1[0-2])[\/](0?[1-9]|[12][0-9]|3[01])[\/]20\d{2}/
    return regex.test(s)
}
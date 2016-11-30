'use strict';

var fs = require('fs');

if (!fileExists("./config.js")) {
    console.log("error config.js is missing");
    return;
}

//dependencies
var config = require('./config'),
    express = require('express'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    http = require('http'),
    https = require('https'),
    request = require('request'),
    session = require('express-session'),
    mongoStore = require('connect-mongo')(session),
    passport = require('passport'),
    mongoose = require('mongoose'),
    path = require('path'),
    helmet = require('helmet'),
    morgan = require('morgan'),
    FileStreamRotator = require('file-stream-rotator'),
    google = require('googleapis'),
    crypto = require('crypto'),
    jwt = require('jsonwebtoken'),
    csrf = require('csurf');

var morgan = require('morgan')
var winston = require('winston');

if (process.env.SENTRY_TOKEN_AUTH) {
    var raven = require('raven');
    var client = new raven.Client(process.env.SENTRY_TOKEN_AUTH);
    client.patchGlobal();
}

//create express app
var app = express();

app.jwt = jwt;
app.fs = fs;

var OAuth2 = google.auth.OAuth2;
app.oauth2Client = new OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
app.google = google;

app.reqmod = request;
app.crypto = crypto;

var logDirectory = __dirname + '/log'

// ensure log directory exists
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory)

// create a rotating write stream
var accessLogStream = FileStreamRotator.getStream({
    date_format: 'YYYYMMDD',
    filename: logDirectory + '/access-%DATE%.log',
    frequency: 'daily',
    verbose: false
})

app.config = config;
app.locals.baseUrl = app.config.baseUrl;

// setup the logger
//app.use(morgan(app.config.logFormat, {stream: accessLogStream}))
var logger = new winston.Logger({
    transports: [
        new winston.transports.File({
            level: 'info',
            filename: process.env.AUTHENT_LOG_FILE_PATH,
            handleExceptions: true,
            json: true,
            maxsize: 50000000, //50MB
            maxFiles: 1,
            colorize: false
        }),
        new winston.transports.Console({
            level: 'debug',
            handleExceptions: true,
            json: false,
            colorize: true
        })
    ],
    exitOnError: false
});

logger.stream = {
    write: function (message, encoding) {
        logger.info(message);
    }
};

app.logger = logger;

app.use(require("morgan")("combined", {
    "stream": logger.stream
}));

// create api router
app.api = createApiRouter(app.config, morgan, accessLogStream, logger);

// mount api before csrf is appended to the app stack
app.use(app.config.baseUrl + '/api/v' + app.config.api.version, app.api);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Avoids DEPTH_ZERO_SELF_SIGNED_CERT error for self-signed certs

//setup server
var server;
var protocol = 'http';

if (("httpsConfig" in config) && ("key" in config.httpsConfig) && ("pem" in config.httpsConfig) && fileExists(config.httpsConfig.key) && fileExists(config.httpsConfig.pem)) {
    server = https.createServer({
        key: fs.readFileSync(config.httpsConfig.key),
        cert: fs.readFileSync(config.httpsConfig.pem)
    }, app);
    protocol = 'https';
} else {
    server = http.createServer(app);
}

//setup mongoose
mongoose.Promise = global.Promise;
app.db = mongoose.createConnection(config.mongodb.uri);
app.db.on('error', console.error.bind(console, 'mongoose connection error: '));
app.db.once('open', function () {
    //and... we have a data store
});

//config data models
require('./models')(app, mongoose);

//settings
app.disable('x-powered-by'); //disable x-powered-by: Express HTTP header
app.set('port', config.port);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

//middleware
app.use(require('compression')());
app.use(app.config.baseUrl, require('serve-static')(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(cookieParser(config.cryptoKey));
app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: config.cryptoKey,
    store: new mongoStore({
        url: config.mongodb.uri
    })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(csrf({
    cookie: {
        signed: true
    }
}));
helmet(app);

//response locals
app.use(function (req, res, next) {
    res.cookie('_csrfToken', req.csrfToken());
    res.locals.user = {};
    res.locals.user.defaultReturnUrl = req.user && req.user.defaultReturnUrl();
    res.locals.user.username = req.user && req.user.username;
    next();
});

//global locals
app.locals.projectName = app.config.projectName;
app.locals.copyrightYear = new Date().getFullYear();
app.locals.copyrightName = app.config.companyName;

//setup passport
require('./passport')(app, passport);

if ("authentication_thirdpart" in app.config && "google_oauth_cors_filter" in app.config.authentication_thirdpart) {
    app.all(app.config.authentication_thirdpart.google_oauth_cors_filter, [require('./middlewares/googlecors')]);
}

//setup routes
require('./routes')(app);

//setup utilities
app.utility = {};
app.utility.sendmail = require('./util/sendmail');
app.utility.slugify = require('./util/slugify');
app.utility.workflow = require('./util/workflow');

// launch listening loop
server.listen(app.get('port'), function () {
    app.logger.log('info', "Server listening at " + protocol + "://%s:%s", server.address().address, server.address().port);

})

function createApiRouter(config, morgan, accessLogStream, logger) {

    var router = new express.Router();
    router.use(bodyParser.urlencoded({
        extended: true
    }));
    router.use(bodyParser.json());

    router.app = app;

    if ("jwt" in app.config && "secret" in app.config.jwt && "private_key" in app.config.jwt) {
        router.all('/oauth/ext/*', [require('./middlewares/jwtcors')]);
    } else {
        logger.log('error', 'jwt not specified in configuration')
    }
    // setup the logger
    //router.use(morgan(config.logFormat, {stream: accessLogStream}))

    //setup routes
    require('./apiRoutes')(router, app);

    return router
}

function fileExists(path) {

    try {
        return fs.statSync(path).isFile();
    } catch (e) {

        if (e.code == 'ENOENT') { // no such file or directory. File really does not exist
            return false;
        }

        console.log("Exception fs.statSync (" + path + "): " + e);
        throw e; // something else went wrong, we don't have rights, ...
    }
}

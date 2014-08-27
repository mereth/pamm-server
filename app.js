var debug = require('debug')('pamm-server');
var express = require('express');
var mongodb = require('mongodb').MongoClient;

var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);

var fs = require('fs');
var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');
var apiUsage = require('./routes/api-usage');

var serverip = (process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1");
var serverport = (process.env.OPENSHIFT_NODEJS_PORT || 8080);
var mongodburl = (process.env.OPENSHIFT_MONGODB_DB_URL || 'mongodb://localhost/') + 'pamm';

var database;
var settings;

var initialize = function(done) {
    mongodb.connect(mongodburl, function(err, db) {
        if(err) throw err;
        
        database = db;
        db.collection('settings').findOne(function(err, result) {
            if(err) throw err;
            
            settings = result;
            done();
        });
    });
}

var start = function() {
    var app = express();
    
    var devmode = (app.get('env') === 'development');
    var sessionStore = new MongoStore({ db: database });
    
    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');
    
    app.enable('trust proxy');
    
    app.use(favicon());
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded());
    app.use(cookieParser());
    
    app.use(require('stylus').middleware(path.join(__dirname, 'public')));
    app.use(express.static(path.join(__dirname, 'public')));
    
    //app.use(session({ name: 'pamm-server', secret: settings.cookie_secret, resave: false, saveUninitialized: false, store: sessionStore }));
    app.use(passport.initialize());
    app.use(passport.session());
    
    // Make the database accessible to our router
    app.use(function(req,res,next){
        req.database = database;
        next();
    });
    
    var strategySettings = {
        clientID: settings.github_client_id,
        clientSecret: settings.github_client_secret,
        callbackURL: settings.github_callback_url
    };
    passport.use(new GitHubStrategy(strategySettings, function(accessToken, refreshToken, profile, done) {
        var user = {
            _id: profile.id,
            displayName: (profile.displayName || profile.username),
            username: profile.username,
            accessToken: accessToken
        }
        database.collection('users').save(user, function(err) {
            done(err, profile.id);
        });
    }));
    
    app.get('/login', passport.authenticate('github', { scope: 'read:org' }));
    app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/error' }), function(req, res) {
        // Successful authentication, redirect home.
        res.redirect('/');
    });
    app.get('/logout', function(req, res){
        req.logout();
        res.redirect('/');
    });
    
    
    app.use('/', routes);
    app.use('/users', users);
    app.use('/api/usage', apiUsage);
    
    // catch 404 and forward to error handler
    app.use(function(req, res, next) {
        var err = new Error('Not Found');
        err.status = 404;
        next(err);
    });
    
    // error handler
    app.use(function(err, req, res, next) {
        var data = {
            message: err.message,
            error: devmode ? err : {}
        }
        
        res.status(err.status || 500);
        if(req.path.indexOf('/api/') === 0)
            res.send(data);
        else
            res.render('error', data);
    });
    
    // Passport session setup.
    // To support persistent login sessions, Passport needs to be able to
    // serialize users into and deserialize users out of the session.
    passport.serializeUser(function(id, done) {
        done(null, id);
    });
    passport.deserializeUser(function(id, done) {
        database.collection('users').findOne({_id: id}, function(err, user) {
            done(err, user);
        });
    });
    
    apiUsage.init(database);
    
    var server = app.listen(serverport, serverip, function() {
        debug('Express server listening on ' + server.address().address + ':' + server.address().port);
    });
};

initialize(start);

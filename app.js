var debug = require('debug')('pamm-server');
var express = require('express');
var mongodb = require('mongodb').MongoClient;

var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');
var usage = require('./routes/usage');

var app = express();

var devmode = (app.get('env') === 'development');
var serverip = (process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1");
var serverport = (process.env.OPENSHIFT_NODEJS_PORT || 8080);
var mongodburl = (process.env.OPENSHIFT_MONGODB_DB_URL || 'mongodb://localhost/') + 'pamm';

mongodb.connect(mongodburl, function(err, database) {
    if(err) throw err;
    
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
    
    // Make the database accessible to our router
    app.use(function(req,res,next){
        req.database = database;
        next();
    });
    
    app.use('/', routes);
    app.use('/users', users);
    app.use('/api/usage', usage);
    
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

    // start the server
    var server = app.listen(serverport, serverip, function() {
        debug('Express server listening on ' + server.address().address + ':' + server.address().port);
    });
});
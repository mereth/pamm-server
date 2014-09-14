var express = require('express');
var router = express.Router();
var _ = require('lodash');

var db;

/* GET events */
router.get('/', function(req, res, next) {
    db = req.database;
    db.collection('events').find({},{sort: {$natural: -1}, limit: 10}).toArray(function(err, events) {
        if(err) return next(err);
        
        _.forEach(events, function(event) {
            delete event._id;
        });
        
        res.send(events);
    });
});


module.exports = router;

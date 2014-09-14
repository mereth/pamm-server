var express = require('express');
var router = express.Router();
var _ = require('lodash');

var db;

/* GET users */
router.get('/', function(req, res, next) {
    db = req.database;
    db.collection('users').find().toArray(function(err, users) {
        if(err) return next(err);
        
        _.forEach(users, function(user) {
            delete user.accessToken;
        });
        
        res.send(users);
    });
});


module.exports = router;

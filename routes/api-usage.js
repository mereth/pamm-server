var express = require('express');
var router = express.Router();

var validActions = { "install" : true, "uninstall" : true, "update" : true };

/* GET usage listing */
router.get('/', function(req, res) {
    var db = req.database;

    db.collection('usage').aggregate([
        { $match: { action: { $in : ["install", "update"] } } },
        { $group: { _id: "$identifier", total: { $sum: 1 } } },
    ]
    , function(err, result) {
        if(err) throw err;
        res.send(result);
    });
});

/* POST add usage entry */
router.post('/', function(req, res) {
    var db = req.database;
    
    var identifier = req.body.identifier;
    if(!identifier) throw new Error("Missing identifier parameter");
    
    var action = (req.body.action || "install");
    if(!validActions[action]) throw new Error("Invalid action parameter");
    
    var document = {
        identifier: identifier
        ,action: action
        ,date: new Date()
        ,agent: req.get('User-Agent')
        ,ip: req.ip
    };
    
    db.collection('usage').insert(document, function(err, result) {
        if(err) throw err;
        res.send();
    });
});


module.exports = router;

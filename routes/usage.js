var express = require('express');
var router = express.Router();

/* GET usage listing */
router.get('/', function(req, res) {
    var db = req.database;

    db.collection('download').aggregate([
        { $group: { _id: "$identifier", total: { $sum: 1 } } },
    ]
    , function(err, result) {
        if(err) throw err;
        res.send(result);
    });
    
    // var collection = db
    // .collection('downloads.view')
    // .find({})
    // .toArray(function(err, docs) {
        // if(err) throw err;
        // var json = JSON.stringify(docs);
        // self.cache_put('/api/v1/modcount', json)
        // res.send(json);
    // });
});

/* POST add usage entry */
router.post('/', function(req, res) {
    var db = req.database;
    
    var identifier = req.body.identifier;
    if(!identifier) throw new Error("Missing identifier parameter");
    
    var document = {
        identifier: identifier
        ,date: new Date()
        ,agent: req.get('User-Agent')
        ,ip: req.ip
    };
    
    db.collection('downloads').insert(document, function(err, result) {
        if(err) throw err;
        res.send();
    });
});


module.exports = router;

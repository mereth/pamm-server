var express = require('express');
var router = express.Router();

var db;
var validActions = { "install" : true, "uninstall" : true, "update" : true };

var usageCache = {};

/* GET usage listing */
router.get('/', function(req, res) {
    res.send(usageCache);
});

/* POST add usage entry */
router.post('/', function(req, res) {
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

var getUsageStatistics = function() {
    var onerror = function(err) {
        console.log('# getUsageStatistics: ' + err );
    };
    
    getUsageTotal(function(err, usagetotal) {
        if(err) return onerror(err);
        
        getUsagePopularity(function(err, usagepop) {
            if(err) return onerror(err);
            
            var mappop = {};
            var minIndice = 0;
            var maxIndice = 0;
            for(var i in usagepop) {
                var pop = usagepop[i];
                var indice = pop.value.install - pop.value.uninstall;
                
                minIndice = Math.min(indice, minIndice);
                maxIndice = Math.max(indice, maxIndice);
                
                mappop[pop._id] = indice;
            }
            
            var popunit = 100 / (maxIndice - minIndice);
            
            process.nextTick(function() {
                var result = [];
                for(var i in usagetotal) {
                    var total = usagetotal[i];
                    total = {
                        identifier: total._id,
                        total: total.value
                    };
                    
                    var popularity = (mappop[total.identifier] || 0);
                    total.popularity = Math.round((popularity - minIndice) * popunit);
                    
                    result.push(total);
                }
                
                usageCache = result;
            });
        });
    });
};

var getUsageTotal = function(done) {
    db.collection('usage').aggregate([
            { $match: { action: { $in : ["install", "update"] } } },
            { $group: { _id: "$identifier", value: { $sum: 1 } } }
        ]
        , done
    );
};

var getUsagePopularity = function(done) {
    var lastweek = new Date();
    lastweek.setHours(lastweek.getHours() - 164);
    
    db.collection('usage').mapReduce(
        function Map() {
            emit(
                this.identifier,
                (this.action === 'uninstall' ? {install: 0, uninstall: 1} : { install: 1, uninstall: 0})
            );
        },
        function Reduce(key, values) {
            var reduced = {install: 0, uninstall: 0};

            values.forEach(function(val) {
                reduced.install += val.install;
                reduced.uninstall += val.uninstall;
            });

            return reduced;
        },
        {
            query : { "date" : { "$gt" : lastweek } },
            out : { inline : 1 }
        },
        done
    );
};

router.init = function init(database) {
    db = database;
    getUsageStatistics();
};

setInterval(function() {
    getUsageStatistics();
}, 900000); // refresh every 15mn


module.exports = router;

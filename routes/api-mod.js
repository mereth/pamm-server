var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var JSZip = require('jszip');
var os = require('os');
var path = require('path');
var request = require('request');
var _ = require('lodash');

var router = express.Router();
var db;

var properties = [
    // Uber
    'context',
    'identifier',
    'author',
    'version',
    'display_name',
    'description',
    'dependencies',
    // PAMM
    'build',
    'date',
    'display_name_de',
    'display_name_fr',
    'display_name_nl',
    'description_de',
    'description_fr',
    'description_nl',
    'forum',
    'category',
    'icon',
    'url'
];

router.get('/', function(req, res) {
    db = req.database;
    db.collection('mods').find({}).toArray(function(err, mods) {
        if(err) throw err;
        _.forEach(mods, function(mod) {
            delete mod._id;
            delete mod.owner;
        });
        
        mods = _.sortBy(mods, ['context', 'identifier']);
        
        res.send(mods);
    })
});

router.post('/', ensureAuthenticated, function(req, res, next) {
    db = req.database;
    
    var url = req.body.modurl;
    var ticket = req.body.ticket;
    var identifier = req.body.identifier;
    
    var submission = req.session.submission;
    
    if(url) {
        checkorg(req, function() {
            download(url, function(err, data) {
                if(err) return next(err);
                
                var ticket = crypto.randomBytes(10).toString('hex');
                extract(data, function(err, modinfos) {
                    if(err) return next(err);
                    
                    analyze(req, modinfos, function(err, data) {
                        if(err) return next(err);
                        
                        var submission = {
                            ticket: ticket,
                            url: url,
                            mods: modinfos
                        };
                        req.session.submission = submission;
                        res.send(submission);
                    });
                });
            });
        });
    }
    else if(ticket && identifier) {
        if(!submission)
            throw new Error("No submission found.");
        if(submission.ticket !== ticket)
            throw new Error("Invalid ticket provided.");
        
        var modinfo = _.find(submission.mods, function(modinfo) {
            return (modinfo.identifier === identifier)
        });
        
        modinfo = _.pick(modinfo, properties);
        modinfo.url = submission.url;
        modinfo.owner = req.user._id;
        
        publish(modinfo, function(err) {
            if(err) return next(err);
            analyze(req, submission.mods, function(err) {
                res.send(submission);
            });
        });
    }
    else {
        throw new Error("Bad parameters.");
    }
});

var checkorg = function(req, done) {
    var user = req.user;
    var session = req.session;
    
    var options = {
        url: 'https://api.github.com/users/' + user.username + '/orgs',
        headers: {
            'User-Agent': 'PAMM-SERVER',
            'Authorization': 'token ' + user.accessToken
        },
        json: true
    };
    
    request(options, function(error, response, body) {
        session.orgmember = false;
        if (!error && response.statusCode == 200) {
            for(var i = 0; i < body.length; ++i) {
                var org = body[i];
                if(org.id === 5934226) {
                    session.orgmember = true;
                    break;
                }
            }
        }
        
        done();
    });
};

var download = function(url, done) {
    request({url: url, encoding: null}, function (error, response, body) {
        done(error, body);
    });
};

var extract = function(zipdata, done) {
    try {
        var zip = new JSZip(zipdata);
        
        // zip.folders not reliable, some directories are not detected as directory (eg. instant_sandbox zip)
        
        // digging modinfo files
        modinfofiles = _.filter(zip.files, function(file) {
            var filepath = file.name;
            return path.basename(filepath) === 'modinfo.json'
        });
        
        var modinfos = [];
        
        _.forEach(modinfofiles, function(modinfofile) {
            var modinfo = JSON.parse(modinfofile.asText());
            modinfo.path = modinfofile.name;
            modinfos.push(modinfo);
        });
        
        done(null, modinfos);
    }
    catch(err) {
        done(err);
    }
};

var analyze = function(req, modinfos, done) {
    var user = req.user;
    var orgmember = req.session.orgmember;
    var identifiers = _.pluck(modinfos, 'identifier');
    db.collection('mods').find({ _id: { '$in': identifiers } }).toArray(function(err, mods) {
        if(err) return done(err, null);
        
        mods = _.indexBy(mods, 'identifier');
        
        _.forEach(modinfos, function(modinfo) {
            var identifier = modinfo.identifier;
            var mod = mods[identifier];
            if(mod) {
                modinfo.dbversion = mod.version;
            }
            
            if(!mod) {
                modinfo.status = 'new';
                if(modinfo.identifier.indexOf('com.uberent.pa.mods.stockmods.') === 0) {
                    modinfo.status = 'invalid';
                    modinfo.error = 'Reserved identifier prefix: com.uberent.pa.mods.stockmods';
                }
            }
            else if(modinfo.version === mod.version) {
                modinfo.status = 'published'
            }
            else {
                if(!orgmember && mod.owner !== user._id) {
                    modinfo.status = 'unauthorized'
                }
                else {
                    modinfo.status = 'update'
                }
            }
        });
        
        done(null, modinfos);
    });
}

var publish = function(modinfo, done) {
    modinfo._id = modinfo.identifier;
    db.collection('mods').save(modinfo, function(err) {
        done(err);
    });
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/auth/login')
}


module.exports = router;

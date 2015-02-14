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
    db.collection('mods').find({enabled: { $ne: false }}).toArray(function(err, mods) {
        if(err) throw err;
        _.forEach(mods, function(mod) {
            delete mod._id;
            delete mod.owner;
        });
        
        mods = _.sortBy(mods, ['context', 'identifier']);
        
        res.send(mods);
    });
});

router.post('/', ensureAuthenticated, function(req, res, next) {
    db = req.database;
    
    var url = req.body.modurl;
    var ticket = req.body.ticket;
    var action = req.body.action;
    var identifier = req.body.identifier;
    
    var submission = req.session.submission;
    
    if(url) {
        var ticket = crypto.randomBytes(10).toString('hex');
        
        checkorg(req, function() {
            if(url.indexOf('http') === 0) {
                download(url, function(err, data) {
                    if(err) return next(err);

                    extract(data, function(err, modinfos) {
                        if(err) return next(err);

                        analyze(req, modinfos, function(err) {
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
            }
            else {
                var idregex = '^' + url.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '.*';
                db.collection('mods').find({_id: { $regex: idregex }}).toArray(function(err, modinfos) {
                    if(err) return next(err);
                    if(!modinfos.length) return next(new Error("No mods found for this identifier."));

                    analyze(req, modinfos, function(err) {
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
            }
        });
    }
    else if(ticket && action && identifier) {
        if(!submission)
            throw new Error("No submission found.");
        if(submission.ticket !== ticket)
            throw new Error("Invalid ticket provided.");
        
        analyze(req, submission.mods, function(err) {
            if(err) return next(err);
            
            var modinfo = _.find(submission.mods, function(modinfo) {
                return (modinfo.identifier === identifier);
            });
            
            if(action === "publish") {
                if(modinfo.status !== "new" && modinfo.status !== "update") {
                    return next(new Error("Invalid mod status: " + modinfo.status));
                }
                
                publish(req, submission.url, modinfo, function(err) {
                    if(err) return next(err);
                    res.send(submission);
                });
            }
            else if(action === "disable") {
                if(modinfo.status !== "published") {
                    return next(new Error("Invalid mod status: " + modinfo.status));
                }
                
                disable(req, modinfo, function(err) {
                    if(err) return next(err);
                    res.send(submission);
                });
            }
            else if(action === "enable") {
                if(modinfo.status !== "disabled") {
                    return next(new Error("Invalid mod status: " + modinfo.status));
                }
                
                enable(req, modinfo, function(err) {
                    if(err) return next(err);
                    res.send(submission);
                });
            }
            else {
                return next(new Error("Invalid action parameter: " + action));
            }
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
        url: 'https://api.github.com/user/orgs',
        headers: {
            'User-Agent': 'PAMM-SERVER',
            'Authorization': 'token ' + user.accessToken
        },
        json: true
    };
    
    request(options, function(error, response, body) {
        session.orgmember = false;
        if (!error && response.statusCode === 200) {
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
    var killed = false;
    request({url: url, encoding: null}, function (error, response, body) {
        if(killed) return;
        done(error, body);
    })
    .on('response', function(res) {
        var contentType = res.headers['content-type'];
        if(contentType !== 'application/zip' && contentType !== 'application/x-zip-compressed' && contentType !== 'application/octet-stream') {
            killed = true;
            res.destroy();
            done(new Error('Your mod must be packaged as a zip archive. Unsupported content type: ' + contentType));
            return;
        }
        
        var totalSize = Number(res.headers['content-length']);
        if(totalSize > 10485760) { // 1024 * 1024 * 10 = 10MiB
            killed = true;
            res.destroy();
            done(new Error('Sorry, maximum mod size is currently 10MiB, please contact a PAMM administrator.'));
            return;
        }
    });
};

var extract = function(zipdata, done) {
    try {
        var zip = new JSZip(zipdata);
        
        // zip.folders not reliable, some directories are not detected as directory (eg. instant_sandbox zip)
        
        // digging modinfo files
        modinfofiles = _.filter(zip.files, function(file) {
            var filepath = file.name;
            return path.basename(filepath) === 'modinfo.json';
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
        if(err) return done(err);
        
        mods = _.indexBy(mods, 'identifier');
        
        _.forEach(modinfos, function(modinfo) {
            var identifier = modinfo.identifier;
            var mod = mods[identifier];
            if(mod) {
                modinfo.dbversion = mod.version;
            }
            
            modinfo.errors = [];
            modinfo.warnings = [];
            
            if(!mod) {
                modinfo.status = 'new';
                if(modinfo.identifier.indexOf('com.uberent.pa.mods.stockmods') === 0) {
                    modinfo.status = 'invalid';
                    modinfo.errors.push('Reserved identifier prefix: <var>com.uberent.pa.mods.stockmods.*</var>');
                }
            }
            else if(!orgmember && mod.owner !== user._id) {
                modinfo.status = 'unauthorized';
                modinfo.errors.push('You are not authorized to update this mod, please contact a PAMM maintainer on PA forum.');
            }
            else {
                if(modinfo.version === mod.version) {
                    if(mod.enabled === false) {
                        modinfo.status = 'disabled';
                    }
                    else {
                        modinfo.status = 'published';
                    }
                }
                else {
                    modinfo.status = 'update';
                }
            }
        });
        
        done();
    });
};

var publish = function(req, url, modinfo, done) {
    var cleanModinfo = _.pick(modinfo, properties);
    cleanModinfo.url = url;
    cleanModinfo.owner = req.user._id;
    cleanModinfo._id = cleanModinfo.identifier;
    
    db.collection('mods').save(cleanModinfo, function(err) {
        if(err) return done(err);
        registerEvent(cleanModinfo, 'mod-publish');
        modinfo.status = "published";
        done();
    });
};

var disable = function(req, modinfo, done) {
    var identifier = modinfo.identifier;
    db.collection('mods').findOne({_id: identifier}, function(err, mod) {
        if(err) return done(err);
        mod.owner = req.user._id;
        mod.enabled = false;
        db.collection('mods').save(mod, function(err) {
            if(err) return done(err);
            registerEvent(mod, 'mod-disable');
            modinfo.status = "disabled";
            done();
        });
    });
};

var enable = function(req, modinfo, done) {
    var identifier = modinfo.identifier;
    db.collection('mods').findOne({_id: identifier}, function(err, mod) {
        if(err) return done(err);
        mod.owner = req.user._id;
        delete mod.enabled;
        db.collection('mods').save(mod, function(err) {
            if(err) return done(err);
            registerEvent(mod, 'mod-enable');
            modinfo.status = "published";
            done();
        });
    });
};

var registerEvent = function(mod, eventname) {
    db.collection('events').insert({
        date: new Date(),
        event: eventname,
        user: mod.owner,
        mod: {
            identifier: mod.identifier,
            version: mod.version
        }
    }
    ,function(err) {
        if(err) {
            console.log('# registerEvent: ' + err);
        }
    });
};

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/auth/login');
}


module.exports = router;

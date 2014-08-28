var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

/* GET mod page. */
router.get('/mod', ensureAuthenticated, function(req, res) {
    res.render('mod', { testurl: 'https://github.com/mereth/pa-mods/archive/master.zip', title: 'PA Mod Submission' });
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/auth/login')
}

module.exports = router;

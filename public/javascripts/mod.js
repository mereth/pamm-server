$(function() {
    var model = {
        url: ko.observable('https://github.com/mereth/pa-mods/archive/master.zip'),
        ticket: ko.observable(),
        mods: ko.observableArray(),
        
        submitting: ko.observable(false),
        submit: function() {
            var self = this;
            self.submitting(true);
            $.post('/api/mod', { modurl: model.url() }, function(data) {
                mapdata(data);
                self.submitting(false);
            });
        }
    }
    
    var mapdata = function(data) {
        model.ticket(data.ticket);
        model.mods.removeAll();
        for(var i=0; i<data.mods.length; ++i) {
            var mod = data.mods[i];
            mod.statusDisplay = function() {
                return this.status + (this.status === "update" ? " (" + this.dbversion + ")" : "")
            };
            mod.publish = function() {
                $.post('/api/mod', { ticket: model.ticket, identifier: this.identifier }, function(data) {
                    mapdata(data);
                });
            }
            model.mods.push(mod);
        }
    }
    
    ko.applyBindings(model);
});
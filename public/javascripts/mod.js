$(function() {
    var model = {
        url: ko.observable(''),
        ticket: ko.observable(),
        mods: ko.observableArray(),
        
        error: ko.observable(),
        
        submitting: ko.observable(false),
        submit: function() {
            var self = this;
            
            if(self.ticket() || self.submitting()) return;
            
            self.error('');
            self.submitting(true);
            $.post('/api/mod', { modurl: model.url() }, function(data) {
                mapdata(data);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                var error;
                try {
                    error = JSON.parse(jqXHR.responseText);
                }
                catch(e) {}
                
                if(error)
                    self.error(error.message);
                else
                    self.error(errorThrown);
            })
            .always(function() {
                self.submitting(false);
            });;
        },
        clear: function() {
            this.url('');
            this.error('');
            this.mods.removeAll();
            this.ticket(null);
        }
    };
    
    model.isPamodsUrl = ko.computed(function() {
        return model.url().match(/https?:\/\/pamods.github.io\//gi);
    });
    
    model.isWrongGithubUsage = ko.computed(function() {
        var url = model.url();
        
        var regex = /https?:\/\/github.com\/[^/]+\/[^/]+\/([^/]+)\//gi;
        var matches = regex.exec(url);
        if(matches) {
            if(matches[1] === "archive" || matches[1] === "releases") return false;
            return true;
        }
        
        if(url.match(/https?:\/\/raw.githubusercontent.com/g)) {
            return true;
        }
        
        return false;
    });
    
    var doModAction = function(action) {
        model.error('');
        $.post('/api/mod', { ticket: model.ticket, identifier: this.identifier, action: action }, function(data) {
            mapdata(data);
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            var error;
            try {
                error = JSON.parse(jqXHR.responseText);
            }
            catch(e) {}

            if(error)
                model.error(error.message);
            else
                model.error(errorThrown);
        });
    };
    
    var mapdata = function(data) {
        model.ticket(data.ticket);
        model.mods.removeAll();
        for(var i=0; i<data.mods.length; ++i) {
            var mod = data.mods[i];
            mod.categoriesDisplay = function() {
                return mod.category ? mod.category.join(', ').toUpperCase() : '';
            };
            mod.statusDisplay = function() {
                return this.status + (this.status === "update" ? " (" + this.dbversion + ")" : "");
            };
            mod.publish = function() {
                doModAction.apply(this, ['publish']);
            };
            mod.disable = function() {
                doModAction.apply(this, ['disable']);
            };
            mod.enable = function() {
                doModAction.apply(this, ['enable']);
            };
            model.mods.push(mod);
        }
    };
    
    $("#modurl").on("keyup", "input", function(e) {
        if (e.which === 13 && !model.ticket()) {
            $("#modurl button").trigger('click');
        }
    });
    
    ko.applyBindings(model);
});
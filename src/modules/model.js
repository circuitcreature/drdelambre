/* {"requires": ["dd"]} */
// $dd.model
//		teh bones of any awesome web app. replaces the $dd.object paradigm
//		to reduce scope bugs and allow easier state migration through simple
//		objects. I've used the watch interface pretty extensively with knockout,
//		but admit i haven't thought the interface all the way through.
;(function(){
	// stuff to exclude from the serialization
	// and an interface for connecting watchables
	var blacklist = /^(_.*|def|pre|post|serialize|extend|map|type|watch|errors|validate)$/,
		watchInterface = {
			observe: function(val){ return val; },
			unwrap: function(val){ return val; },
			read: function(vari){ return vari; },
			write: function(vari,val){ vari = val; }
		};

	// lets only add clean data to our models
	function _cleanNumbers(obj){
		var type = $dd.type(obj),
			ni;

		if(/^(b.*|nu.*|f.*)$/.test(type)){
			return obj;
		}

		if(type === 'string'){
			if(!obj || obj === 'null'){
				obj = null;
			} else if(!isNaN(parseFloat(obj)) && isFinite(obj)){
				return parseFloat(obj);
			}

			return obj;
		}

		if(type === 'array'){
			for(ni = 0; ni < obj.length; ni++){
				obj[ni] = _cleanNumbers(obj[ni]);
			}
		}

		if(type === 'object'){
			for(ni in obj){
				obj[ni] = _cleanNumbers(obj[ni]);
			}
		}

		return obj;
	}

	// something needed to normalize knockout stuff
	function _cleanRead(model,key){
		if(model.def[key].watch){
			return watchInterface.read(model[key]);
		}
		return model[key];
	}
	// something needed to normalize knockout stuff
	function _cleanWrite(model,key,val){
		if(model.def[key].watch){
			watchInterface.write(model[key],val);
		} else {
			model[key] = val;
		}
	}

	// does the heavy lifting for importing an object into a model
	function _sin(model,data){
		var ni, na, no, a;
		if(!data){
			// reset to default values
			for(ni in model.def){
				_cleanWrite(model,ni,model.def[ni]['default']);
			}
			return model;
		}

		for(ni = 0; ni < model._pre.length; ni++){
			if(!model._pre[ni].after){
				model._pre[ni].fun(data);
			}
		}

		for(ni in model.def){
			na = ni;
			for(no = 0; no < model.def[ni].external.length; no++){
				if(!data.hasOwnProperty(model.def[ni].external[no])){
					continue;
				}
				na = model.def[ni].external[no];
				break;
			}
			//catch when ni=na and !data[na]
			if(!data.hasOwnProperty(na)){
				continue;
			}

			a = null;
			if(!model.def[ni].type){
				_cleanWrite(model,ni,_cleanNumbers(data[na]));
				continue;
			}
			if(!$dd.type(model.def[ni]['default'], 'array')){
				if(model.def[ni].type === Date){
					if($dd.type(data[na],'date')){
						_cleanWrite(model,ni, new model.def[ni].type(new Date(data[na].valueOf())));
					} else if($dd.type(data[na],'string') && !isNaN(Date.parse(data[na].replace('-','/')))){
						_cleanWrite(model,ni, new model.def[ni].type(new Date(data[na].replace('-','/'))));
					}
					continue;
				}
				_cleanWrite(model,ni, new model.def[ni].type(data[na]));
				continue;
			}

			a = [];
			data[na] = data[na]||[];
			for(no = 0; no < data[na].length; no++){
				if(model.def[ni].type === Date){
					if($dd.type(data[na][no],'date')){
						_cleanWrite(model,ni, new model.def[ni].type(new Date(data[na][no].valueOf())));
					} else if($dd.type(data[na][no],'string') && !isNaN(Date.parse(data[na][no].replace('-','/')))){
						_cleanWrite(model,ni, new model.def[ni].type(new Date(data[na][no].replace('-','/'))));
					}
					continue;
				}
				a.push(new model.def[ni].type(data[na][no]));
			}

			_cleanWrite(model,ni,a);
		}

		for(ni = 0; ni < model._pre.length; ni++){
			if(model._pre[ni].after){
				model._pre[ni].fun(data);
			}
		}

		return model;
	}

	// does the same as _sin, but for exporting
	function _sout(model){
		var obj = {},
			uwrap = watchInterface.unwrap,
			tmp, ni, na, no, a;

		for(ni = 0; ni < model._post.length; ni++){
			if(model._post[ni].fire_before){
				model._post[ni](obj);
			}
		}

		for(ni in model.def){
			if(blacklist.test(ni)){
				continue;
			}

			tmp = uwrap(model[ni]);

			na = model.def[ni].external[0]||ni;

			//gotta look for models WITHIN models
			if(!tmp){
				obj[na] = tmp;
			} else if(tmp.hasOwnProperty('serialize')){
				obj[na] = tmp.serialize();
			} else if($dd.type(tmp,'array')){
				obj[na] = [];
				for(no = 0; no < tmp.length; no++){
					a = uwrap(tmp[no]);
					if($dd.type(a,'function')){
						continue;
					}
					if($dd.type(a,'date')){
						a = a.toISOString();
					}
					if($dd.type(a,'object') && a.hasOwnProperty('serialize')){
						a = a.serialize();
					}
					obj[na].push(a);
				}
			} else if($dd.type(tmp,'date')){
				obj[na] = tmp.toISOString();
			} else if($dd.type(tmp,'object')){
				obj[na] = {};
				for(no in tmp){
					a = uwrap(tmp[no]);
					if($dd.type(a,'function')){
						continue;
					}
					if($dd.type(a,'object') && a.hasOwnProperty('serialize')){
						a = a.serialize();
					}
					obj[na][no] = a;
				}
			} else {
				if($dd.type(tmp,'function')){
					continue;
				}
				obj[na] = tmp;
			}
		}

		for(ni = 0; ni < model._post.length; ni++){
			if(!model._post[ni].fire_before){
				model._post[ni](obj);
			}
		}

		return obj;
	}

	// mmmmmm factory
	var ret = function(def){
		var self = {
			_pre: [],
			_post: [],
			errors: [],
			def: {}
		};

		// all these functions chain!!!! GO NUTS!
		self.serialize = function(data){
			// no arguments, you export data from the model
			// with an object, you import
			if(arguments.length === 0){
				return _sout(self);
			}
			return _sin(self,data);
		};
		self.extend = function(_def){
			// use models to make bigger models!
			var ni;
			for(ni in _def){
				if(blacklist.test(ni)){
					continue;
				}
				if(ni in self.def){
					continue;
				}

				self.def[ni] = {
					'default':$dd.clone(_def[ni]),
					watch: false,
					type: null,
					external: [],
					validation: []
				};

				self[ni] = _def[ni];
			}

			return self;
		};
		self.attach = function(_obj){
			for(var ni in _obj){
				if(blacklist.test(ni) || ni in self.def){
					continue;
				}
				self[ni] = _obj[ni];
			}
			return self;
		};
		self.map = function(_maps){
			// internal name on the left side, external on the right
			// for keeping your clean data model in sync with your ugly api
			for(var ni in _maps){
				if(!self.def.hasOwnProperty(ni)){
					continue;
				}
				if(!$dd.type(_maps[ni],'array')){
					_maps[ni] = [_maps[ni]];
				}
				self.def[ni].external = _maps[ni];
			}
			return self;
		};
		self.type = function(_types){
			// to have hierarchical chains of models, we need to be able
			// to specify a model type for those properties
			for(var ni in _types){
				if(!self.def.hasOwnProperty(ni)){
					continue;
				}
				self.def[ni].type = _types[ni];
			}
			return self;
		};
		//needs to be renamed 'on_in'
		self.pre = function(filter,fire_after){
			// here we add filters that edit the json data before it enters
			self._pre.push({
				fun: filter,
				after: fire_after?1:0
			});
			return self;
		};
		//needs to be renamed 'on_out'
		self.post = function(filter,fire_before){
			// here we add filters that edit the json data before it leaves
			self._post.push({
				fun: filter,
				after: fire_before?1:0
			});
			return self;
		};
		self.watch = function(_map){
			var ni;
			//make all the things observable!
			if(!arguments.length){
				_map = {};
				for(ni in self.def){
					_map[ni] = true;
				}
			}
			// this bad boy controls which properties are observable
			for(ni in _map){
				if(!self.def.hasOwnProperty(ni)){
					continue;
				}
				if(_map[ni] === self.def[ni].watch){
					continue;
				}
				self.def[ni].watch = _map[ni];
				if(_map[ni]){
					self[ni] = watchInterface.observe(self[ni]);
				} else {
					self[ni] = watchInterface.unwrap(self[ni]);
				}
			}
			return self;
		};
		self.validate = function(_map){
			var ni,no,v,e;
			if(!arguments.length){
				self.errors = [];

				for(ni in self.def){
					v = self.def[ni].validation||[];
					for(no = 0; no < v.length; no++){
						e = v[no](_cleanRead(self,ni));
						if(!$dd.type(e,'array')){
							continue;
						}
						self.errors = self.errors.concat(e);
					}
				}
				if(!self.errors.length){
					return true;
				}
				return false;
			}

			for(ni in _map){
				self.def[ni].validation.push(_map[ni]);
			}

			return self;
		};

		//initialization
		return self.extend(def);
	};
	ret.watchInterface = function(_interface){
		watchInterface = _interface;
		return ret;
	};

	$dd.mixin({
		model : ret
	});
})();


// WARNING: DO NOT EDIT THIS FILE! IT IS AUTO-GENERATED FROM ./loader.js BY STRIPPING '/*DEBUG*/' LINES.


/**
 * Copyright: 2011 Christoph Dorn <christoph@christophdorn.com>
 * License: MIT
 */


// Ignore all globals except for `require`, `exports` and `sourcemint`.
// Declare `require` global but ignore if it already exists.
var require;
// Set `sourcemint` global no matter what.
var sourcemint = null;
// Combat pollution if used via <script> tag.
(function (global, document) {

	var loadedBundles = [],
		// @see https://github.com/unscriptable/curl/blob/62caf808a8fd358ec782693399670be6806f1845/src/curl.js#L69
		readyStates = { 'loaded': 1, 'interactive': 1, 'complete': 1 };


	// A set of modules working together.
	var Sandbox = function(sandboxIdentifier, loadedCallback, sandboxOptions) {

		var moduleInitializers = {},
			initializedModules = {},
			packages = {},
			headTag;

		var sandbox = {
				id: sandboxIdentifier
			};


		// These may be overwritten by the environment of the loader.
		// Defaults to browser use.
		// @credit https://github.com/unscriptable/curl/blob/62caf808a8fd358ec782693399670be6806f1845/src/curl.js#L319-360
		function loadInBrowser(uri, loadedCallback) {
			if (!headTag) {
				headTag = document.getElementsByTagName("head")[0];
			}
			uri = document.location.protocol + "/" + uri;
			var element = document.createElement("script");
			element.type = "text/javascript";
			element.onload = element.onreadystatechange = function(ev) {
				ev = ev || global.event;
				if (ev.type === "load" || readyStates[this.readyState]) {
					this.onload = this.onreadystatechange = this.onerror = null;
					loadedCallback();
				}
			}
			element.onerror = function(e) {
			}
			element.charset = "utf-8";
			element.async = true;
			element.src = uri;
			headTag.insertBefore(element, headTag.firstChild);
			return element;
		}

		function load(sandboxIdentifier, loadedCallback) {
				(sandboxOptions.load || loadInBrowser)(sandboxIdentifier, function() {
					// Assume a consistent statically linked set of modules has been memoized.
					var key;
					for (key in loadedBundles[0][1]) {
						moduleInitializers[key] = loadedBundles[0][1][key];
					}
					loadedBundles.shift();
					loadedCallback(sandbox);
				})
		}


		var Package = function(packageIdentifier) {
			if (packages[packageIdentifier]) {
				return packages[packageIdentifier];
			}
			
			var descriptor = moduleInitializers[packageIdentifier + "/package.json"] || {
					main: "/main.js"
				},
				mappings = descriptor.mappings || {},
				directories = descriptor.directories || {},
				libPath = (typeof directories.lib !== "undefined")?directories.lib:"lib";
			
			var pkg = {
				sandbox: sandboxIdentifier,
				main: descriptor.main
			};

			var Module = function(moduleIdentifier) {

				var moduleIdentifierSegment = moduleIdentifier.replace(/\/[^\/]*$/, "/").split("/"),
					module = {
						id: [sandbox.id, moduleIdentifier],
						exports: {}
					};

				function normalizeIdentifier(identifier) {
					// Only append `.js` if module name does not contain a period.
					return identifier + ((identifier.split("/").pop().indexOf(".")===-1)?".js":"");
				}
				
				function resolveIdentifier(identifier) {
					// Check for relative module path to module within same package.
					if (/^\./.test(identifier)) {
						var segments = identifier.replace(/^\.\//, "").split("../");
						identifier = moduleIdentifierSegment.slice(0, moduleIdentifierSegment.length-segments.length-1) + "/" + segments[segments.length-1];
						return [pkg, normalizeIdentifier(identifier)];
					} else
					// Check for mapped module path to module within mapped package.
					{
						identifier = identifier.split("/");
						return [Package(mappings[identifier[0]]), normalizeIdentifier(identifier.slice(1).join("/"))];
					}
				}

				// Statically link a module and its dependencies
				module.require = function(identifier) {
					identifier = resolveIdentifier(identifier);
					return identifier[0].require(identifier[1]).exports;
				};

				module.require.uri = function(identifier) {
					identifier = resolveIdentifier(identifier);
					return [identifier[0].sandbox, identifier[1]];
				};

				module.require.async = function(identifier, loadedCallback) {
					identifier = resolveIdentifier(identifier);
					load(identifier[0].sandbox + identifier[1], function() {
						loadedCallback(identifier[0].require(identifier[1]).exports);
					});
				};

				module.require.sandbox = sourcemint.sandbox;

				module.load = function() {
					if (typeof moduleInitializers[moduleIdentifier] === "function") {
						
						var moduleInterface = {
							id: module.id
						}

						if (sandboxOptions.onInitModule) {
							sandboxOptions.onInitModule(moduleInterface, module, pkg, sandbox);
						}

						var exports = moduleInitializers[moduleIdentifier](module.require, module.exports, moduleInterface);
						if (typeof exports !== "undefined") {
							module.exports = exports;
						}
					} else
					if (typeof moduleInitializers[moduleIdentifier] === "string") {
						// TODO: Use more optimal string encoding algorythm to reduce payload size?
						module.exports = decodeURIComponent(moduleInitializers[moduleIdentifier]);
					} else {
						module.exports = moduleInitializers[moduleIdentifier];
					}
				};


				return module;
			};

			pkg.require = function(moduleIdentifier) {
				if (!/^\//.test(moduleIdentifier)) {
					moduleIdentifier = "/" + ((libPath)?libPath+"/":"") + moduleIdentifier;
				}
				moduleIdentifier = packageIdentifier + moduleIdentifier;
				if (!initializedModules[moduleIdentifier]) {
					(initializedModules[moduleIdentifier] = Module(moduleIdentifier)).load();
				}
				return initializedModules[moduleIdentifier];
			}
			
			
			packages[packageIdentifier] = pkg;

			return pkg;
		}

		// Get a module and initialize it (statically link its dependencies) if it is not already so
		sandbox.require = function(moduleIdentifier) {
			return Package("").require(moduleIdentifier);
		}

		// Call the 'main' module of the program
		sandbox.main = function(options) {
			return sandbox.require(Package("").main).exports.main(options);
		};


		load(sandboxIdentifier + ".js", loadedCallback);

		return sandbox;
	};


	// The global `require` for the 'external' (to the loader) environment.
	var Loader = function() {

		var 
			sandboxes = {};

		var Require = function(bundle) {

				// Address a specific sandbox or currently loading sandbox if initial load.
				this.bundle = function(uid, callback) {
					var moduleInitializers = {},
						req = new Require(uid);
					// Store raw module in loading bundle
					req.memoize = function(moduleIdentifier, moduleInitializer) {
						moduleInitializers[moduleIdentifier] = moduleInitializer;
					}
					callback(req);
					loadedBundles.push([uid, moduleInitializers]);
				}
			};

		var require = new Require();

		// TODO: @see URL_TO_SPEC
		require.supports = "ucjs2-pinf-0";

		// Create a new environment to memoize modules to.
		require.sandbox = function(programIdentifier, loadedCallback, options) {
			var sandboxIdentifier = programIdentifier.replace(/^[^:]*:\//, "").replace(/\.js$/, "");
			return sandboxes[sandboxIdentifier] = Sandbox(sandboxIdentifier, loadedCallback, options || {});
		}
		

		return require;
	}


	sourcemint = Loader();


	// Ignore `require` global if already exists.
    if (!require) {
        require = sourcemint;
    }

	// Export `require` for CommonJS if `exports` global exists.
	if (typeof exports === "object") {
		exports.require = sourcemint;
	}

}(this, document));
/**
 * Copyright: Christoph Dorn <christoph@christophdorn.com>
 * License: MIT
 */

// NOTE: Remove lines marked /*DEBUG*/ when compiling loader for 'min' release!

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
	var Sandbox = function(sandboxIdentifier, loadedCallback) {

		var bundleIdentifier,
			moduleInitializers = {},
			initializedModules = {},
			packages = {};

		var sandbox = {
				id: sandboxIdentifier
			};

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
				main: descriptor.main
			};

			var Module = function(moduleIdentifier) {

				var moduleIdentifierSegment = moduleIdentifier.replace(/\/[^\/]*$/, "/").split("/"),
					module = {
						id: [sandbox.id, moduleIdentifier],
						exports: {}
					};

				// Statically link a module and its dependencies
				module.require = function(identifier) {
					// Check for relative module path to module within same package
					if (/^\./.test(identifier)) {
						var segments = identifier.replace(/^\.\//, "").split("../");
						identifier = moduleIdentifierSegment.slice(0, moduleIdentifierSegment.length-segments.length-1) + "/" + segments[segments.length-1];
						return pkg.require(identifier + ".js").exports;
					} else
					// Check for mapped module path to module within mapped package
					{
						identifier = identifier.split("/");
						/*DEBUG*/ if (!mappings) {
						/*DEBUG*/ 	throw new Error("Descriptor for sandbox '" + sandbox.id + "' does not declare 'mappings' property needed to resolve module path '" + identifier.join("/") + "' in module '" + moduleIdentifier + "'!");
						/*DEBUG*/ }
						/*DEBUG*/ if (!mappings[identifier[0]]) {
						/*DEBUG*/ 	throw new Error("Descriptor for sandbox '" + sandbox.id + "' does not declare 'mappings[\"" + identifier[0] + "\"]' property needed to resolve module path '" + identifier.join("/") + "' in module '" + moduleIdentifier + "'!");
						/*DEBUG*/ }
						return Package(mappings[identifier[0]]).require(identifier.slice(1).join("/") + ".js").exports;
					}
				};

				module.load = function() {
					if (typeof moduleInitializers[moduleIdentifier] === "function") {
						moduleInitializers[moduleIdentifier](module.require, module.exports, {
							id: module.id
						});
					} else {
						module.exports = moduleInitializers[moduleIdentifier];
					}
				}

				return module;
			};

			pkg.require = function(moduleIdentifier) {
				if (!/^\//.test(moduleIdentifier)) {
					moduleIdentifier = "/" + ((libPath)?libPath+"/":"") + moduleIdentifier;
				}
				moduleIdentifier = packageIdentifier + moduleIdentifier;
				if (!initializedModules[moduleIdentifier]) {
					/*DEBUG*/ if (!moduleInitializers[moduleIdentifier]) {
					/*DEBUG*/ 	throw new Error("Module '" + moduleIdentifier + "' not found in sandbox '" + sandbox.id + "'!");
					/*DEBUG*/ }
					initializedModules[moduleIdentifier] = Module(moduleIdentifier);
					initializedModules[moduleIdentifier].load();
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
			/*DEBUG*/ if (typeof Package("").main !== "string") {
			/*DEBUG*/ 	throw new Error("No 'main' property declared in '/package.json' in sandbox '" + sandbox.id + "'!");
			/*DEBUG*/ }
			/*DEBUG*/ if (typeof sandbox.require(Package("").main).exports.main !== "function") {
			/*DEBUG*/ 	throw new Error("Main module '" + Package("").main + "' does not export 'main()' in sandbox '" + sandbox.id + "'!");
			/*DEBUG*/ }
			return sandbox.require(Package("").main).exports.main(options);
		};		

		sandbox.scriptTag = sourcemint.load(sandboxIdentifier + ".js", function() {
			// Assume a consistent statically linked set of modules has been memoized.
			bundleIdentifier = loadedBundles[0][0];
			moduleInitializers = loadedBundles[0][1];
			loadedBundles.shift();
			loadedCallback(sandbox);
		});

		return sandbox;
	};


	// The global `require` for the 'external' (to the loader) environment.
	var Loader = function() {

		var 
			/*DEBUG*/ bundleIdentifiers = {},
			sandboxes = {};

		var Require = function(bundle) {

				// Address a specific sandbox or currently loading sandbox if initial load.
				this.bundle = function(uid, callback) {
					/*DEBUG*/ if (bundle) {
					/*DEBUG*/ 	throw new Error("You cannot nest require.bundle() calls!");
					/*DEBUG*/ }
					/*DEBUG*/ if (uid && bundleIdentifiers[uid]) {
					/*DEBUG*/ 	throw new Error("You cannot split require.bundle(UID) calls where UID is constant!");
					/*DEBUG*/ }
					/*DEBUG*/ bundleIdentifiers[uid] = true;
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
		require.sandbox = function(programIdentifier, loadedCallback) {
			var sandboxIdentifier = programIdentifier.replace(/^[^:]*:\//, "").replace(/\.js$/, "");
			return sandboxes[sandboxIdentifier] = Sandbox(sandboxIdentifier, loadedCallback);
		}

		return require;
	}


	sourcemint = Loader();


	// These may be overwritten by the environment of the loader.
	// Defaults to browser use.
	// @credit https://github.com/unscriptable/curl/blob/62caf808a8fd358ec782693399670be6806f1845/src/curl.js#L319-360
	var _head = null;
	sourcemint.load = function(uri, loadedCallback) {
		if (_head === null) {
			_head = document.getElementsByTagName("head")[0];
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
			/*DEBUG*/ throw new Error("Syntax error or http error: " + uri);
		}
		element.charset = "utf-8";
		element.async = true;
		element.src = uri;
		_head.insertBefore(element, _head.firstChild);
		return element;
	}


	// Ignore `require` global if already exists.
    if (!require) {
        require = sourcemint;
    }

	// Export `require` for CommonJS if `exports` global exists.
	if (typeof exports === "object") {
		exports.require = sourcemint;
	}

}(this, document));
/**
 * Copyright: 2011 Christoph Dorn <christoph@christophdorn.com>
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
	var Sandbox = function(sandboxIdentifier, loadedCallback, sandboxOptions) {

		var moduleInitializers = {},
			initializedModules = {},
			/*DEBUG*/ bundleIdentifiers = {},
			packages = {},
			headTag,
			loadingBundles = {};

		var sandbox = {
				id: sandboxIdentifier
			};


		// @credit https://github.com/unscriptable/curl/blob/62caf808a8fd358ec782693399670be6806f1845/src/curl.js#L319-360
		function loadInBrowser(uri, loadedCallback) {
			if (!headTag) {
				headTag = document.getElementsByTagName("head")[0];
			}
			if (/^\//.test(uri)) {
				uri = document.location.protocol + "/" + uri;
			}
			var element = document.createElement("script");
			element.type = "text/javascript";
			element.onload = element.onreadystatechange = function(ev) {
				ev = ev || global.event;
				if (ev.type === "load" || readyStates[this.readyState]) {
					this.onload = this.onreadystatechange = this.onerror = null;
					loadedCallback(function() {
						element.parentNode.removeChild(element);
					});
				}
			}
			element.onerror = function(e) {
				/*DEBUG*/ throw new Error("Syntax error or http error: " + uri);
			}
			element.charset = "utf-8";
			element.async = true;
			element.src = uri;
			element = headTag.insertBefore(element, headTag.firstChild);
		}

		function load(bundleIdentifier, packageIdentifier, loadedCallback) {
            if (packageIdentifier !== "") {
                bundleIdentifier = "/" + packageIdentifier + bundleIdentifier;
            }
			if (initializedModules[bundleIdentifier]) {
				// Module is already loaded and initialized.
				loadedCallback(sandbox);
			} else {
				// Module is not initialized.
				if (loadingBundles[bundleIdentifier]) {
					// Module is already loading.
					loadingBundles[bundleIdentifier].push(loadedCallback);
				} else {
					// Module is not already loading.
					loadingBundles[bundleIdentifier] = [];
					bundleIdentifier = sandboxIdentifier + bundleIdentifier;
					// Default to our script-injection browser loader.
					(sandboxOptions.load || loadInBrowser)(bundleIdentifier, function(cleanupCallback) {
						finalizeLoad(bundleIdentifier, packageIdentifier);
						loadedCallback(sandbox);
						if (cleanupCallback) {
							cleanupCallback();
						}
					});
				}
			}
		}

		// Called after a bundle has been loaded. Takes the top bundle off the *loading* stack
		// and makes the new modules available to the sandbox.
		// If a `packageIdentifier` is supplied we prefix it to all module identifiers anchored
		// at the root of the bundle (starting with `/`).
		function finalizeLoad(bundleIdentifier, packageIdentifier)
		{
			// Assume a consistent statically linked set of modules has been memoized.
			/*DEBUG*/ bundleIdentifiers[bundleIdentifier] = loadedBundles[0][0];
			var key;
			for (key in loadedBundles[0][1]) {
				// Only add modules that don't already exist!
				// TODO: Log warning in debug mode if module already exists.
				if (typeof moduleInitializers[key] === "undefined") {
					moduleInitializers[packageIdentifier + key] = loadedBundles[0][1][key];
				}
			}
			loadedBundles.shift();
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
				libPath = (typeof directories.lib !== "undefined" && directories.lib != "")?directories.lib + "/":"";
			
			var pkg = {
				id: packageIdentifier,
				main: descriptor.main
			};

			var Module = function(moduleIdentifier) {

				var moduleIdentifierSegment = moduleIdentifier.replace(/\/[^\/]*$/, "").split("/"),
					module = {
						id: moduleIdentifier,
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
						identifier = "/" + moduleIdentifierSegment.slice(1, moduleIdentifierSegment.length-segments.length+1).concat(segments[segments.length-1]).join("/");
						return [pkg, normalizeIdentifier(identifier)];
					} else
					// Check for mapped module path to module within mapped package.
					{
						identifier = identifier.split("/");
						/*DEBUG*/ if (!mappings) {
						/*DEBUG*/ 	throw new Error("Descriptor for sandbox '" + sandbox.id + "' does not declare 'mappings' property needed to resolve module path '" + identifier.join("/") + "' in module '" + moduleIdentifier + "'!");
						/*DEBUG*/ }
						/*DEBUG*/ if (!mappings[identifier[0]]) {
						/*DEBUG*/ 	throw new Error("Descriptor for sandbox '" + sandbox.id + "' does not declare 'mappings[\"" + identifier[0] + "\"]' property needed to resolve module path '" + identifier.join("/") + "' in module '" + moduleIdentifier + "'!");
						/*DEBUG*/ }
						return [Package(mappings[identifier[0]]), normalizeIdentifier(identifier.slice(1).join("/"))];
					}
				}

				// Statically link a module and its dependencies
				module.require = function(identifier) {
				    // RequireJS compatibility.
				    // TODO: Move this to a plugin to save space here.
				    if (typeof identifier !== "string") {
				        /*DEBUG*/ if (identifier.length > 1) {
			            /*DEBUG*/     throw new Error("Dynamic 'require([])' may only specify one module in module '" + moduleIdentifier + "'!");
				        /*DEBUG*/ }
				        return module.require.async.call(null, identifier[0], arguments[1]);
				    }
					identifier = resolveIdentifier(identifier);
					return identifier[0].require(identifier[1]).exports;
				};

				module.require.id = function(identifier) {
					identifier = resolveIdentifier(identifier);
					return identifier[1];
				};

				module.require.async = function(identifier, loadedCallback) {
					identifier = resolveIdentifier(identifier);
					load(identifier[1], identifier[0].id, function() {
						loadedCallback(identifier[0].require(identifier[1]).exports);							
					});
				};

				module.require.sandbox = function() {
					if (arguments.length === 3)
					{
						arguments[2].load = arguments[2].load || sandboxOptions.load;
					}
					return sourcemint.sandbox.apply(null, arguments);
				}
				module.require.sandbox.id = sandboxIdentifier;

				module.load = function() {
					if (typeof moduleInitializers[moduleIdentifier] === "function") {
						
						var moduleInterface = {
							id: module.id,
							exports: undefined
						}

						if (sandboxOptions.onInitModule) {
							sandboxOptions.onInitModule(moduleInterface, module, pkg, sandbox);
						}

						var exports = moduleInitializers[moduleIdentifier](module.require, module.exports, moduleInterface);
						if (typeof moduleInterface.exports !== "undefined") {
							module.exports = moduleInterface.exports;
						} else
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

				/*DEBUG*/ module.getReport = function() {
				/*DEBUG*/ 	var exportsCount = 0,
				/*DEBUG*/ 		key;
				/*DEBUG*/ 	for (key in module.exports) {
				/*DEBUG*/ 		exportsCount++;
				/*DEBUG*/ 	}
				/*DEBUG*/ 	return {
				/*DEBUG*/ 		exports: exportsCount
				/*DEBUG*/ 	};
				/*DEBUG*/ };

				return module;
			};

			pkg.require = function(moduleIdentifier) {
				var loadingBundlesCallbacks;
				if (!/^\//.test(moduleIdentifier)) {
					moduleIdentifier = "/" + libPath + moduleIdentifier;
				}
				moduleIdentifier = packageIdentifier + moduleIdentifier;
				if (!initializedModules[moduleIdentifier]) {
					/*DEBUG*/ if (!moduleInitializers[moduleIdentifier]) {
					/*DEBUG*/ 	throw new Error("Module '" + moduleIdentifier + "' not found in sandbox '" + sandbox.id + "'!");
					/*DEBUG*/ }
					(initializedModules[moduleIdentifier] = Module(moduleIdentifier)).load();
				}
				if (loadingBundles[moduleIdentifier]) {
					loadingBundlesCallbacks = loadingBundles[moduleIdentifier];
					delete loadingBundles[moduleIdentifier];
					for (i=0;i<loadingBundlesCallbacks.length;i++) {
						loadingBundlesCallbacks[i](sandbox);
					}
				}
				return initializedModules[moduleIdentifier];
			}
			
			/*DEBUG*/ pkg.getReport = function() {
			/*DEBUG*/ 	return {
			/*DEBUG*/ 		mappings: mappings
			/*DEBUG*/ 	};
			/*DEBUG*/ }

			if (sandboxOptions.onInitPackage) {
				sandboxOptions.onInitPackage(pkg, sandbox, {
					finalizeLoad: finalizeLoad
				});
			}

			packages[packageIdentifier] = pkg;

			return pkg;
		}

		// Get a module and initialize it (statically link its dependencies) if it is not already so
		sandbox.require = function(moduleIdentifier) {
			return Package("").require(moduleIdentifier);
		}

		// Call the 'main' module of the program
		sandbox.main = function() {
			/*DEBUG*/ if (typeof Package("").main !== "string") {
			/*DEBUG*/ 	throw new Error("No 'main' property declared in '/package.json' in sandbox '" + sandbox.id + "'!");
			/*DEBUG*/ }
			/*DEBUG*/ if (typeof sandbox.require(Package("").main).exports.main !== "function") {
			/*DEBUG*/ 	throw new Error("Main module '" + Package("").main + "' does not export 'main()' in sandbox '" + sandbox.id + "'!");
			/*DEBUG*/ }
			return sandbox.require(Package("").main).exports.main.apply(null, arguments);
		};

		/*DEBUG*/ sandbox.getReport = function() {
		/*DEBUG*/ 	var report = {
		/*DEBUG*/ 			bundles: {},
		/*DEBUG*/ 			packages: {},
		/*DEBUG*/ 			modules: {}
		/*DEBUG*/ 		},
		/*DEBUG*/ 		key;
		/*DEBUG*/ 	for (key in bundleIdentifiers) {
		/*DEBUG*/ 		report.bundles[key] = bundleIdentifiers[key];
		/*DEBUG*/ 	}
		/*DEBUG*/ 	for (key in packages) {
		/*DEBUG*/ 		report.packages[key] = packages[key].getReport();
		/*DEBUG*/ 	}
		/*DEBUG*/ 	for (key in moduleInitializers) {
		/*DEBUG*/ 		if (initializedModules[key]) {
		/*DEBUG*/ 			report.modules[key] = initializedModules[key].getReport();
		/*DEBUG*/ 		}
		/*DEBUG*/ 	}
		/*DEBUG*/ 	return report;
		/*DEBUG*/ }

		load(".js", "", loadedCallback);

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
					/*DEBUG*/ if (typeof bundle !== "undefined") {
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
		require.supports = [
			"ucjs2-pinf-0"
		];

		// Create a new environment to memoize modules to.
		require.sandbox = function(programIdentifier, loadedCallback, options) {
			var sandboxIdentifier = programIdentifier.replace(/\.js$/, "");
			return sandboxes[sandboxIdentifier] = Sandbox(sandboxIdentifier, loadedCallback, options || {});
		}
		
		/*DEBUG*/ require.getReport = function() {
		/*DEBUG*/ 	var report = {
		/*DEBUG*/ 			sandboxes: {}
		/*DEBUG*/ 		},
		/*DEBUG*/ 		key;
		/*DEBUG*/ 	for (key in sandboxes) {
		/*DEBUG*/ 		report.sandboxes[key] = sandboxes[key].getReport();
		/*DEBUG*/ 	}
		/*DEBUG*/ 	return report;
		/*DEBUG*/ }

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

}(this, (typeof document !== "undefined")?document:null));
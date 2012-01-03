
require.bundle("", function(require)
{
	require.memoize("/main.js", function(require, exports, module)
	{
		exports.main = function(options)
		{
			// TODO: Return a promise that resolves when the sandbox has been run.

			module.log("Hello from 12-Sandbox!");

			var uri = require.uri("./SandboxedExtraBundle");

			require.sandbox(uri.join(""), function(sandbox)
			{
				sandbox.main();
			}, {
				onInitModule: function(moduleInterface)
				{
					moduleInterface.log = function()
					{
						module.logForModule.call(null, moduleInterface, arguments);
					}
				}
			});
		}
	});
});

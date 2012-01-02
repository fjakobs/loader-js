
require.bundle("", function(require)
{
	require.memoize("/main.js", function(require, exports, module)
	{
		exports.main = function(options)
		{
			module.log("Hello from 11-LoadBundle!");

			var extraBundleID = "./ExtraBundle";

			require.async(extraBundleID, function(EXTRA_BUNDLE)
			{
				EXTRA_BUNDLE.init();
			});
		}
	});
});
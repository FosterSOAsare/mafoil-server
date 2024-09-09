const path = require("path");
const nodeExternals = require("webpack-node-externals");
const JavaScriptObfuscator = require("webpack-obfuscator");

module.exports = {
	mode: "production",
	entry: "./src/server.js", // Replace with the entry point of your Node.js app
	target: "node", // Specifies that the bundle should be compatible with Node.js
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "[name].bundle.js", // The bundled output file
		chunkFilename: "[name].[contenthash].chunk.js",
	},
	optimization: {
		splitChunks: {
			chunks: "all", // Apply to both dynamic and initial imports
			minSize: 30000, // Minimum size of a chunk to be split
			maxAsyncRequests: 5, // Maximum async requests
			maxInitialRequests: 3, // Maximum initial requests
			automaticNameDelimiter: "~",
			cacheGroups: {
				vendors: {
					test: /[\\/]node_modules[\\/]/,
					name(module) {
						// Get the name of the module being split
						const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
						return `vendors~${packageName}`;
					},
					chunks: "all",
					enforce: true, // Ensure vendors chunk is created
				},
				default: {
					minChunks: 2,
					priority: -20,
					reuseExistingChunk: true,
					enforce: true, // Ensure default chunk is created only when necessary
				},
			},
		},
	},

	externals: [nodeExternals()], // Exclude node_modules from the bundle
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: "babel-loader",
					options: {
						presets: ["@babel/preset-env"], // Transpile modern JS to older versions for compatibility
					},
				},
			},
		],
	},
	plugins: [
		new JavaScriptObfuscator(
			{
				rotateStringArray: true, // Rotate string arrays to make reverse engineering harder
				stringArray: true,
				stringArrayThreshold: 0.75, // Obfuscate a significant portion of strings
				compact: true, // Minimize the size of the output
				controlFlowFlattening: true, // Increases code complexity
				deadCodeInjection: true, // Injects dead (unreachable) code to increase file size and confuse de-obfuscators
				deadCodeInjectionThreshold: 0.4,
				debugProtection: true, // Prevents the code from running in the developer console
				// debugProtectionInterval: true, // If the code is paused, it will break the debugger
			},
			["excluded_bundle.js"] // Exclude specific files from obfuscation if necessary
		),
	],
	resolve: {
		extensions: [".js"], // Resolve these file extensions
	},
};

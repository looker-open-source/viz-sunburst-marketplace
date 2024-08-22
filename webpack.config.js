var path = require('path')

const TerserPlugin = require('terser-webpack-plugin');

var webpackConfig = {
  mode: 'production',
  entry: {
    sunburst: './src/sunburst/sunburst.ts',
  },
  output: {
    filename: "[name].js",
    path: __dirname,
    library: "[name]",
    libraryTarget: "umd"
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  plugins: [
    new TerserPlugin()
  ],
  module: {
    rules: [
      { test: /\.js$/, loader: "babel-loader" },
      { test: /\.ts$/, loader: "ts-loader" },
      { test: /\.css$/, use: [ {loader: 'to-string-loader'}, {loader: 'css-loader'} ] }
    ]
  },
  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
}

module.exports = webpackConfig

const path = require('path')

module.exports = {
  entry: './assets/exercises.js',
  devtool: 'source-map',
  mode: 'production',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'assets/dist')
  },
  optimization: {
    minimize: true
  },
  externals: {
    'gitbook': 'gitbook'
  }
}

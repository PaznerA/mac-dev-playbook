const path = require('path');

module.exports = (env, argv) => {
  const mode = argv.mode || 'development';

  return {
    mode,
    devtool: mode === 'production' ? false : 'source-map',
    entry: './index.js',
    output: {
      filename: 'homelab-portal.bundle.js',
      path: path.resolve(__dirname, 'dist'),
      library: 'HomelabPortal',
      libraryTarget: 'umd',
      globalObject: 'this',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.js']
    }
  };
};

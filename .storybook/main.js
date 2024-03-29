const { merge } = require('lodash')

module.exports = {
  core: {
    builder: 'webpack5',
  },
  stories: ["../src/**/*.stories.mdx", "../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/preset-create-react-app",
    "@snek-at/storybook-addon-chakra-ui",
    "storybook-dark-mode",
  ],
  webpackFinal: (config) => {
    return merge(config, {
      resolve: {
        fallback: {
          crypto: require.resolve('crypto-browserify'),
          http: require.resolve('stream-http'),
          https: require.resolve('https-browserify'),
          stream: require.resolve('stream-browserify'),
          zlib: require.resolve('browserify-zlib')
        }
      }
    })
  }
};

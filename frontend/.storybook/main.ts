import type { StorybookConfig } from '@storybook/react-webpack5';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  webpackFinal: async (webpackConfig) => {
    webpackConfig.resolve ??= {};
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      '@': new URL('../src', import.meta.url).pathname,
      'next/link': new URL('./next-link.tsx', import.meta.url).pathname,
      '../../components/ui/ToastProvider$': new URL('./toast-provider.tsx', import.meta.url).pathname,
      '../components/ui/ToastProvider$': new URL('./toast-provider.tsx', import.meta.url).pathname,
    };
    webpackConfig.module?.rules?.push({
      test: /\.tsx?$/,
      exclude: /node_modules/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: [
            ['@babel/preset-react', { runtime: 'automatic' }],
            ['@babel/preset-typescript', { allExtensions: true, isTSX: true }],
          ],
        },
      },
    });
    return webpackConfig;
  },
};

export default config;

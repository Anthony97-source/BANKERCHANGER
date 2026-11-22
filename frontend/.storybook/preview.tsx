import type { Preview } from '@storybook/react';
import '../src/app/globals.css';
import { QueryProvider } from '../src/providers/QueryProvider';

const preview: Preview = {
  decorators: [
    (Story) => (
      <QueryProvider>
        <Story />
      </QueryProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;

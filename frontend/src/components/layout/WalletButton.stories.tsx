import type { Meta, StoryObj } from '@storybook/react';
import { WalletButton } from './WalletButton';

const meta = {
  title: 'Components/Button/WalletButton',
  component: WalletButton,
  parameters: {
    docs: {
      description: {
        component: 'Wallet connection and account actions, including keyboard-accessible menus.',
      },
    },
  },
} satisfies Meta<typeof WalletButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connect: Story = {};

import type { Meta, StoryObj } from '@storybook/react';
import { marketFixture } from '../../../.storybook/marketFixture';
import { BetForm } from './BetForm';

const meta = {
  title: 'Components/BetForm',
  component: BetForm,
  args: { market: marketFixture },
  parameters: {
    docs: {
      description: {
        component: 'Outcome and amount selection with validation, payout estimates, and transaction feedback.',
      },
    },
  },
} satisfies Meta<typeof BetForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectWallet: Story = {};
export const ClosedMarket: Story = {
  args: { market: { ...marketFixture, status: 'resolved' } },
};

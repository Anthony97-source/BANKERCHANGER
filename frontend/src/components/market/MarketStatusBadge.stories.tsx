import type { Meta, StoryObj } from '@storybook/react';
import { MarketStatusBadge } from './MarketStatusBadge';

const meta = {
  title: 'Components/Badge/MarketStatusBadge',
  component: MarketStatusBadge,
  args: { status: 'open' },
  parameters: {
    docs: {
      description: {
        component: 'Status badge with a visible label and icon for every market state.',
      },
    },
  },
} satisfies Meta<typeof MarketStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { status: 'open' } };
export const Locked: Story = { args: { status: 'locked' } };
export const Resolved: Story = { args: { status: 'resolved' } };
export const Cancelled: Story = { args: { status: 'cancelled' } };
export const Disputed: Story = { args: { status: 'disputed' } };
